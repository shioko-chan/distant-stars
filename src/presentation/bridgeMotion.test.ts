import { describe, expect, it } from 'vitest';
import {
    BRIDGE_MOTION_DURATION, CAMERA_END_POSITION, CAMERA_START_POSITION,
    CAT_LANDING_POSITION, CAT_START_POSITION, sampleBridgeMotion,
} from './bridgeMotion';

describe('bridge opening choreography', () => {
    it('starts behind the cat and finishes with its feet on the console', () => {
        const start = sampleBridgeMotion(0);
        expect(start.catPosition).toEqual(CAT_START_POSITION);
        expect(start.catScale).toEqual([1, 1, 1]);
        expect(start.catYaw).toBe(Math.PI);
        expect(start.cameraPosition).toEqual(CAMERA_START_POSITION);
        expect(start.cameraFov).toBe(48);
        expect(start.screenBlend).toBe(0);

        const end = sampleBridgeMotion(BRIDGE_MOTION_DURATION);
        expect(end.catPosition).toEqual(CAT_LANDING_POSITION);
        expect(end.catScale).toEqual([1, 1, 1]);
        expect(end.catYaw).toBe(Math.PI);
        expect(end.cameraPosition).toEqual(CAMERA_END_POSITION);
        expect(end.cameraFov).toBe(43);
        expect(end.screenBlend).toBeCloseTo(1);
    });

    it('jumps above the landing surface and keeps the feet planted after touchdown', () => {
        expect(sampleBridgeMotion(0.9).catPosition[1]).toBeGreaterThan(CAT_LANDING_POSITION[1]);
        for (let time = 0.46; time < 1.35; time += 0.02) {
            expect(sampleBridgeMotion(time).catPosition[1]).toBeGreaterThan(0);
        }
        for (const time of [1.35, 1.475, 1.6, 3, BRIDGE_MOTION_DURATION]) {
            expect(sampleBridgeMotion(time).catPosition).toEqual(CAT_LANDING_POSITION);
        }
    });

    it('clears the console front rim before descending and keeps landing paws level', () => {
        const overRim = sampleBridgeMotion(1.26);
        expect(overRim.catPosition[1]).toBeGreaterThan(1.2);
        const descending = sampleBridgeMotion(1.3);
        expect(descending.catPosition[1]).toBeLessThan(1.2);
        // The rotated cat's rear paws extend about .42 m behind its root.
        // They must pass the inset's front edge at z=-1.9 before dropping below the rim.
        expect(descending.catPosition[2] + 0.42).toBeLessThan(-1.9);
        for (const time of [1.35, 1.4, 1.475, 1.55, 1.6]) {
            expect(sampleBridgeMotion(time).catPitch).toBe(0);
        }
    });

    it('keeps transforms continuous across choreography boundaries', () => {
        for (const boundary of [0.45, 1.35, 1.6, 4.1, BRIDGE_MOTION_DURATION]) {
            const before = sampleBridgeMotion(boundary - 0.000001);
            const after = sampleBridgeMotion(boundary + 0.000001);
            for (const key of ['catPosition', 'catScale', 'cameraPosition', 'cameraTarget'] as const) {
                before[key].forEach((value, index) => expect(value).toBeCloseTo(after[key][index], 4));
            }
            for (const key of ['catYaw', 'catPitch', 'cameraFov', 'screenBlend'] as const) {
                expect(before[key]).toBeCloseTo(after[key], 4);
            }
        }
    });

    it('waits for landing before approaching and blends in only at the end', () => {
        expect(sampleBridgeMotion(0).phase).toBe('preparing');
        expect(sampleBridgeMotion(0.45).phase).toBe('jumping');
        expect(sampleBridgeMotion(1.35).phase).toBe('landing');
        expect(sampleBridgeMotion(1.6).phase).toBe('approaching');
        expect(sampleBridgeMotion(1.6).cameraPosition).toEqual(CAMERA_START_POSITION);
        expect(sampleBridgeMotion(4.1).screenBlend).toBe(0);
        expect(sampleBridgeMotion(4.35).screenBlend).toBeCloseTo(0.5);
        expect(sampleBridgeMotion(BRIDGE_MOTION_DURATION).phase).toBe('complete');
    });

    it('clamps invalid or out-of-range times to stable endpoints', () => {
        for (const time of [-1, -Infinity, NaN]) {
            expect(sampleBridgeMotion(time)).toEqual(sampleBridgeMotion(0));
        }
        for (const time of [100, Infinity]) {
            expect(sampleBridgeMotion(time)).toEqual(sampleBridgeMotion(BRIDGE_MOTION_DURATION));
        }
    });
});
