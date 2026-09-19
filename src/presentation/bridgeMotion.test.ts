import { describe, expect, it } from 'vitest';
import { BRIDGE_MOTION_DURATION, CAMERA_END_POSITION, CAMERA_START_POSITION, CAT_LANDING_POSITION, sampleBridgeMotion } from './bridgeMotion';
import { CAT_WALK_SPEED, catPathClear, catPositionClear, createCatWander } from './catWander';

describe('seated opening', () => {
    it('sits before revealing the cat on the desk', () => {
        expect(sampleBridgeMotion(0).cameraPosition).toEqual(CAMERA_START_POSITION);
        expect(sampleBridgeMotion(3.3).cameraPosition).toEqual(CAMERA_END_POSITION);
        expect(sampleBridgeMotion(3.3).catVisible).toBe(false);
        expect(sampleBridgeMotion(3.5).catVisible).toBe(true);
        expect(sampleBridgeMotion(3.5).catPosition).toEqual(CAT_LANDING_POSITION);
        expect(sampleBridgeMotion(BRIDGE_MOTION_DURATION).phase).toBe('complete');
    });
    it('keeps the camera continuous at phase boundaries', () => {
        for (const t of [2.4, 3.3, 3.45, 4.8, BRIDGE_MOTION_DURATION]) {
            const before = sampleBridgeMotion(t - 1e-6), after = sampleBridgeMotion(t + 1e-6);
            for (const key of ['cameraPosition', 'cameraTarget'] as const) before[key].forEach((v, i) => expect(v).toBeCloseTo(after[key][i], 4));
        }
    });
    it('clamps invalid times', () => {
        expect(sampleBridgeMotion(NaN)).toEqual(sampleBridgeMotion(0));
        expect(sampleBridgeMotion(-Infinity)).toEqual(sampleBridgeMotion(0));
        expect(sampleBridgeMotion(Infinity)).toEqual(sampleBridgeMotion(BRIDGE_MOTION_DURATION));
    });
});
describe('cat wandering', () => {
    it('rejects furniture intersections even when endpoints are free', () => {
        expect(catPathClear({ x: -4, z: -7.2 }, { x: 0, z: -7.2 })).toBe(false);
        expect(catPositionClear({ x: 1.1, z: -5.65 })).toBe(false);
    });
    it('keeps a long deterministic walk clear and within speed limits', () => {
        let seed = 42;
        const wander = createCatWander(() => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32));
        let moved = 0;
        for (let i = 0; i < 18000; i++) {
            const previous = { ...wander.position };
            const sample = wander.update(1 / 30);
            expect(catPositionClear(sample)).toBe(true);
            const distance = Math.hypot(sample.x - previous.x, sample.z - previous.z);
            expect(distance).toBeLessThanOrEqual(CAT_WALK_SPEED / 30 + 1e-8);
            expect(sample.distanceMoved).toBeCloseTo(distance, 8);
            moved += distance;
        }
        expect(moved).toBeGreaterThan(10);
        const previous = { ...wander.position };
        wander.update(10, false);
        expect(wander.position).toEqual(previous);
    });
});
