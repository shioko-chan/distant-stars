"""Create native materials and the startup map. Run in Unreal Editor's Python commandlet."""
import unreal
import runpy
from pathlib import Path

runpy.run_path(str(Path(__file__).with_name('prepare-textures.py')))

assets = unreal.AssetToolsHelpers.get_asset_tools()
edit = unreal.MaterialEditingLibrary


def create_material(name, unlit=False, translucent=False):
    path = '/Game/Materials/' + name
    if unreal.EditorAssetLibrary.does_asset_exist(path):
        unreal.EditorAssetLibrary.delete_asset(path)
    material = assets.create_asset(name, '/Game/Materials', unreal.Material, unreal.MaterialFactoryNew())
    material.set_editor_property('two_sided', True)
    material.set_editor_property('used_with_instanced_static_meshes', True)
    if unlit:
        material.set_editor_property('shading_model', unreal.MaterialShadingModel.MSM_UNLIT)
    if translucent:
        material.set_editor_property('blend_mode', unreal.BlendMode.BLEND_TRANSLUCENT)
    cursor = [0]

    def node(kind, **properties):
        result = edit.create_material_expression(material, kind, (cursor[0] % 8) * 220, (cursor[0] // 8) * 180)
        cursor[0] += 1
        for key, value in properties.items():
            result.set_editor_property(key, value)
        return result

    def connect(source, target, input_name, output=''):
        if not edit.connect_material_expressions(source, output, target, input_name):
            raise RuntimeError('Cannot connect material expressions: ' + input_name)
        return target

    def binary(kind, a, b):
        result = node(kind)
        connect(a, result, 'A')
        connect(b, result, 'B')
        return result

    def scalar(name, default):
        return node(unreal.MaterialExpressionScalarParameter, parameter_name=name, default_value=default)

    def color(name, value):
        return node(unreal.MaterialExpressionVectorParameter, parameter_name=name, default_value=unreal.LinearColor(*value))

    def mask(source, r=False, g=False, b=False, a=False):
        result = node(unreal.MaterialExpressionComponentMask, r=r, g=g, b=b, a=a)
        connect(source, result, '', output='RGBA' if a else '')
        return result

    def lerp(a, b, alpha):
        result = node(unreal.MaterialExpressionLinearInterpolate)
        connect(a, result, 'A'); connect(b, result, 'B'); connect(alpha, result, 'Alpha')
        return result

    white = unreal.load_asset('/Engine/EngineResources/WhiteSquareTexture')
    if not white:
        raise RuntimeError('Unreal white texture is unavailable')
    uv = node(unreal.MaterialExpressionTextureCoordinate)
    uv_x, uv_y = mask(uv, r=True), mask(uv, g=True)
    one_minus_y = node(unreal.MaterialExpressionOneMinus)
    connect(uv_y, one_minus_y, '')
    flipped = node(unreal.MaterialExpressionAppendVector)
    connect(uv_x, flipped, 'A')
    connect(lerp(uv_y, one_minus_y, scalar('FlipY', 1)), flipped, 'B')
    transform = color('UVTransform', (1, 1, 0, 0))
    coords = binary(unreal.MaterialExpressionAdd,
                    binary(unreal.MaterialExpressionMultiply, flipped, mask(transform, r=True, g=True)),
                    mask(transform, b=True, a=True))

    # Use centimetre-scaled local coordinates so windows retain their physical size on instanced towers.
    instance_scale = node(unreal.MaterialExpressionPerInstanceCustomData3Vector, data_index=3,
                          const_default_value=unreal.LinearColor(1, 1, 1, 1))
    local_position = binary(unreal.MaterialExpressionMultiply, node(unreal.MaterialExpressionPreSkinnedPosition), instance_scale)
    local_normal = node(unreal.MaterialExpressionPreSkinnedNormal)
    seed = node(unreal.MaterialExpressionPerInstanceRandom)
    def projection(code):
        inputs = []
        for name in ['Position', 'Normal', 'Seed']:
            entry = unreal.CustomInput()
            entry.set_editor_property('input_name', name)
            inputs.append(entry)
        custom = node(unreal.MaterialExpressionCustom, code=code, output_type=unreal.CustomMaterialOutputType.CMOT_FLOAT2, inputs=inputs)
        for n, source in [('Position', local_position), ('Normal', local_normal), ('Seed', seed)]:
            connect(source, custom, n)
        vertex = node(unreal.MaterialExpressionVertexInterpolator)
        connect(custom, vertex, 'VS')
        return vertex
    facade_uv = projection('float horizontal = abs(Normal.y) > .5 ? -Position.x : Position.y; return float2(horizontal / 2160.0 + floor(Seed * 8.0) / 8.0, -Position.z / 3360.0);')
    light_uv = projection('float horizontal = abs(Normal.y) > .5 ? -Position.x : Position.y; return float2(horizontal / 8640.0 + floor(Seed * 32.0) / 32.0, -Position.z / 13440.0 + floor(frac(Seed * 13.7) * 32.0) / 32.0);')
    roof_uv = projection('return Position.xy / 1200.0;')
    ordinary_coords = coords
    coords = lerp(lerp(coords, roof_uv, scalar('Roof', 0)), facade_uv, scalar('Facade', 0))
    emission_coords = lerp(ordinary_coords, light_uv, scalar('Facade', 0))
    linear_white = unreal.load_asset('/Game/Materials/T_LinearWhite')

    def texture(name, linear=False):
        normal = name == 'NormalTexture'
        default = unreal.load_asset('/Engine/EngineMaterials/DefaultNormal') if normal else linear_white if linear else white
        sample = node(unreal.MaterialExpressionTextureSampleParameter2D, parameter_name=name, texture=default)
        sample.set_editor_property('sampler_type', unreal.MaterialSamplerType.SAMPLERTYPE_NORMAL if normal else unreal.MaterialSamplerType.SAMPLERTYPE_MASKS if linear else unreal.MaterialSamplerType.SAMPLERTYPE_COLOR)
        connect(emission_coords if name == 'EmissionTexture' else coords, sample, 'UVs')
        return sample

    tint_components = [node(unreal.MaterialExpressionPerInstanceCustomData, data_index=i, const_default_value=1.0) for i in range(3)]
    tint_xy = node(unreal.MaterialExpressionAppendVector)
    connect(tint_components[0], tint_xy, 'A'); connect(tint_components[1], tint_xy, 'B')
    tint = node(unreal.MaterialExpressionAppendVector)
    connect(tint_xy, tint, 'A'); connect(tint_components[2], tint, 'B')
    tint_vertex = node(unreal.MaterialExpressionVertexInterpolator)
    connect(tint, tint_vertex, 'VS')
    base = binary(unreal.MaterialExpressionMultiply, binary(unreal.MaterialExpressionMultiply, color('Color', (1, 1, 1, 1)), texture('BaseTexture')), tint_vertex)
    emission = binary(unreal.MaterialExpressionMultiply, color('Emission', (0, 0, 0, 1)), texture('EmissionTexture'))
    emission = binary(unreal.MaterialExpressionMultiply, emission, tint_vertex)
    if unlit:
        emission = binary(unreal.MaterialExpressionAdd, base, emission)
    else:
        edit.connect_material_property(base, '', unreal.MaterialProperty.MP_BASE_COLOR)
        roughness = binary(unreal.MaterialExpressionMultiply, scalar('Roughness', 1), mask(texture('RoughnessTexture', True), g=True))
        metalness = binary(unreal.MaterialExpressionMultiply, scalar('Metalness', 0), mask(texture('MetalnessTexture', True), b=True))
        edit.connect_material_property(roughness, '', unreal.MaterialProperty.MP_ROUGHNESS)
        edit.connect_material_property(metalness, '', unreal.MaterialProperty.MP_METALLIC)
        normal = lerp(color('FlatNormal', (0, 0, 1, 0)), texture('NormalTexture'), scalar('NormalStrength', 1))
        edit.connect_material_property(normal, '', unreal.MaterialProperty.MP_NORMAL)
    edit.connect_material_property(emission, '', unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    if translucent:
        edit.connect_material_property(scalar('Opacity', 1), '', unreal.MaterialProperty.MP_OPACITY)
    edit.recompile_material(material)
    unreal.EditorAssetLibrary.save_loaded_asset(material, only_if_is_dirty=False)


if not unreal.EditorAssetLibrary.does_asset_exist('/Game/Materials/T_LinearWhite'):
    linear_white = unreal.EditorAssetLibrary.duplicate_asset('/Engine/EngineResources/WhiteSquareTexture', '/Game/Materials/T_LinearWhite')
linear_white = unreal.load_asset('/Game/Materials/T_LinearWhite')
linear_white.set_editor_property('srgb', False)
linear_white.set_editor_property('compression_settings', unreal.TextureCompressionSettings.TC_MASKS)
unreal.EditorAssetLibrary.save_loaded_asset(linear_white)

create_material('M_SceneLit')
create_material('M_SceneUnlit', unlit=True)
create_material('M_SceneGlass', translucent=True)
runpy.run_path(str(Path(__file__).with_name('prepare-celestial.py')))
level = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
if not unreal.EditorAssetLibrary.does_asset_exist('/Game/Maps/DistantStars'):
    if not level.new_level('/Game/Maps/DistantStars'):
        raise RuntimeError('Failed to create the startup map')
    if not level.save_current_level():
        raise RuntimeError('Failed to save the startup map')
# Imported glTF materials also need permutations for animated morph targets in cooked builds.
parents = {}
def native_cat_parent(parent):
    key = parent.get_path_name()
    if key in parents:
        return parents[key]
    destination = '/Game/Cat/Materials/Native_' + parent.get_name()
    copy = unreal.load_asset(destination) if unreal.EditorAssetLibrary.does_asset_exist(destination) else unreal.EditorAssetLibrary.duplicate_asset(key, destination)
    parents[key] = copy
    if isinstance(copy, unreal.Material):
        copy.set_editor_property('used_with_skeletal_mesh', True)
        copy.set_editor_property('used_with_morph_targets', True)
        edit.recompile_material(copy)
    elif isinstance(copy, unreal.MaterialInstanceConstant):
        edit.set_material_instance_parent(copy, native_cat_parent(parent.get_editor_property('parent')))
    unreal.EditorAssetLibrary.save_loaded_asset(copy, only_if_is_dirty=False)
    return copy
for path in unreal.EditorAssetLibrary.list_assets('/Game/Cat/cat/Materials', recursive=True):
    material = unreal.load_asset(path)
    if isinstance(material, unreal.Material):
        material.set_editor_property('used_with_skeletal_mesh', True)
        material.set_editor_property('used_with_morph_targets', True)
        edit.recompile_material(material)
        unreal.EditorAssetLibrary.save_loaded_asset(material, only_if_is_dirty=False)
    elif isinstance(material, unreal.MaterialInstanceConstant):
        parent = material.get_editor_property('parent')
        if not parent.get_path_name().startswith('/Game/Cat/Materials/Native_'):
            edit.set_material_instance_parent(material, native_cat_parent(parent))
            unreal.EditorAssetLibrary.save_loaded_asset(material, only_if_is_dirty=False)
# UE 5.8 also keeps usage overrides on material instances, independently of the base material.
for path in unreal.EditorAssetLibrary.list_assets('/Game/Cat', recursive=True):
    material = unreal.load_asset(path)
    if isinstance(material, unreal.MaterialInstanceConstant):
        edit.set_material_usage_override(material, unreal.MaterialUsage.MATUSAGE_SKELETAL_MESH, True, True)
        edit.set_material_usage_override(material, unreal.MaterialUsage.MATUSAGE_MORPH_TARGETS, True, True)
        edit.update_material_instance(material)
        unreal.EditorAssetLibrary.save_loaded_asset(material, only_if_is_dirty=False)
unreal.log('DISTANT_STARS_NATIVE_ASSETS_READY')
