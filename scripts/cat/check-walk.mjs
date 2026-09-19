import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadRig } from './load-rig.mjs';
const rig = await loadRig('public/models/cat/cat.glb');
const clip = THREE.AnimationClip.parse(JSON.parse(fs.readFileSync('public/models/cat/walk.animation.json')));
const gait = JSON.parse(fs.readFileSync('src/content/catGait.json'));
const scale = gait.modelScale;
const speed = gait.stride * scale / gait.duration;
const feet = [];
rig.scene.traverse(o => { if (o.isBone && /Leg_ToeSHJnt/.test(o.name)) feet.push(o); });
const mixer = new THREE.AnimationMixer(rig.scene);
mixer.clipAction(clip).play();
const dt = 1 / 240;
const slip = [];
let previous;
for (let t = 0; t < clip.duration; t += dt) {
    mixer.setTime(t); rig.scene.updateMatrixWorld(true);
    const points = feet.map(f => f.getWorldPosition(new THREE.Vector3()).multiplyScalar(scale));
    if (previous) points.forEach((p, i) => {
        if (p.y < .001 && previous[i].y < .001) slip.push(Math.abs((p.z - previous[i].z) / dt + speed));
    });
    previous = points;
}
slip.sort((a, b) => a - b);
const median = slip[Math.floor(slip.length * .5)], p90 = slip[Math.floor(slip.length * .9)];
console.log({ samples: slip.length, speed, medianContactSlip: median, p90ContactSlip: p90 });
if (process.argv.includes('--assert')) { assert(slip.length > 100); assert(median < .005); assert(p90 < .015); }
