// Validate the standalone runtime library without a WebGL context or source edits.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(project, 'public/models/neo-city');
const sourceRoot = path.join(project, 'asset-sources/city/kitbash3d/neo-city');
const gltf = JSON.parse(fs.readFileSync(path.join(out, 'neo-city.gltf'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json'), 'utf8'));
const buffer = fs.readFileSync(path.join(out, gltf.buffers[0].uri));
const repairCounts = process.argv.includes('--repair-counts');
const repairedAccessors = [];
function assert(value, message) { if (!value) throw new Error(message); }

const factoryPath = path.join(out, 'draco/draco_wasm_wrapper.js');
const module = { exports: {} };
new Function('module', 'exports', 'require', '__filename', '__dirname', fs.readFileSync(factoryPath, 'utf8'))(
  module, module.exports, createRequire(import.meta.url), factoryPath, path.dirname(factoryPath),
);
let draco;
await new Promise((resolve) => {
  module.exports({ wasmBinary: fs.readFileSync(path.join(out, 'draco/draco_decoder.wasm')),
    onModuleLoaded(value) { draco = value; resolve(); } });
});
const decoder = new draco.Decoder();
let primitives = 0;
const meshBounds = new Map();
for (let meshIndex = 0; meshIndex < gltf.meshes.length; meshIndex++) {
  const mesh = gltf.meshes[meshIndex];
  const bounds = new Box3();
  for (const p of mesh.primitives) {
    assert(gltf.materials[p.material], `Missing material in ${mesh.name}`);
    assert(p.attributes.TEXCOORD_0 !== undefined, `Missing UVs in ${mesh.name}`);
    const compressed = p.extensions.KHR_draco_mesh_compression;
    const view = gltf.bufferViews[compressed.bufferView];
    assert(view.byteOffset + view.byteLength <= buffer.length, 'Buffer range is invalid');
    const input = new draco.DecoderBuffer();
    input.Init(new Int8Array(buffer.buffer, buffer.byteOffset + view.byteOffset, view.byteLength), view.byteLength);
    const decoded = new draco.Mesh();
    const result = decoder.DecodeBufferToMesh(input, decoded);
    assert(result.ok(), `Draco decode failed: ${result.error_msg()}`);
    const indices = gltf.accessors[p.indices];
    assert(repairCounts ? decoded.num_faces() * 3 <= indices.count : decoded.num_faces() * 3 === indices.count,
      `Index count mismatch in ${mesh.name}`);
    if (repairCounts) {
      p.indices = repairedAccessors.length;
      const repaired = { ...indices, count: decoded.num_faces() * 3 };
      delete repaired.min; delete repaired.max;
      repairedAccessors.push(repaired);
    }
    for (const [semantic, attributeId] of Object.entries(compressed.attributes)) {
      const attribute = decoder.GetAttributeByUniqueId(decoded, attributeId);
      assert(attribute.ptr, `Missing ${semantic} after decode`);
      const accessor = gltf.accessors[p.attributes[semantic]];
      if (!repairCounts) assert(decoded.num_points() === accessor.count, `Point count mismatch in ${mesh.name}`);
      const values = new draco.DracoFloat32Array();
      decoder.GetAttributeFloatForAllPoints(decoded, attribute, values);
      for (let i = 0; i < values.size(); i++) assert(Number.isFinite(values.GetValue(i)), `Non-finite ${semantic}`);
      const attributeBounds = new Box3();
      if (semantic === 'POSITION') {
        for (let i = 0; i < values.size(); i += 3) attributeBounds.expandByPoint(new Vector3(values.GetValue(i), values.GetValue(i + 1), values.GetValue(i + 2)));
        bounds.union(attributeBounds);
      }
      if (repairCounts) {
        const repaired = { ...accessor, count: decoded.num_points() };
        delete repaired.min; delete repaired.max;
        if (semantic === 'POSITION') { repaired.min = attributeBounds.min.toArray(); repaired.max = attributeBounds.max.toArray(); }
        p.attributes[semantic] = repairedAccessors.length;
        repairedAccessors.push(repaired);
      }
      draco.destroy(values);
    }
    draco.destroy(decoded); draco.destroy(input);
    primitives++;
  }
  meshBounds.set(meshIndex, bounds);
}
draco.destroy(decoder);
if (repairCounts) {
  // Draco omits vertices unused by a material primitive. Give every compressed
  // primitive independent counts and bounds instead of the source mesh's ranges.
  gltf.accessors = repairedAccessors;
  fs.writeFileSync(path.join(out, 'neo-city.gltf'), JSON.stringify(gltf) + '\n');
}

for (const image of gltf.images) assert(fs.existsSync(path.join(out, image.uri)), `Missing image: ${image.uri}`);
for (const mat of gltf.materials) {
  for (const textureInfo of [mat.pbrMetallicRoughness.baseColorTexture, mat.pbrMetallicRoughness.metallicRoughnessTexture, mat.normalTexture, mat.occlusionTexture]) {
    assert(gltf.textures[textureInfo.index], `Missing texture in ${mat.name}`);
  }
}
function nodeMatrix(node) {
  if (node.matrix) return new Matrix4().fromArray(node.matrix);
  return new Matrix4().compose(new Vector3().fromArray(node.translation ?? [0, 0, 0]),
    new Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]), new Vector3().fromArray(node.scale ?? [1, 1, 1]));
}
function aggregate(nodeIndex, parent = new Matrix4()) {
  const node = gltf.nodes[nodeIndex];
  const world = parent.clone().multiply(nodeMatrix(node));
  const bounds = node.mesh !== undefined ? meshBounds.get(node.mesh).clone().applyMatrix4(world) : new Box3();
  let triangles = node.mesh !== undefined ? gltf.meshes[node.mesh].primitives.reduce((sum, p) => sum + gltf.accessors[p.indices].count / 3, 0) : 0;
  let primitives = node.mesh !== undefined ? gltf.meshes[node.mesh].primitives.length : 0;
  for (const child of node.children ?? []) {
    const result = aggregate(child, world);
    bounds.union(result.bounds); triangles += result.triangles; primitives += result.primitives;
  }
  return { bounds, triangles, primitives };
}
const buildings = [];
for (const record of manifest.buildings) {
  const index = gltf.nodes.findIndex(node => node.name === record.id);
  assert(index !== -1, `Missing building root ${record.id}`);
  const lods = {};
  for (const lod of ['high', 'medium']) {
    const child = gltf.nodes[index].children.find(i => gltf.nodes[i].name === `${record.id}-${lod}`);
    assert(child !== undefined, `Missing ${lod} LOD for ${record.id}`);
    const result = aggregate(child, nodeMatrix(gltf.nodes[index]));
    const size = result.bounds.getSize(new Vector3());
    const centre = result.bounds.getCenter(new Vector3());
    assert(Math.abs(result.bounds.min.y) < .05, `Building ${record.id}/${lod} does not rest at Y=0`);
    if (lod === 'high') {
      assert(Math.abs(centre.x) < .05 && Math.abs(centre.z) < .05, `Building ${record.id} is not centred`);
      assert(Math.abs(size.y - record.size.height) < .1, `Incorrect height for ${record.id}`);
    }
    lods[lod] = { triangles: result.triangles, primitives: result.primitives,
      min: result.bounds.min.toArray(), max: result.bounds.max.toArray(), size: size.toArray() };
  }
  buildings.push({ id: record.id, lods });
}
const report = { status: 'passed', primitivesDecoded: primitives,
  materialCount: gltf.materials.length, imagesPresent: gltf.images.length,
  allDracoAttributesFinite: true, allPrimitiveMaterialAndUvReferencesValid: true,
  allLodsAtYZero: true, allHighLodsCentred: true, buildings };
fs.writeFileSync(path.join(sourceRoot, 'conversion-validation.json'), JSON.stringify(report, null, 2) + '\n');
for (const building of manifest.buildings) {
  const checked = buildings.find(item => item.id === building.id);
  for (const [lod, data] of Object.entries(checked.lods)) {
    Object.assign(building.lods[lod], { triangles: data.triangles, primitives: data.primitives });
  }
}
manifest.validation = 'All compressed primitives independently decoded; indices, finite attributes, material/UV references, dependencies and local high-LOD bounds verified.';
manifest.geometry.triangles = buildings.reduce((sum, building) => sum + building.lods.high.triangles + building.lods.medium.triangles, 0);
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify(report));
