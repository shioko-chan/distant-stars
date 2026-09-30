"""Import source imagery as cooked, compressed, mipmapped Unreal textures.

Called by prepare-assets.py. The residence v1 interchange files remain unchanged.
NormalGL sources use BC5 and Unreal's normal sampler, with the green channel flipped.
"""
import json
from pathlib import Path
import unreal

content = Path(unreal.Paths.project_content_dir()).resolve()
assets = unreal.AssetToolsHelpers.get_asset_tools()


def import_texture(source, destination, kind='color', clamp_y=False):
    task = unreal.AssetImportTask()
    task.filename = str(source)
    task.destination_path, task.destination_name = destination.rsplit('/', 1)
    task.automated = True
    task.replace_existing = True
    task.save = False
    assets.import_asset_tasks([task])
    texture = unreal.load_asset(destination)
    if not isinstance(texture, unreal.Texture2D):
        raise RuntimeError('Cannot import texture: ' + str(source))
    texture.set_editor_property('srgb', kind == 'color')
    texture.set_editor_property('compression_settings', {
        'color': unreal.TextureCompressionSettings.TC_DEFAULT,
        'linear': unreal.TextureCompressionSettings.TC_MASKS,
        'normal': unreal.TextureCompressionSettings.TC_NORMALMAP,
    }[kind])
    texture.set_editor_property('flip_green_channel', kind == 'normal')
    texture.set_editor_property('mip_gen_settings', unreal.TextureMipGenSettings.TMGS_SIMPLE_AVERAGE)
    # These runtime meshes have no cooked UV-density metadata. Keep their bounded,
    # compressed texture set resident so streaming cannot discard visible detail.
    texture.set_editor_property('never_stream', True)
    texture.set_editor_property('address_x', unreal.TextureAddress.TA_WRAP)
    texture.set_editor_property('address_y', unreal.TextureAddress.TA_CLAMP if clamp_y else unreal.TextureAddress.TA_WRAP)
    unreal.EditorAssetLibrary.save_loaded_asset(texture, only_if_is_dirty=False)


data = json.loads((content / 'SceneData/residence.json').read_text())
textures = set()
for material in data['materials']:
    for slot, kind in [('map', 'color'), ('emissiveMap', 'color'), ('normal', 'normal'),
                       ('roughnessMap', 'linear'), ('metalnessMap', 'linear')]:
        if slot in material:
            textures.add((material[slot], kind))
for filename, kind in sorted(textures):
    name = Path(filename).stem.replace('-', '_')
    import_texture(content / 'SceneData/textures' / filename, f'/Game/Textures/Residence/T_{name}_{kind}', kind)

for source in sorted((content / 'Web/textures/solar').glob('*.jpg')):
    import_texture(source, '/Game/Textures/Solar/T_' + source.stem, clamp_y=True)
for name in ['moon', 'sky']:
    import_texture(content / f'SceneData/{name}.png', '/Game/Textures/Solar/T_' + name, clamp_y=True)
unreal.log(f'DISTANT_STARS_TEXTURES_READY: {len(textures)} residence texture variants')
