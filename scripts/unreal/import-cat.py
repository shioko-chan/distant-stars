"""Import the migrated cat skeleton and its idle/walk clips using Unreal Interchange."""
import unreal
from pathlib import Path
source = Path(unreal.Paths.project_content_dir()) / 'SceneData' / 'cat.glb'
task = unreal.AssetImportTask()
task.filename = str(source.resolve())
task.destination_path = '/Game/Cat'
task.automated = True
task.replace_existing = True
task.save = True
unreal.AssetToolsHelpers.get_asset_tools().import_asset_tasks([task])
objects = unreal.EditorAssetLibrary.list_assets('/Game/Cat', recursive=True)
for path in objects:
    asset = unreal.load_asset(path)
    unreal.log('CAT_ASSET ' + path + ' ' + str(type(asset)))
if not any(isinstance(unreal.load_asset(p), unreal.SkeletalMesh) for p in objects):
    raise RuntimeError('Cat skeletal mesh was not imported')
