# Space Station Kit models

Downloaded from the official Kenney Space Station Kit 1.0 on 2026-09-19.

- Creator: **Kenney** — https://kenney.nl/
- Asset page: https://kenney.nl/assets/space-station-kit
- Download: https://kenney.nl/media/pages/assets/space-station-kit/6475288f2e-1712749919/kenney_space-station-kit.zip
- License: **Creative Commons Zero (CC0 1.0)**, https://creativecommons.org/publicdomain/zero/1.0/
- The original license is preserved in `LICENSE.txt`. Commercial use, redistribution and modification are permitted; attribution is appreciated but not required.
- The GLB files and `Textures/colormap.png` are unmodified files extracted from the official archive. Only selected useful interior props are included.

## Loading and orientation

All models are glTF 2.0 binary (`.glb`) and use **Y up**. There are no animations, rigs, compression extensions or external binary buffers. They share one external 7.4 KB texture at the case-sensitive relative URI `Textures/colormap.png`; preserve that directory alongside the models.

Computers' visible screen faces point toward **+Z**. The chair also faces +Z. Models use a shared white/gray/gold palette. The files use simple, low-poly meshes and one material per mesh, so they are appropriate for repeated bridge props. Texture coordinates select colors from a shared atlas; materials may be cloned and tuned for metallic/roughness styling while retaining the original downloaded geometry.

Included scene props:

- `table-inset.glb`: wide central command platform. Bottom **Y=-0.300**, central recessed surface **Y=0.050**, surrounding top rim **Y=0.100**. A uniform scale of 3 and group position Y=0.9 puts the bottom on the floor, inset landing surface at world Y=1.05 and rim at Y=1.20. It has no holographic geometry obstructing the cat's landing.
- `computer-wide.glb`: a sloping, wide control terminal; screen faces +Z and upward. Root Y=0 is the bottom; total height is 0.497. Put it on the back portion of the command platform.
- `computer-system.glb`: a complete compact floor terminal with side braces, front +Z; bottom Y=0 and top Y=0.600.
- `chair-armrest-headrest.glb`: seat facing +Z, Y=0..0.700.
- `wall-detail.glb`: wall-mounted equipment panel, Y=0..0.700.
- `door-double-closed.glb`: closed double door, Y=0..0.700.

The shipped subset contains **6 GLB files (83,316 bytes; 786 triangles)** and one **7,440-byte** shared texture. Other models from the source archive are omitted.

## Bounds

Bounds below include node translations and are measured in original model units. Scale modules to the scene's chosen meter convention. X is width, Y is height, Z is depth.

| File | Bytes | Minimum (X, Y, Z) | Maximum (X, Y, Z) |
| --- | ---: | --- | --- |
| `chair-armrest-headrest.glb` | 14,308 | (-0.250, 0.000, -0.175) | (0.250, 0.700, 0.175) |
| `computer-system.glb` | 17,552 | (-0.450, 0.000, -0.372) | (0.450, 0.600, 0.322) |
| `computer-wide.glb` | 17,136 | (-0.400, 0.000, -0.237) | (0.400, 0.497, 0.297) |
| `door-double-closed.glb` | 6,984 | (-0.300, 0.000, -0.050) | (0.300, 0.700, 0.050) |
| `table-inset.glb` | 12,240 | (-0.621, -0.300, -0.371) | (0.621, 0.100, 0.371) |
| `wall-detail.glb` | 15,096 | (-0.200, 0.000, -0.087) | (0.200, 0.700, 0.087) |

Source archive SHA-256: `215e79bd5415cff93665183390f0343ed9acf87780306331013b78520170c6d8`.
