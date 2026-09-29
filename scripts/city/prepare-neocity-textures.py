"""Build shared WebP/PBR textures and attach them to the exported Neo City library.

Requires system ffmpeg with libwebp; no Python packages. --textures-only prepares
maps while geometry is being exported. Without the flag, also writes the final
glTF materials and public manifest. Original 4K PNGs are never overwritten.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import subprocess

PROJECT = Path(__file__).resolve().parents[2]
SOURCE = PROJECT / 'asset-sources/city/kitbash3d/neo-city'
PNG = SOURCE / 'blender/KB3DTextures/4k'
OUT = PROJECT / 'public/models/neo-city'
TEXTURES = OUT / 'textures'
TEXTURES.mkdir(parents=True, exist_ok=True)

# The primary textured facade retains native 4K colour AND normal maps. Other
# surfaces use sizes proportional to their contribution to the eight buildings.
# Packed ORM and small fittings need fewer pixels than hero facade colour maps.
PRIMARY = {'DecorConcreteB'}
SECONDARY = {'MetalPaintWorn', 'DarkPanels', 'ConcreteA', 'WhitePanels'}
TERTIARY = {'ConcreteB', 'MetalLightGreyWorn', 'DecorConcreteCWhite', 'AirCon'}

def sizes(name):
    if name in PRIMARY:
        return 4096, 4096, 512
    if name in SECONDARY:
        return 2048, 1024, 512
    if name in TERTIARY:
        return 1024, 512, 256
    return 256, 256, 128

def run_ffmpeg(args, data=None):
    command = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-threads', '2',
               '-filter_threads', '1', '-filter_complex_threads', '1'] + args
    result = subprocess.run(command, input=data, capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr.decode(errors='replace'))
    return result.stdout

def encode_options(lossless):
    return ['-frames:v', '1', '-c:v', 'libwebp', '-lossless', '1' if lossless else '0',
            '-quality', '90', '-compression_level', '6', '-threads', '2']

def encode_map(source, dest, size, lossless=False, opacity=None):
    if dest.is_file():
        return
    args = ['-i', str(source)]
    if opacity:
        args += ['-i', str(opacity), '-filter_complex',
                 f'[0:v]scale={size}:{size}:flags=lanczos,format=rgba[c];'
                 f'[1:v]scale={size}:{size}:flags=lanczos,format=gray[a];[c][a]alphamerge']
    else:
        args += ['-vf', f'scale={size}:{size}:flags=lanczos,format=rgb24']
    run_ffmpeg(args + encode_options(lossless) + [str(dest)])

def gray_pixels(path, size):
    return run_ffmpeg(['-i', str(path), '-vf', f'scale={size}:{size}:flags=area,format=gray',
                       '-frames:v', '1', '-pix_fmt', 'gray', '-f', 'rawvideo', 'pipe:1'])

def encode_orm(name, dest, size):
    if dest.is_file():
        return
    # glTF ORM: R = ambient occlusion, G = roughness, B = metallic.
    pixels = bytearray(size * size * 3)
    for channel, semantic in enumerate(['ao', 'roughness', 'metallic']):
        path = PNG / f'{name}_{semantic}.png'
        pixels[channel::3] = gray_pixels(path, size)
    run_ffmpeg(['-f', 'rawvideo', '-pixel_format', 'rgb24', '-video_size', f'{size}x{size}',
                '-i', 'pipe:0'] + encode_options(True) + [str(dest)], bytes(pixels))

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def material_maps(item):
    full_name, source_material = item
    short = full_name.removeprefix('KB3D_NEC_')
    color_size, normal_size, orm_size = sizes(short)
    maps = {}
    for semantic, size in [('basecolor', color_size), ('normal', normal_size), ('orm', orm_size)]:
        dest = TEXTURES / f'{short}-{semantic}-{size}.webp'
        if semantic == 'orm':
            encode_orm(full_name, dest, size)
        else:
            opacity = PNG / f'{full_name}_opacity.png'
            encode_map(PNG / f'{full_name}_{semantic}.png', dest, size,
                       lossless=semantic == 'normal',
                       opacity=opacity if semantic == 'basecolor' and opacity.is_file() else None)
        maps[semantic] = {'uri': str(dest.relative_to(OUT)), 'width': size, 'height': size,
                          'bytes': dest.stat().st_size, 'sha256': digest(dest),
                          'estimatedGpuBytesWithMipmaps': round(size * size * 4 * 4 / 3)}
    emissive = PNG / f'{full_name}_emissive.png'
    if emissive.is_file():
        dest = TEXTURES / f'{short}-emissive-256.webp'
        encode_map(emissive, dest, 256)
        maps['emissive'] = {'uri': str(dest.relative_to(OUT)), 'width': 256, 'height': 256,
                            'bytes': dest.stat().st_size, 'sha256': digest(dest),
                            'estimatedGpuBytesWithMipmaps': round(256 * 256 * 4 * 4 / 3)}
    print(f'TEXTURES {short}: {color_size}/{normal_size}/{orm_size}', flush=True)
    return full_name, {'maps': maps, 'normalScale': source_material['normal_scale'],
                       'emissiveStrength': source_material['emissive_strength'],
                       'alphaMask': (PNG / f'{full_name}_opacity.png').is_file()}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--textures-only', action='store_true')
    args = parser.parse_args()
    geometry = json.loads((SOURCE / 'conversion-geometry.json').read_text())
    with ThreadPoolExecutor(max_workers=2) as pool:
        materials = dict(pool.map(material_maps, sorted(geometry['materials'].items())))
    maps = [texture for mat in materials.values() for texture in mat['maps'].values()]
    report = {'materials': materials, 'textureCount': len(maps),
              'textureBytes': sum(m['bytes'] for m in maps),
              'estimatedGpuBytesWithMipmaps': sum(m['estimatedGpuBytesWithMipmaps'] for m in maps),
              'notes': ['Native 4K source PNGs are unchanged in asset-sources.',
                        'WebP reduces download size, not GPU texture allocation; GPU budget assumes RGBA8 plus mipmaps.',
                        'Normal and packed ORM WebP use lossless encoding. Base colour/emissive use quality 90.',
                        'Offline displacement is represented by the original normal maps. Refractive glass uses its original opaque PBR surface maps without screen-space transmission.']}
    (SOURCE / 'conversion-textures.json').write_text(json.dumps(report, indent=2) + '\n')
    if args.textures_only:
        print('TEXTURES COMPLETE', report['textureBytes'], report['estimatedGpuBytesWithMipmaps'], flush=True)
        return
    gltf_path = OUT / 'neo-city.gltf'
    gltf = json.loads(gltf_path.read_text())
    gltf['images'], gltf['textures'] = [], []
    gltf['samplers'] = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}]
    indices = {}
    def texture_index(texture):
        uri = texture['uri']
        if uri not in indices:
            index = len(gltf['images'])
            gltf['images'].append({'uri': uri, 'mimeType': 'image/webp'})
            gltf['textures'].append({'sampler': 0, 'extensions': {'EXT_texture_webp': {'source': index}}})
            indices[uri] = index
        return indices[uri]
    for mat in gltf['materials']:
        original_name = mat['name']
        prepared = materials[original_name]
        texture_maps = prepared['maps']
        mat.clear()
        mat.update({'name': original_name,
                    'pbrMetallicRoughness': {
                        'baseColorFactor': [1, 1, 1, 1],
                        'baseColorTexture': {'index': texture_index(texture_maps['basecolor'])},
                        'metallicFactor': 1, 'roughnessFactor': 1,
                        'metallicRoughnessTexture': {'index': texture_index(texture_maps['orm'])}},
                    'normalTexture': {'index': texture_index(texture_maps['normal']), 'scale': prepared['normalScale']},
                    'occlusionTexture': {'index': texture_index(texture_maps['orm'])}})
        if prepared['alphaMask']:
            mat.update(alphaMode='MASK', alphaCutoff=.5, doubleSided=True)
        if 'emissive' in texture_maps:
            mat['emissiveFactor'] = [1, 1, 1]
            mat['emissiveTexture'] = {'index': texture_index(texture_maps['emissive'])}
    for field in ['extensionsUsed', 'extensionsRequired']:
        gltf[field] = sorted(set(gltf.get(field, []) + ['EXT_texture_webp']))
    gltf_path.write_text(json.dumps(gltf, separators=(',', ':')) + '\n')
    manifest = {'version': 1, 'source': 'KitBash3D Neo City', 'url': '/models/neo-city/neo-city.gltf',
                'decoderPath': '/models/neo-city/draco/', 'coordinateSystem': geometry['coordinateSystem'],
                'buildings': geometry['buildings'],
                'textures': {'count': report['textureCount'], 'downloadBytes': report['textureBytes'],
                             'estimatedGpuBytesWithMipmaps': report['estimatedGpuBytesWithMipmaps']},
                'geometry': {'downloadBytes': (OUT / 'neo-city.bin').stat().st_size},
                'license': {'provider': 'KitBash3D', 'sourceAssetsRedistributable': False}}
    (OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print('RUNTIME LIBRARY COMPLETE', manifest['textures'], manifest['geometry'], flush=True)

if __name__ == '__main__':
    main()
