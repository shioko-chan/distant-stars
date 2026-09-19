import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadRig } from './load-rig.mjs';

const gait = JSON.parse(fs.readFileSync('src/content/catGait.json'));
const source = await loadRig('public/models/cat/walk-source/walk.glb');
const target = await loadRig('public/models/cat/cat.glb');
const position = bone => bone.getWorldPosition(new THREE.Vector3());
const rest = [];
target.scene.traverse(object => {
    if (object.isBone) rest.push({ bone: object, position: object.position.clone(), quaternion: object.quaternion.clone(), world: object.getWorldQuaternion(new THREE.Quaternion()) });
});
// The source labels left/right oppositely to the target. Match physical sides.
const definitions = [
    ['l', 'Front', ['013', '014', '015', '016', '017']],
    ['r', 'Front', ['018', '019', '020', '021', '022']],
    ['l', 'Hind', ['036', '037', '038', '039', '040']],
    ['r', 'Hind', ['041', '042', '043', '044', '045']],
];
const legs = definitions.map(([side, limb, ids]) => {
    const names = limb === 'Front' ? ['Hip', 'Knee', 'Ankle', 'Ball', 'Toe'] : ['Hip', 'Knee1', 'Knee2', 'Ankle', 'Ball', 'Toe'];
    const chain = names.map(name => rest.find(r => r.bone.name.startsWith(`Wolf_${side}_${limb}Leg_${name}SHJnt`)));
    assert(chain.every(Boolean));
    const sourceChain = ids.map(id => {
        let found;
        source.scene.traverse(o => { if (o.isBone && o.name.endsWith('_' + id)) found = o; });
        assert(found); return found;
    });
    return { chain, sourceChain, restFoot: position(chain.at(-1).bone), samples: [] };
});
const mixer = new THREE.AnimationMixer(source.scene);
mixer.clipAction(source.animations[0]).play();
const sourceDuration = source.animations[0].duration;
const frames = Math.round(sourceDuration * 60);
// A relaxed pace, preserving the source's four-foot timing rather than slowing a run.
const duration = gait.duration;
for (let frame = 0; frame < frames; frame++) {
    mixer.setTime(frame / frames * sourceDuration);
    source.scene.updateMatrixWorld(true);
    for (const leg of legs) {
        const points = leg.sourceChain.map(position);
        leg.samples.push({ foot: points.at(-1), angles: points.slice(0, -1).map((p, i) => {
            const d = points[i + 1].clone().sub(p);
            return Math.atan2(d.z, -d.y);
        }) });
    }
}
for (const leg of legs) {
    leg.floor = Math.min(...leg.samples.map(s => s.foot.y));
    // Retain each source leg's lift timing, but make support motion cancel travel.
    leg.liftPhase = leg.samples.reduce((best, s, i, all) => s.foot.y > all[best].foot.y ? i : best, 0) / frames;
    leg.meanAngles = leg.samples[0].angles.map((_, i) => Math.atan2(
        leg.samples.reduce((sum, s) => sum + Math.sin(s.angles[i]), 0),
        leg.samples.reduce((sum, s) => sum + Math.cos(s.angles[i]), 0)));
}
const axis = new THREE.Vector3(1, 0, 0);
function setWorldSwing(record, angle) {
    const desired = new THREE.Quaternion().setFromAxisAngle(axis, angle).multiply(record.world);
    record.bone.quaternion.copy(record.bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(desired));
    record.bone.updateMatrixWorld(true);
}
const animated = legs.flatMap(leg => leg.chain.slice(0, -1));
const values = new Map(animated.map(r => [r.bone.name, []]));
const times = [];
let maxFootError = 0;
for (let frame = 0; frame <= frames; frame++) {
    times.push(frame / frames * duration);
    for (const r of rest) { r.bone.position.copy(r.position); r.bone.quaternion.copy(r.quaternion); }
    target.scene.updateMatrixWorld(true);
    for (const leg of legs) {
        const sample = leg.samples[frame % frames];
        // Transfer gait direction changes without importing incompatible joint roll.
        for (let i = 0; i < leg.chain.length - 1; i++) {
            const segment = Math.min(i, sample.angles.length - 1);
            const difference = sample.angles[segment] - leg.meanAngles[segment];
            setWorldSwing(leg.chain[i], Math.atan2(Math.sin(difference), Math.cos(difference)) * .65);
        }
        const goal = leg.restFoot.clone();
        const swingFraction = 1 - gait.stanceFraction;
        const phase = ((frame % frames) / frames - leg.liftPhase + swingFraction / 2 + 1) % 1;
        const reach = gait.stride * gait.stanceFraction / 2;
        if (phase < swingFraction) {
            const u = phase / swingFraction;
            // Cubic Hermite: match the support velocity at lift-off and touchdown.
            const tangent = -gait.stride * swingFraction;
            goal.z += (2*u*u*u - 3*u*u + 1) * -reach + (u*u*u - 2*u*u + u) * tangent
                + (-2*u*u*u + 3*u*u) * reach + (u*u*u - u*u) * tangent;
            goal.y += .05 * Math.sin(Math.PI * u) ** 2;
        } else {
            goal.z += reach - gait.stride * (phase - swingFraction);
        }
        const tip = leg.chain.at(-1).bone;
        // Planar CCD fits the source foot trajectory to this cat's actual leg lengths.
        // The foot's x coordinate stays with its original leg to avoid crossing paws.
        for (let iteration = 0; iteration < 32; iteration++) {
            for (const joint of leg.chain.slice(0, -1).reverse()) {
                const origin = position(joint.bone);
                const from = position(tip).sub(origin), to = goal.clone().sub(origin);
                const angle = Math.atan2(from.y * to.z - from.z * to.y, from.y * to.y + from.z * to.z);
                const world = joint.bone.getWorldQuaternion(new THREE.Quaternion());
                world.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.clamp(angle, -.12, .12)));
                joint.bone.quaternion.copy(joint.bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));
                joint.bone.updateMatrixWorld(true);
            }
            const foot = position(tip);
            if (Math.hypot(foot.y - goal.y, foot.z - goal.z) < .0005) break;
        }
        const foot = position(tip);
        maxFootError = Math.max(maxFootError, Math.hypot(foot.y - goal.y, foot.z - goal.z));
        for (const r of leg.chain.slice(0, -1)) values.get(r.bone.name).push(...r.bone.quaternion.toArray());
    }
}
const tracks = animated.map(r => new THREE.QuaternionKeyframeTrack(r.bone.name + '.quaternion', times, values.get(r.bone.name)));
const clip = new THREE.AnimationClip('Walk', duration, tracks).optimize();
assert(clip.validate());
assert(maxFootError < .015, `Foot fitting error ${maxFootError}`);
for (const track of clip.tracks) {
    assert([...track.values].every(Number.isFinite));
    for (let i = 0; i < track.values.length; i += 4) assert(Math.abs(Math.hypot(...track.values.slice(i, i + 4)) - 1) < 1e-5);
    for (let i = 0; i < 4; i++) assert(Math.abs(track.values[i] - track.values[track.values.length - 4 + i]) < 1e-6);
}
fs.writeFileSync('public/models/cat/walk.animation.json', JSON.stringify(THREE.AnimationClip.toJSON(clip)) + '\n');
console.log({ sourceDuration, duration, frames: frames + 1, tracks: tracks.length, maxFootError });
