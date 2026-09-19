import { afterEach, describe, expect, it, vi } from 'vitest';
import { Mesh, PerspectiveCamera, Texture, TextureLoader, Vector3 } from 'three';
import { SOLAR_BODIES, SOLAR_KM_PER_UNIT } from '../content/solarSystem';
import { CAMERA_START_POSITION } from './bridgeMotion';
import { createBridgeSolarSystem } from './bridgeSolarSystem';
import { solarPositionFromStation, STATION_ORBIT_PERIOD } from './stationOrbit';

afterEach(() => vi.restoreAllMocks());

describe('observation-deck solar rendering', () => {
    it('loads no invisible planets at ordinary viewport sizes and hides them after shrinking', async () => {
        const load = vi.spyOn(TextureLoader.prototype, 'loadAsync').mockImplementation(async () => new Texture());
        const system = createBridgeSolarSystem(new TextureLoader(), new Set(), () => false, vi.fn());
        await system.ready;
        const camera = new PerspectiveCamera(48);
        camera.position.fromArray(CAMERA_START_POSITION);
        for (const height of [720, 844, 2160]) system.update(camera, 0, 0, height);
        const requested = () => load.mock.calls.map(([url]) => url);
        expect(requested()).toEqual(expect.arrayContaining([
            '/textures/solar/earth_daymap.jpg', '/textures/solar/earth_clouds.jpg', '/textures/sky/milky-way-diffuse-8k.webp',
        ]));
        expect(requested()).not.toContain('/textures/solar/sun.jpg');
        expect(load).toHaveBeenCalledTimes(3);
        for (const id of ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']) {
            const body = system.scene.getObjectByName(id)!;
            expect(body.visible).toBe(false);
            expect(body.children).toHaveLength(0);
        }
        system.update(camera, 0, 0, 10_000);
        await vi.waitFor(() => expect(system.scene.getObjectByName('jupiter')!.children.length).toBeGreaterThan(0));
        expect(requested()).toContain('/textures/solar/jupiter.jpg');
        expect(system.scene.getObjectByName('jupiter')!.visible).toBe(true);
        system.update(camera, 0, 0, 720);
        expect(system.scene.getObjectByName('jupiter')!.visible).toBe(false);
        expect(requested().filter(url => url.includes('jupiter'))).toHaveLength(1);
    });

    it('uses physical radii, metre-scale camera parallax, and the visible Sun direction for cabin lighting', async () => {
        vi.spyOn(TextureLoader.prototype, 'loadAsync').mockImplementation(async () => new Texture());
        const system = createBridgeSolarSystem(new TextureLoader(), new Set(), () => false, vi.fn());
        await system.ready;
        for (const id of ['sun', 'earth']) {
            const sphere = system.scene.getObjectByName(id)!.children.find(child => child instanceof Mesh && child.material.type !== 'ShaderMaterial') as Mesh;
            sphere.geometry.computeBoundingSphere();
            expect(sphere.geometry.boundingSphere!.radius * SOLAR_KM_PER_UNIT).toBeCloseTo(SOLAR_BODIES.find(body => body.id === id)!.radiusKm, 0);
        }
        const camera = new PerspectiveCamera(48, 16 / 9);
        camera.position.fromArray(CAMERA_START_POSITION).add(new Vector3(3, 0, 0));
        for (const seconds of [0, STATION_ORBIT_PERIOD / 2]) {
            system.update(camera, seconds, 0, 720);
            expect(system.camera.position.x * SOLAR_KM_PER_UNIT * 1_000).toBeCloseTo(3);
            const direction = solarPositionFromStation(SOLAR_BODIES[0], seconds).sub(system.camera.position).normalize();
            expect(system.sunDirection.distanceTo(direction)).toBeLessThan(1e-12);
        }
    });
});
