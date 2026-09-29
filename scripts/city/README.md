> 本分支使用 Unreal 原生资产。旧 Three.js 压缩与验证工具保留在 `main`/`web`；当前构建和资源重建方法见 [Unreal 客户端](../../unreal/README.md)。以下为原始制作记录。

# Neo City conversion

Prerequisites are the archived Neo City Blender/4K PNG kit, Blender, Node.js,
the project's installed Three.js package, and system FFmpeg with libwebp.
No extra runtime or Python dependencies are installed.

Run from the repository root, in this order:

```sh
blender --background --factory-startup --disable-autoexec --python scripts/city/export-neocity.py
node scripts/city/compress-neocity.mjs
python3 scripts/city/prepare-neocity-textures.py
node scripts/city/validate-neocity.mjs --repair-counts
node scripts/city/validate-neocity.mjs
```

The geometry exporter uses copied meshes and replaces source materials only in
memory with named temporary Principled materials. Exporting these real material
slots preserves every primitive's material index without decoding the source
textures. The following stage attaches the actual shared PBR textures by name.

The JavaScript encoder is the Draco encoder bundled with Three.js. The Blender
native Draco library on the development machine aborted during encoding, so the
pipeline uses the existing portable JavaScript implementation. Decoder files and
license records are copied from existing installed packages.

Draco discards unused vertices and degenerate faces. `--repair-counts` decodes
the compressed primitives and writes their exact accessor counts and position
bounds. The final invocation independently verifies the finalized file without
repairing it. Neither invocation changes source assets.

Texture preparation can run with `--textures-only` while geometry is being
prepared, once `conversion-geometry.json` exists. Existing derivative texture
files are reused; to change encoder settings, remove only the corresponding
derivative WebP files before rerunning. Original 4K PNGs are never overwritten.

Outputs:

- `public/models/neo-city/neo-city.gltf`, geometry buffer, shared maps and decoders.
- `public/models/neo-city/manifest.json`: roots, LOD names, source dimensions and budgets.
- `asset-sources/city/kitbash3d/neo-city/conversion-*.json`: provenance and validation.

The runtime README records exact LOD counts, per-material resolution choices,
known differences from the offline material graphs, and the license sources.
