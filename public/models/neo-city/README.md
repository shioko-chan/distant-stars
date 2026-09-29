# Neo City runtime building library

Derived from the user-provided KitBash3D Neo City kit. The source kit and all 384 native 4K PNGs remain unchanged in `asset-sources/city/kitbash3d/neo-city/`. This directory contains only the app derivatives.

## Runtime contract

`neo-city.gltf` contains eight metre-scale Y-up building roots. Each root has `<id>-high` and `<id>-medium` children. Render one LOD per placement. Both use the same original bottom-centred transform; high LOD bounds retain the original building dimensions. Minor fittings can disappear in medium LOD.

Use Three.js GLTFLoader with DRACOLoader at `/models/neo-city/draco/`. All materials and external textures are shared across building types and both LODs.

## Geometry

| ID | Width × depth × height (m) | High triangles / primitives | Medium triangles / primitives |
| --- | --- | --- | --- |
| lg-a-core | 29.9 × 29.0 × 67.2 | 74,999 / 14 | 6,588 / 9 |
| lg-a-a | 13.1 × 17.9 × 41.7 | 29,128 / 12 | 2,458 / 10 |
| lg-a-b | 22.7 × 25.1 × 72.6 | 43,938 / 12 | 3,704 / 10 |
| lg-b | 54.6 × 45.4 × 201.1 | 74,983 / 14 | 7,444 / 10 |
| lg-c | 36.6 × 38.2 × 167.9 | 76,294 / 24 | 15,192 / 20 |
| md-a | 31.8 × 16.5 × 27.1 | 74,934 / 24 | 8,241 / 20 |
| md-b | 26.8 × 22.8 × 57.3 | 75,000 / 14 | 4,365 / 9 |
| md-c | 68.7 × 26.6 × 59.1 | 74,819 / 23 | 7,144 / 19 |

High LOD collapses copied meshes toward 75k triangles while retaining small appendages. Medium LOD first removes disconnected detailed fittings smaller than 3m, protecting glass, lights, banners and lettering, then triangulates and collapses. It is a lossy geometric derivative; originals are untouched. The largest medium model is about 15.2k triangles to retain its antenna and podium structure.

## Texture budget

34 shared PBR materials use 103 maps: 36.73 MB downloaded and 331.1 MiB estimated GPU allocation (RGBA8 plus full mipmaps). Draco geometry is 5.64 MB. The complete runtime directory, including local decoders, is about 43.4 MB.

The highest-area textured facade, DecorConcreteB, retains native 4096×4096 base colour and normal maps. Other surfaces are sized by their contribution to the selected buildings. WebP reduces transfer size; it does not reduce decoded GPU texture size. Normal and ORM maps use lossless WebP; colour and emissive use quality 90.

ORM channels are R=ambient occlusion, G=roughness, B=metallic. Original colour, normal, metalness, roughness and emissive images remain the source. Opacity is packed into base-colour alpha where used. Offline displacement and refractive glass shader graphs are not reproduced: normals retain surface relief and glass uses its original opaque PBR surface maps, avoiding expensive screen-space transmission.

| Material | Base colour | Normal | ORM | Emissive |
| --- | ---: | ---: | ---: | ---: |
| AirCon | 1024 | 512 | 256 | — |
| AsphaltHexagonRoof | 256 | 256 | 128 | — |
| BannerA | 256 | 256 | 128 | — |
| ConcreteA | 2048 | 1024 | 512 | — |
| ConcreteAccent | 256 | 256 | 128 | — |
| ConcreteB | 1024 | 512 | 256 | — |
| ConcreteWall | 256 | 256 | 128 | — |
| DarkPanels | 2048 | 1024 | 512 | — |
| DecorConcreteB | 4096 | 4096 | 512 | — |
| DecorConcreteCBeige | 256 | 256 | 128 | — |
| DecorConcreteCWhite | 1024 | 512 | 256 | — |
| GalvanizedSteel | 256 | 256 | 128 | — |
| GalvanizedSteelDirt | 256 | 256 | 128 | — |
| GlassBlack | 256 | 256 | 128 | — |
| GlassLamps | 256 | 256 | 128 | — |
| GlassTinted | 256 | 256 | 128 | — |
| LeavesBush | 256 | 256 | 128 | — |
| Letters | 256 | 256 | 128 | — |
| LightsA | 256 | 256 | 128 | 256 |
| MetalAccent | 256 | 256 | 128 | — |
| MetalDarkWorn | 256 | 256 | 128 | — |
| MetalGrating | 256 | 256 | 128 | — |
| MetalLightGreyWorn | 1024 | 512 | 256 | — |
| MetalPaintRed | 256 | 256 | 128 | — |
| MetalPaintWhiteWorn | 256 | 256 | 128 | — |
| MetalPaintWorn | 2048 | 1024 | 512 | — |
| MetalPaintYellow | 256 | 256 | 128 | — |
| OxidizedSteel | 256 | 256 | 128 | — |
| PaintedMetal | 256 | 256 | 128 | — |
| SatinSteel | 256 | 256 | 128 | — |
| SpeedwayTiles | 256 | 256 | 128 | — |
| TarpA | 256 | 256 | 128 | — |
| WhitePanels | 2048 | 1024 | 512 | — |
| WoodDarkGreyTower | 256 | 256 | 128 | — |

## Rebuild and validation

See `scripts/city/README.md`. Blender reads the original with automatic scripts disabled and never saves it. The conversion reports and source hashes are in the source asset directory. All 244 Draco primitives were decoded independently, with finite attributes, valid indices, material/UV assignments, dependencies and high-LOD local bounds checked.

## Licenses

Neo City remains subject to the user’s KitBash3D license; this is an application asset derivative, not a freely redistributable source kit. Draco decoders are copied unchanged from the installed Three.js package. `draco/UPSTREAM-README.md` records their source and Apache 2.0 license; full Apache 2.0 terms and the accompanying Three.js MIT notice are included.
