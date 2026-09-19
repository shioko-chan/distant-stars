# Low Poly Cat Walk

- Author: [volkanongun](https://sketchfab.com/volkanongun)
- Source: https://sketchfab.com/3d-models/low-poly-cat-walk-13674c3dbb074f73b6563a75c28b0fe0
- License: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); full text in `../LICENSE.txt`.
- Downloaded from Sketchfab by the user on 2026-09-20.
- `walk.glb` is the unchanged 200,496-byte source. No endorsement is implied.

Run `node scripts/cat/retarget-walk.mjs` from the repository root to regenerate
`public/models/cat/walk.animation.json`. The 1.25-second source cycle is retimed
to 1.8 seconds. Source leg direction changes and foot trajectories are fitted
to the target's rest pose and bone lengths using planar CCD. Left/right labels
are mapped by their physical sides. The target's torso pose and skin are kept.

The conversion validates finite normalized quaternions, matching loop endpoints
and a maximum foot trajectory fitting error below 1.5 cm in native target units.
The derived clip is an in-place gait. The runtime adds slow random travel,
turning and pauses, rejecting paths through furniture footprints. The source
mesh is not loaded at runtime. The arrival places the cat on the desk after
the camera has reached the chair; no jump animation is played.

## Ground contact

`src/content/catGait.json` shares cycle duration, stride and model scale between
conversion and runtime. Source lift phases are retained; support feet travel
backward at precisely the forward travel speed. Swing trajectories join those
support segments with matching endpoint velocity. Runtime clip progress follows
actual distance (and pivot steps), including partial last steps.

Run `node scripts/cat/check-walk.mjs --assert` to load the real exported clip and
measure world-space sliding of grounded toe joints. The previous clip at 0.22 m/s
had median slip 0.146 m/s; the corrected gait is approximately 0.00044 m/s median
and 0.0021 m/s at the 90th percentile. This test covers straight travel, not turns.
