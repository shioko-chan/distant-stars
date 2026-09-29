"""Validate the portable residence contract without launching Unreal."""
import json
import math
import struct
from pathlib import Path
root = Path(__file__).resolve().parents[2] / 'unreal' / 'Content' / 'SceneData'
data = json.loads((root / 'residence.json').read_text())
raw = (root / 'residence.bin').read_bytes()
assert data['version'] == 1
assert data['coordinateSystem'] == 'right-handed-y-up-metres'
for mesh in data['meshes']:
    for key in ('positions', 'normals', 'uv', 'indices'):
        if key not in mesh:
            continue
        span = mesh[key]
        assert span['offset'] >= 0 and span['count'] >= 0
        assert span['offset'] + span['count'] * 4 <= len(raw)
    assert mesh['positions']['count'] % 3 == 0
    assert mesh['indices']['count'] % 3 == 0
    span = mesh['indices']
    indices = struct.unpack_from('<' + str(span['count']) + 'I', raw, span['offset'])
    assert not indices or max(indices) < mesh['positions']['count'] // 3
    assert all(0 <= i < len(data['materials']) for i in mesh['materials'])
    assert all(0 <= group['materialIndex'] < len(mesh['materials']) for group in mesh['groups'])
for instance in data['instances']:
    assert 0 <= instance['mesh'] < len(data['meshes'])
    assert all(math.isfinite(v) for key in ('position', 'rotation', 'scale', 'color') for v in instance[key])
for material in data['materials']:
    for key in ('map', 'normal', 'roughnessMap', 'metalnessMap', 'emissiveMap'):
        if key in material:
            assert (root / 'textures' / material[key]).is_file()
traffic = json.loads((root / 'traffic.json').read_text())
assert traffic['trains'] and traffic['flyers'] and traffic['routes']
for route in traffic['routes']:
    assert route['period'] > 0
    assert route['keyframes'][-1]['time'] == route['period']
    assert all(a['time'] <= b['time'] for a,b in zip(route['keyframes'],route['keyframes'][1:]))
print(f"Validated {len(data['meshes'])} meshes, {len(data['instances'])} instances, {len(data['materials'])} materials and all traffic paths.")
