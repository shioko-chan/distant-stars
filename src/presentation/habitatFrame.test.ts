import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { HABITAT_ANGULAR_SPEED, HABITAT_AXIAL_MAX, HABITAT_AXIAL_MIN, HABITAT_CAP_Z, HABITAT_GRAVITY, HABITAT_GROUND_Y, HABITAT_HALF_WIDTH_M, HABITAT_RADIUS_M, HABITAT_ROTATION_PERIOD, HABITAT_RPM, habitatOrientation, habitatPoint } from './habitatFrame';

describe('co-rotating cylindrical habitat', () => {
    it('produces standard gravity at the room floor with a derived spin rate', () => {
        expect(HABITAT_ANGULAR_SPEED ** 2 * HABITAT_RADIUS_M).toBeCloseTo(HABITAT_GRAVITY, 12);
        expect(HABITAT_RADIUS_M).toBe(15_000);
        expect(HABITAT_HALF_WIDTH_M * 2).toBe(24_000);
        // The residence stands just inside the Earth-facing endcap, so the interior extends along +Z.
        expect(HABITAT_AXIAL_MIN).toBe(HABITAT_CAP_Z);
        expect(HABITAT_CAP_Z).toBeLessThan(0);
        expect(HABITAT_AXIAL_MAX - HABITAT_AXIAL_MIN).toBe(24_000);
        expect(HABITAT_ROTATION_PERIOD).toBeCloseTo(245.7339491, 7);
        expect(HABITAT_RPM * HABITAT_ROTATION_PERIOD / 60).toBeCloseTo(1, 12);
        // A lower city floor is farther from the axis, so its apparent gravity is slightly larger.
        const groundRadius = habitatPoint(0, HABITAT_GROUND_Y, 0).distanceTo(new Vector3(0, HABITAT_RADIUS_M, 0));
        expect(HABITAT_ANGULAR_SPEED ** 2 * groundRadius)
            .toBeCloseTo(HABITAT_GRAVITY * (1 - HABITAT_GROUND_Y / HABITAT_RADIUS_M), 10);
    });

    it('curves floor coordinates continuously around the complete ring', () => {
        expect(habitatPoint(0, 0, 19).toArray()).toEqual([0, 0, 19]);
        expect(habitatPoint(0, HABITAT_GROUND_Y, 0).y).toBe(-240);
        const radius = HABITAT_RADIUS_M;
        expect(habitatPoint(Math.PI * radius / 2, 0, 19).distanceTo(new Vector3(radius, radius, 19))).toBeLessThan(1e-9);
        expect(habitatPoint(Math.PI * radius, 0, 19).distanceTo(new Vector3(0, radius * 2, 19))).toBeLessThan(1e-9);
        expect(habitatPoint(Math.PI * radius * 2, 0, 19).distanceTo(habitatPoint(0, 0, 19))).toBeLessThan(1e-9);
    });

    it('aligns building up with the inward normal and the street axis with its tangent', () => {
        for (const arc of [-80_000, -1234, 0, 41_000, 160_000]) {
            const position = habitatPoint(arc, HABITAT_GROUND_Y, 2000);
            const inward = new Vector3(0, HABITAT_RADIUS_M, 2000).sub(position).normalize();
            const orientation = habitatOrientation(arc);
            const up = new Vector3(0, 1, 0).applyQuaternion(orientation);
            const tangent = habitatPoint(arc + .01, HABITAT_GROUND_Y, 2000)
                .sub(habitatPoint(arc - .01, HABITAT_GROUND_Y, 2000)).normalize();
            expect(up.distanceTo(inward)).toBeLessThan(1e-12);
            expect(new Vector3(1, 0, 0).applyQuaternion(orientation).distanceTo(tangent)).toBeLessThan(1e-8);
            expect(up.dot(tangent)).toBeCloseTo(0, 8);
        }
    });
});
