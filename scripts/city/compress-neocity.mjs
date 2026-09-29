// Encode glTF primitives with the Draco encoder already shipped by Three.js.
// This avoids depending on Blender's platform-specific native Draco library.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(project, 'public/models/neo-city');
const libraries = path.join(project, 'node_modules/three/examples/jsm/libs/draco/gltf');
const require = createRequire(import.meta.url);

function loadFactory(filename) {
  const module = { exports: {} };
  const source = fs.readFileSync(filename, 'utf8');
  new Function('module', 'exports', 'require', '__filename', '__dirname', source)(
    module, module.exports, require, filename, path.dirname(filename),
  );
  return module.exports;
}
let draco;
await new Promise((resolve) => {
  loadFactory(path.join(libraries, 'draco_encoder.js'))({ onModuleLoaded(value) { draco = value; resolve(); } });
});
const gltfPath = path.join(out, 'neo-city.gltf');
const gltf = JSON.parse(fs.readFileSync(gltfPath, 'utf8'));
if (gltf.extensionsRequired?.includes('KHR_draco_mesh_compression')) {
  console.log('Geometry is already Draco compressed. Re-export Blender geometry to rebuild.');
  process.exit(0);
}
const source = fs.readFileSync(path.join(out, gltf.buffers[0].uri));
const view = new DataView(source.buffer, source.byteOffset, source.byteLength);
const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const types = {
  5121: [1, 'getUint8'], 5123: [2, 'getUint16'], 5125: [4, 'getUint32'], 5126: [4, 'getFloat32'],
};
function accessorData(index) {
  const a = gltf.accessors[index];
  const b = gltf.bufferViews[a.bufferView];
  const [width, getter] = types[a.componentType];
  const count = components[a.type];
  const values = a.componentType === 5126 ? new Float32Array(a.count * count) : new Uint32Array(a.count * count);
  const start = (b.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const stride = b.byteStride ?? count * width;
  for (let i = 0; i < a.count; i++) {
    for (let c = 0; c < count; c++) values[i * count + c] = view[getter](start + i * stride + c * width, true);
  }
  return values;
}
const chunks = [];
const bufferViews = [];
let bytes = 0;
let primitiveCount = 0;
let triangleCount = 0;
for (const mesh of gltf.meshes) {
  for (const primitive of mesh.primitives) {
    const encoder = new draco.Encoder();
    const builder = new draco.MeshBuilder();
    const encodedMesh = new draco.Mesh();
    const encoded = new draco.DracoInt8Array();
    const indices = accessorData(primitive.indices);
    builder.AddFacesToMesh(encodedMesh, indices.length / 3, indices);
    const attributes = {};
    for (const [semantic, index] of Object.entries(primitive.attributes)) {
      const a = gltf.accessors[index];
      const type = semantic === 'POSITION' ? draco.POSITION : semantic === 'NORMAL' ? draco.NORMAL : semantic.startsWith('TEXCOORD_') ? draco.TEX_COORD : draco.GENERIC;
      attributes[semantic] = builder.AddFloatAttributeToMesh(encodedMesh, type, a.count, components[a.type], accessorData(index));
    }
    encoder.SetSpeedOptions(5, 5);
    encoder.SetAttributeQuantization(draco.POSITION, 16);
    encoder.SetAttributeQuantization(draco.NORMAL, 10);
    encoder.SetAttributeQuantization(draco.TEX_COORD, 14);
    const length = encoder.EncodeMeshToDracoBuffer(encodedMesh, encoded);
    if (length <= 0) throw new Error(`Draco encoding failed for ${mesh.name}`);
    const chunk = Buffer.alloc(length);
    for (let i = 0; i < length; i++) chunk[i] = encoded.GetValue(i);
    const padding = (4 - (bytes % 4)) % 4;
    if (padding) { chunks.push(Buffer.alloc(padding)); bytes += padding; }
    const bufferView = bufferViews.length;
    bufferViews.push({ buffer: 0, byteOffset: bytes, byteLength: length });
    chunks.push(chunk);
    bytes += length;
    primitive.extensions = { ...primitive.extensions, KHR_draco_mesh_compression: { bufferView, attributes } };
    primitiveCount++;
    triangleCount += indices.length / 3;
    draco.destroy(encoded); draco.destroy(encodedMesh); draco.destroy(builder); draco.destroy(encoder);
  }
  console.log(`DRACO ${mesh.name}`);
}
for (const accessor of gltf.accessors) { delete accessor.bufferView; delete accessor.byteOffset; }
gltf.bufferViews = bufferViews;
gltf.buffers = [{ uri: 'neo-city.bin', byteLength: bytes }];
for (const field of ['extensionsUsed', 'extensionsRequired']) gltf[field] = [...new Set([...(gltf[field] ?? []), 'KHR_draco_mesh_compression'])];
fs.writeFileSync(path.join(out, 'neo-city.bin'), Buffer.concat(chunks));
fs.writeFileSync(gltfPath, JSON.stringify(gltf) + '\n');
fs.mkdirSync(path.join(out, 'draco'), { recursive: true });
for (const filename of ['draco_decoder.js', 'draco_wasm_wrapper.js', 'draco_decoder.wasm']) fs.copyFileSync(path.join(libraries, filename), path.join(out, 'draco', filename));
fs.copyFileSync(path.join(libraries, '../README.md'), path.join(out, 'draco', 'UPSTREAM-README.md'));
fs.copyFileSync(path.join(project, 'node_modules/three/LICENSE'), path.join(out, 'draco', 'THREE-LICENSE.txt'));
// TypeScript ships the unmodified generic Apache 2.0 terms, also used by Draco.
fs.copyFileSync(path.join(project, 'node_modules/typescript/LICENSE.txt'), path.join(out, 'draco', 'APACHE-2.0.txt'));
const report = { encoder: 'Three.js bundled Draco JavaScript encoder', originalGeometryBytes: source.byteLength,
  compressedGeometryBytes: bytes, primitives: primitiveCount, triangles: triangleCount,
  quantization: { positionBits: 16, normalBits: 10, texcoordBits: 14 } };
fs.writeFileSync(path.join(project, 'asset-sources/city/kitbash3d/neo-city/conversion-compression.json'), JSON.stringify(report, null, 2) + '\n');
console.log('DRACO COMPLETE', report);
