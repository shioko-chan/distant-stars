import { describe, expect, it } from 'vitest';
import { EARTH, geographicPoint, terrainSample } from '../../simulation/terrain';
import { length, pickSurface, project, ray, scale, sphereHit, surfacePosition, type Camera } from './math';
import { solarScene } from './astronomy';
describe('native viewport geographic contract', () => {
    const camera: Camera = { position: [4, 0, 0], target: [0, 0, 0], fov: 42 };
    it('round trips viewport coordinates at different aspect ratios', () => {
        for (const [width, height] of [[1440, 900], [900, 1440], [2560, 1080]])
            for (const [lat, lon] of [[0, 0], [20, 30], [-15, -25]]) {
                const n = geographicPoint(lat, lon), point = surfacePosition(n, 0, EARTH), screen = project(point, camera, width, height);
                const hit = pickSurface(camera.position, ray(screen.x, screen.y, camera, width, height), EARTH)!;
                hit.forEach((v, i) => expect(v).toBeCloseTo(n[i], 5));
            }
    });
    it('keeps close-up picking registered with the simulation height field', () => {
        const n = geographicPoint(32, 88), ground = length(surfacePosition(n, 0, EARTH));
        expect(terrainSample(n, EARTH).height).toBeGreaterThan(3500);
        const hit = pickSurface(scale(n, ground + .0006), scale(n, -1), EARTH)!;
        hit.forEach((v, i) => expect(v).toBeCloseTo(n[i], 8));
    });
    it('does not fabricate a hit on empty space or behind the camera', () => {
        expect(pickSurface([4, 0, 0], [0, 1, 0], EARTH)).toBeUndefined();
        expect(sphereHit([4, 0, 0], [1, 0, 0], 1.8)).toBeUndefined();
    });
    it('preserves the physical apparent size of Earth across the station rotation', () => {
        for (const seconds of [0, 60, 180, 600]) {
            const earth = solarScene(seconds).find(o => o.id === 'sky:earth')!;
            if (!('radius' in earth))
                throw new Error('Earth must be a native sphere');
            expect(2 * Math.asin(earth.radius / length(earth.position)) * 180 / Math.PI).toBeCloseTo(29, 8);
        }
    });
});
