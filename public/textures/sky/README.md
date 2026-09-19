# Layered Galactic sky

The deck combines a restrained diffuse Milky Way panorama with independently rendered bright stars. Both share one orientation and the station's orbit rotation. The old all-in-one sky texture has been removed.

## Diffuse Milky Way

- Source: [NASA SVS — Deep Star Maps 2020](https://svs.gsfc.nasa.gov/4851/).
- Original: [milkyway_2020_8k_gal.exr](https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/milkyway_2020_8k_gal.exr), 8192 × 4096, Galactic coordinates, without the bright Hipparcos/Tycho foreground. Fainter unresolved stars remain in this layer.
- Credit: NASA/Goddard Space Flight Center Scientific Visualization Studio; Ernie Wright (USRA). Gaia DR2: ESA/Gaia/DPAC.
- Usage: [NASA SVS policy](https://svs.gsfc.nasa.gov/help/); public domain unless otherwise noted. No constellation overlays are included. No NASA endorsement is implied.
- Downloaded 2026-09-19. EXR SHA-256: `d319113f35e45f7f66f2844f088639cc07cda74a5049299a6098d41e2ade3d28`.

Format conversion (FFmpeg; original EXR is not distributed):

```sh
ffmpeg -apply_trc iec61966_2_1 -i milkyway_2020_8k_gal.exr -frames:v 1 -c:v libwebp -quality 94 public/textures/sky/milky-way-diffuse-8k.webp
```

Runtime uses this local WebP with sRGB decoding and background intensity 0.5. Bright stars are absent from the panorama, so their original large photographic-looking spots are not doubled by the point renderer. This remains an artistic display, not an absolute photometric or eye-adaptation simulation.

## Independent bright stars

- Source: ESA 1997, *The Hipparcos and Tycho Catalogues*, ESA SP-1200; [CDS catalogue I/239](https://cdsarc.cds.unistra.fr/ftp/I/239/), `hip_main.dat` and its `ReadMe` field definitions.
- Original data SHA-256: `58ceabb104d647160d9437ce6e513a02a036bb4ad9f8879a5a22fd52943616e0`.
- `src/content/skyStars.json`: 8,870 entries with Johnson V magnitude ≤ 6.5, containing HIP identifier, unit direction, magnitude and B−V colour index. Missing position/magnitude entries are omitted. The three missing colour measurements use neutral tint at runtime.
- J1991.25 positions are advanced to J2000.0 using catalogue proper motion, then converted to Galactic coordinates with [ESA Gaia EDR3 equation 4.62](https://gea.esac.esa.int/archive/documentation/GEDR3/Data_processing/chap_cu3ast/sec_cu3ast_intro/ssec_cu3ast_intro_tansforms.html). Perspective acceleration, variable-star light curves and the game's date are not modelled.
- Rebuild with `python3 scripts/prepare_sky_stars.py /absolute/path/hip_main.dat`; standard Python only. The full 51 MB catalogue is not included at runtime.

The stars form one GPU point cloud. Small smooth cores scale with display pixel density, with restrained colour, magnitude-dependent brightness and faint local halos. They rotate with the Milky Way, are depth-tested against planets, and add no artificial twinkling or room-scale parallax. Stars between magnitude 6.5 and the original bright-foreground cutoff are deliberately omitted to keep the view uncluttered.
