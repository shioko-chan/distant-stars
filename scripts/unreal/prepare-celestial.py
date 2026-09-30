"""Small, specialised materials for the orbital view; no residence material samplers."""
import unreal

assets = unreal.AssetToolsHelpers.get_asset_tools()
edit = unreal.MaterialEditingLibrary

for name, image in [('M_Earth', 'earth_daymap'), ('M_Clouds', 'earth_clouds'), ('M_Backdrop', 'sky')]:
    path = '/Game/Materials/' + name
    material = unreal.load_asset(path)
    if material:
        edit.delete_all_material_expressions(material)
    else:
        material = assets.create_asset(name, '/Game/Materials', unreal.Material, unreal.MaterialFactoryNew())
    material.set_editor_property('two_sided', name == 'M_Backdrop')
    material.set_editor_property('used_with_instanced_static_meshes', True)
    sample = edit.create_material_expression(material, unreal.MaterialExpressionTextureSample, 0, 0)
    sample.texture = unreal.load_asset('/Game/Textures/Solar/T_' + image)
    sample.sampler_type = unreal.MaterialSamplerType.SAMPLERTYPE_COLOR
    if name == 'M_Backdrop':
        material.set_editor_property('shading_model', unreal.MaterialShadingModel.MSM_UNLIT)
        material.set_editor_property('is_sky', True)
        strength = edit.create_material_expression(material, unreal.MaterialExpressionMultiply, 250, 0)
        strength.set_editor_property('const_b', .22)
        edit.connect_material_expressions(sample, 'RGB', strength, 'A')
        atmosphere = edit.create_material_expression(material, unreal.MaterialExpressionSkyAtmosphereViewLuminance, 250, 200)
        combined = edit.create_material_expression(material, unreal.MaterialExpressionAdd, 500, 0)
        edit.connect_material_expressions(strength, '', combined, 'A')
        edit.connect_material_expressions(atmosphere, '', combined, 'B')
        edit.connect_material_property(combined, '', unreal.MaterialProperty.MP_EMISSIVE_COLOR)
    elif name == 'M_Clouds':
        material.set_editor_property('blend_mode', unreal.BlendMode.BLEND_TRANSLUCENT)
        material.set_editor_property('translucency_lighting_mode', unreal.TranslucencyLightingMode.TLM_SURFACE_PER_PIXEL_LIGHTING)
        white = edit.create_material_expression(material, unreal.MaterialExpressionConstant3Vector, 0, 200)
        white.set_editor_property('constant', unreal.LinearColor(.92, .95, 1))
        edit.connect_material_property(white, '', unreal.MaterialProperty.MP_BASE_COLOR)
        edit.connect_material_property(sample, 'R', unreal.MaterialProperty.MP_OPACITY)
    else:
        edit.connect_material_property(sample, 'RGB', unreal.MaterialProperty.MP_BASE_COLOR)
        # Blue-dominant sea pixels receive a broader ocean highlight; land stays rough.
        ocean = edit.create_material_expression(material, unreal.MaterialExpressionCustom, 250, 0)
        entry = unreal.CustomInput(); entry.set_editor_property('input_name', 'Colour')
        ocean.set_editor_property('inputs', [entry])
        ocean.set_editor_property('output_type', unreal.CustomMaterialOutputType.CMOT_FLOAT1)
        ocean.set_editor_property('code', 'return lerp(0.82, 0.28, saturate((Colour.b - max(Colour.r, Colour.g)) * 12.0));')
        edit.connect_material_expressions(sample, 'RGB', ocean, 'Colour')
        edit.connect_material_property(ocean, '', unreal.MaterialProperty.MP_ROUGHNESS)
    edit.recompile_material(material)
    unreal.EditorAssetLibrary.save_loaded_asset(material, only_if_is_dirty=False)
