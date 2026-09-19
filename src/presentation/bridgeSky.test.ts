import { afterEach, describe, expect, it, vi } from 'vitest';
import { Euler, Points, Quaternion, Scene, ShaderMaterial, Texture, TextureLoader, Vector3 } from 'three';
import catalogue from '../content/skyStars.json';
import { createBridgeSky } from './bridgeSky';
import { STATION_ORBIT_PERIOD } from './stationOrbit';

afterEach(() => vi.restoreAllMocks());

describe('layered observation-deck sky', () => {
    it('keeps stars aligned with the panorama throughout the station orbit', async () => {
        vi.spyOn(TextureLoader.prototype, 'loadAsync').mockImplementation(async () => new Texture());
        const scene = new Scene();
        const sky = createBridgeSky(scene, new TextureLoader(), new Set(), () => false);
        await sky.ready;
        const stars = scene.getObjectByName('catalogue-stars')!;
        const initial = new Quaternion();
        for (const seconds of [0, STATION_ORBIT_PERIOD / 4, STATION_ORBIT_PERIOD / 2, STATION_ORBIT_PERIOD]) {
            sky.update(seconds, 1.5);
            if (!seconds) initial.copy(stars.quaternion);
            const rotation = scene.backgroundRotation;
            // Emulate Three r173's lookup matrix, independently of the sky helper.
            const lookup = new Quaternion().setFromEuler(new Euler(-rotation.x, -rotation.y, -rotation.z));
            for (const local of [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(.3, .4, .5).normalize()]) {
                const sampledDirection = local.clone().applyQuaternion(stars.quaternion).applyQuaternion(lookup);
                // Euler conversion near a 90° pitch loses about 1e-8 radians in Three.
                expect(sampledDirection.distanceTo(local)).toBeLessThan(1e-7);
            }
        }
        expect(stars.quaternion.angleTo(initial)).toBeLessThan(1e-7);
    });

    it('uses valid catalogue directions, omits the Sun, and scales point footprints with pixel density', async () => {
        const ids = new Set<number>();
        expect(catalogue.stars.length).toBeGreaterThan(8_000);
        for (const [id, x, y, z, magnitude, bv] of catalogue.stars) {
            expect(ids.has(id!)).toBe(false);
            ids.add(id!);
            expect(new Vector3(x!, y!, z!).length()).toBeCloseTo(1, 6);
            expect(magnitude).toBeGreaterThan(-2);
            expect(magnitude).toBeLessThanOrEqual(6.5);
            expect(bv === null || Number.isFinite(bv)).toBe(true);
        }
        // Sirius: known apparent magnitude and Galactic coordinates (l≈227°, b≈−9°).
        const sirius = catalogue.stars.find(([id]) => id === 32349)!;
        expect(sirius[4]).toBe(-1.44);
        expect(Math.atan2(-sirius[3]!, sirius[1]!) * 180 / Math.PI + 360).toBeCloseTo(227.23, 1);
        expect(Math.asin(sirius[2]!) * 180 / Math.PI).toBeCloseTo(-8.89, 1);
        vi.spyOn(TextureLoader.prototype, 'loadAsync').mockImplementation(async () => new Texture());
        const scene = new Scene();
        const sky = createBridgeSky(scene, new TextureLoader(), new Set(), () => false);
        await sky.ready;
        const points = scene.getObjectByName('catalogue-stars') as Points;
        expect(points.geometry.getAttribute('position').count).toBe(catalogue.stars.length);
        expect(points.material).toHaveProperty('depthTest', true);
        expect(points.material).toHaveProperty('depthWrite', false);
        sky.update(0, 1.5);
        expect((points.material as ShaderMaterial).uniforms.pixelRatio.value).toBe(1.5);
    });
});
