# 城市贴图生成记录

2026-09-23，使用内置 image_gen（imagegen 技能）生成并直接复制进项目。两张 PNG 均为 1254 × 1254，无输入参考图；不是实测 PBR 扫描，也没有声称包含真实测量的法线或粗糙度。颜色使用 sRGB，材质参数由渲染器按玻璃、窗框、屋面分别设置。运行时从本地加载。

- `curtain-wall.png`：8 × 8 幕墙窗格，2.7 m 窗宽、4.2 m 层高。
- `roof-mineral.png`：4 × 4 矿物屋面板，整体映射为 12 m × 12 m。

## 幕墙完整提示词

Use case: photorealistic-natural
Asset type: production seamless base-color texture for a physically based 3D building facade in a vast orbital habitat city.
Primary request: Create a realistic high resolution architectural curtain-wall material tile, a precisely straight-on orthographic elevation, square 2048x2048 image. It fills the ENTIRE image edge to edge, without building silhouette, perspective, horizon, sky, border, caption or watermark.
Composition: exactly 8 equal-width window bays across and exactly 8 equal-height stories down, making a regular aligned 8 by 8 modular grid. Each cell has thin satin charcoal aluminum vertical mullions and a slightly wider horizontal charcoal floor spandrel at its bottom. Glazing occupies most of every cell. Pattern must repeat smoothly at all four boundaries.
Materials: restrained blue-gray low-iron glass with subtle softly blurred varied interior depth, dark rooms, occasional half-closed gray blinds and hints of off-white ceilings. Fine genuine brushed anodized aluminum mullions, matte mineral spandrels, faint cleaning streaks and tiny believable surface wear visible only up close. Sophisticated practical near-future architecture, inhabited and maintained, detailed rather than sterile.
Lighting: diffuse neutral studio illumination for an albedo map, equal average exposure across the tile, no directional cast shadows. Mostly unlit windows; avoid luminous white rectangles and avoid baked nighttime lighting. Glass is deep muted slate gray with only very soft dim abstract reflected tones, NOT bright blue or mirror chrome. Readable subtle material variation.
Avoid: plastic glossy surface, simple flat colored rectangles, neon, cyan outline, heavy grunge, ruins, large random geometric panels, buildings or trees reflected in glass, people, signs, logos, dramatic gradients, perspective distortion, isometric views, bevelled sci-fi armor, text.

## 屋面完整提示词

Use case: photorealistic-natural
Asset type: seamless physically based architectural roof albedo texture for a realistic 3D space city, square image.
Primary request: A high-resolution perfectly orthographic top-down scan of a flat, matte, mineral-composite commercial roof surface. Entire square filled edge to edge with the surface. Represents approximately 12 metres by 12 metres, with a restrained regular grid of large square mineral slab modules and very narrow recessed expansion seams. Four by four equal panels, repeatable at all four boundaries. Quiet warm-neutral graphite gray, not bright blue, silver, white or black.
Materials: genuinely photographed fine stone aggregate and cementitious mineral surface with tiny granular detail, subtle cloudy manufacturing variation between panels, faint restrained service wear and a few gentle deposits around fine seams. Clean maintained architecture in a sealed orbital habitat, not a ruined building. High material fidelity, low contrast natural texture, no glossy coating.
Lighting: flat diffuse shadowless illumination appropriate for a base-color texture. No bright specular highlights or directional baked shadows.
Constraints: no perspective, no horizon, no objects, no vents, no greenery, no holes, no lettering, no border, no watermark, no dramatic dirt, no large cracks, no sci-fi greebles, no bevelled armor plating. Natural fine-scale variation, no plastic smoothness.

