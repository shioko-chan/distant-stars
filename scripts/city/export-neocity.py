"""Export the archived Neo City kit as a shared, metre-scale glTF building library.

Run with Blender: blender --background --factory-startup --disable-autoexec
  --python scripts/city/export-neocity.py
Then run: python3 scripts/city/prepare-neocity-textures.py
The licensed source .blend is never saved or modified.
"""
import bpy
import bmesh
import hashlib
import json
from pathlib import Path
from mathutils import Matrix, Vector

PROJECT = Path(__file__).resolve().parents[2]
SOURCE_ROOT = PROJECT / 'asset-sources/city/kitbash3d/neo-city'
SOURCE = SOURCE_ROOT / 'blender/kb3d_neocity-native.blend'
OUT = PROJECT / 'public/models/neo-city'
OUT.mkdir(parents=True, exist_ok=True)

# The four independent towers in LG A are separate complete building forms.
# Large display bases, trees, loose market props, cameras and lights are excluded.
BUILDINGS = {
    'lg-a-core': ['KB3D_NEC_BldgLG_A_Main'],
    'lg-a-a': ['KB3D_NEC_BldgLG_A_BuildingA'],
    'lg-a-b': ['KB3D_NEC_BldgLG_A_BuildingB'],
    'lg-b': ['KB3D_NEC_BldgLG_B_Main', 'KB3D_NEC_BldgLG_B_AntennaA'],
    'lg-c': ['KB3D_NEC_BldgLG_C_' + suffix for suffix in ['Main', 'Base', 'AntennaA', 'AntennaB', 'AntennaC', 'AntennaD']],
    'md-a': ['KB3D_NEC_BldgMD_A_' + suffix for suffix in ['Main', 'Base', 'Banners', 'AntennaA']],
    'md-b': ['KB3D_NEC_BldgMD_B_Main'],
    'md-c': ['KB3D_NEC_BldgMD_C_' + suffix for suffix in ['Main', 'Base', 'BuildingA', 'Banners', 'AntennaA']],
}
TARGET_TRIANGLES = {'high': 75000, 'medium': 8000}

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        while chunk := f.read(2 * 1024 * 1024):
            h.update(chunk)
    return h.hexdigest()

def triangles(mesh):
    return sum(max(0, p.loop_total - 2) for p in mesh.polygons)

def remove_small_fittings(edit, materials):
    """Drop disconnected detailed fittings in medium LOD, retaining facade glass."""
    visited, remove = set(), []
    for seed in edit.verts:
        if seed in visited:
            continue
        stack, vertices = [seed], []
        visited.add(seed)
        while stack:
            vertex = stack.pop()
            vertices.append(vertex)
            for edge in vertex.link_edges:
                other = edge.other_vert(vertex)
                if other not in visited:
                    visited.add(other)
                    stack.append(other)
        faces = {face for vertex in vertices for face in vertex.link_faces}
        dimensions = [max(v.co[i] for v in vertices) - min(v.co[i] for v in vertices) for i in range(3)]
        protected = any(any(token in materials[face.material_index].name
                            for token in ['Glass', 'Light', 'Banner', 'Letters']) for face in faces)
        count = sum(len(face.verts) - 2 for face in faces)
        if max(dimensions) < 3 and count > 12 and not protected:
            remove.extend(vertices)
    bmesh.ops.delete(edit, geom=remove, context='VERTS')

original_hash = digest(SOURCE)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE), load_ui=False, use_scripts=False)
source_objects = {name: bpy.data.objects[name] for names in BUILDINGS.values() for name in names}
source_materials = {}
for obj in source_objects.values():
    for polygon in obj.data.polygons:
        mat = obj.data.materials[polygon.material_index]
        if mat and mat.name not in source_materials:
            principled = next((node for node in mat.node_tree.nodes if node.type == 'BSDF_PRINCIPLED'), None)
            normal_node = next((node for node in mat.node_tree.nodes if node.type == 'NORMAL_MAP'), None)
            source_materials[mat.name] = {
                'name': mat.name, 'surface_area': 0,
                'normal_scale': normal_node.inputs['Strength'].default_value if normal_node else 1,
                'emissive_strength': principled.inputs['Emission Strength'].default_value if principled else 1,
                'images': {node.image.name: node.image.filepath for node in mat.node_tree.nodes if node.type == 'TEX_IMAGE' and node.image},
            }
        if mat:
            source_materials[mat.name]['surface_area'] += polygon.area

# Export placeholders only; the second stage constructs standard glTF PBR maps.
# This avoids loading all 384 source images into Blender during geometry work.
for name in source_materials:
    material = bpy.data.materials[name]
    material.use_nodes = True
    material.node_tree.nodes.clear()
    surface = material.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
    output = material.node_tree.nodes.new('ShaderNodeOutputMaterial')
    material.node_tree.links.new(surface.outputs['BSDF'], output.inputs['Surface'])
export_scene = bpy.data.scenes.new('Neo City runtime library')
bpy.context.window.scene = export_scene
export_scene.unit_settings.system = 'METRIC'
export_scene.unit_settings.scale_length = 1
building_records = []
for building_id, names in BUILDINGS.items():
    originals = [source_objects[name] for name in names]
    points = [obj.matrix_world @ Vector(corner) for obj in originals for corner in obj.bound_box]
    lo = Vector([min(p[i] for p in points) for i in range(3)])
    hi = Vector([max(p[i] for p in points) for i in range(3)])
    center = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    recenter = Matrix.Translation(-center)
    root = bpy.data.objects.new(building_id, None)
    export_scene.collection.objects.link(root)
    source_triangles = sum(triangles(obj.data) for obj in originals)
    record = {'id': building_id, 'sourceObjects': names,
              'size': {'width': hi.x-lo.x, 'height': hi.z-lo.z, 'depth': hi.y-lo.y},
              'sourceTriangles': source_triangles, 'lods': {}}
    for lod, target in TARGET_TRIANGLES.items():
        lod_root = bpy.data.objects.new(f'{building_id}-{lod}', None)
        export_scene.collection.objects.link(lod_root)
        lod_root.parent = root
        lod_objects = []
        for original in originals:
            mesh = original.data.copy()
            mesh.transform(recenter @ original.matrix_world)
            # Triangulate before collapse to avoid invalid n-gons from the
            # original kit's disconnected detail. Medium drops small fittings.
            edit = bmesh.new()
            edit.from_mesh(mesh)
            if lod == 'medium':
                remove_small_fittings(edit, mesh.materials)
            bmesh.ops.triangulate(edit, faces=list(edit.faces))
            edit.to_mesh(mesh)
            edit.free()
            mesh.validate(clean_customdata=True)
            mesh.update()
            obj = bpy.data.objects.new(f'{building_id}-{lod}-{original.name.rsplit("_", 1)[-1]}', mesh)
            export_scene.collection.objects.link(obj)
            obj.parent = lod_root
            lod_objects.append(obj)
            count = triangles(mesh)
            # Keep a minimum of small appendages so antenna silhouettes survive.
            ratio = min(1, max(target / source_triangles, min(.5, 500 / max(count, 1))))
            if ratio < .999:
                modifier = obj.modifiers.new('Runtime LOD', 'DECIMATE')
                modifier.decimate_type = 'COLLAPSE'
                modifier.ratio = ratio
                modifier.use_collapse_triangulate = True
                bpy.context.view_layer.objects.active = obj
                obj.select_set(True)
                bpy.ops.object.modifier_apply(modifier=modifier.name)
                obj.select_set(False)
            obj.data.validate(clean_customdata=True)
            obj.data.update()
        count = sum(triangles(obj.data) for obj in lod_objects)
        record['lods'][lod] = {'node': lod_root.name, 'triangles': count}
        print(f'LOD {building_id} {lod}: {count} triangles', flush=True)
    building_records.append(record)

bpy.ops.export_scene.gltf(
    filepath=str(OUT / 'neo-city.gltf'), export_format='GLTF_SEPARATE',
    use_active_scene=True, export_yup=True, export_animations=False,
    export_cameras=False, export_lights=False, export_skins=False, export_morph=False,
    export_materials='EXPORT', export_normals=True, export_tangents=False,
    export_texcoords=True, export_vertex_color='NONE',
    export_draco_mesh_compression_enable=False,
)
gltf = json.loads((OUT / 'neo-city.gltf').read_text())
assert not gltf.get('images'), 'Geometry stage unexpectedly exported images'
assert digest(SOURCE) == original_hash, 'The source .blend changed'
report = {'source': str(SOURCE.relative_to(PROJECT)), 'sourceSha256': original_hash,
          'originalUnchanged': True, 'blenderVersion': bpy.app.version_string,
          'buildings': building_records, 'materials': source_materials,
          'geometryBytes': (OUT / 'neo-city.bin').stat().st_size,
          'coordinateSystem': 'Y-up, metres, local XZ centre and Y=0 at building base',
          'notes': ['High and medium are alternatives; render one LOD per placement.',
                    'Geometry LOD is derived from copies. Original source geometry and 4K PNGs remain untouched.',
                    'Medium removes disconnected fittings with maximum axis extent below 3m and over 12 triangles, except Glass, Light, Banner or Letters materials. Small roof fittings may disappear at the LOD switch.',
                    'Draco removes unused vertices and degenerate faces. The validation stage reconstructs primitive-specific accessor counts and bounds from decoded data.']}
(SOURCE_ROOT / 'conversion-geometry.json').write_text(json.dumps(report, indent=2) + '\n')
print('GEOMETRY COMPLETE', report['geometryBytes'], 'bytes', flush=True)
