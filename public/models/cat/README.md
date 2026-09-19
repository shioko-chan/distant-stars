# Bicolor Cat

`cat.glb` is **Bicolor Cat** by [kenchoo](https://sketchfab.com/kenchoo), a
rebuild and animated adaptation of **3d modelling my cat: Fripouille** by
[guillaume bolis](https://sketchfab.com/guillaume.bolis).

Both works are licensed under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).
The complete license is included in `LICENSE.txt`.

- Animated model: https://sketchfab.com/3d-models/bicolor-cat-e623a618ca344a8393d7ba4d63ec23cf
- Original model: https://sketchfab.com/3d-models/3d-modelling-my-cat-fripouille-0ab14bf98e754f8d90fe1bf1c84ca66c
- Public download mirror: https://raw.githubusercontent.com/code4fukui/vr-cats/main/bicolor_cat.glb
- Mirror's attribution record: https://github.com/code4fukui/vr-cats#3d-models-and-attribution
- Downloaded: 2026-09-19

The downloaded GLB and its embedded textures are unchanged. Distant Stars
adapts the model at runtime with dark fur material, scene lighting, and a
scripted jump/landing movement. The source includes an idle motion, **not**
a dedicated jump animation. No endorsement by the original artists is implied.

Suggested compact credit (with links to this file and the license):

> Cat: kenchoo / guillaume bolis · CC BY 4.0 · dark material and motion adapted.

## Integration notes

- Self-contained glTF 2.0 binary; 2,297,972 bytes. No Draco decoder required.
- 3 mesh primitives, 2 skinned meshes, 40 joints. Up: +Y. Forward: +Z.
- Loaded rest bounds in Three.js (metres):
  `min = [-0.070259, -0.001989, -0.408207]`,
  `max = [0.068892, 0.370549, 0.306528]`.
- Height: approximately 0.373 m; length including tail: 0.715 m.
- One clip named `Animation`, 8.708333 seconds, 38 tracks. It is an in-place
  subtle idle motion. Apply travel / turning / jumping to a parent group so
  the animation mixer does not overwrite scene placement.
- `cat_diffuse`: body and whiskers; embedded base colour, normal, and
  metallic/roughness textures. Tint this material for dark fur.
- `material`: glossy details including eyes; keep its original base texture
  and colour so the eyes are preserved when darkening the fur.
- Both materials share the 1024×1024 base-colour atlas. Keep the normal map
  and texture data when tinting. For lit fur, set an appropriate roughness
  and avoid making the body metallic.
- Head/neck joint: `Wolf_Neck_TopSHJnt_14`. Spine top:
  `Wolf_Spine_TopSHJnt_17`. Tail chain:
  `Wolf_Tail_01_02SHJnt_37` through `Wolf_Tail_01_05SHJnt_34`.
- Front legs: `Wolf_l_FrontLeg_HipSHJnt_4`,
  `Wolf_r_FrontLeg_HipSHJnt_10`. Hind legs:
  `Wolf_l_HindLeg_HipSHJnt_27`, `Wolf_r_HindLeg_HipSHJnt_33`.
- Clone multiple cats with `SkeletonUtils.clone`, not `Object3D.clone`, to
  preserve independent skeleton bindings.
