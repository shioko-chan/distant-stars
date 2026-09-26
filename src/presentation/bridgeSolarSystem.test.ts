import { afterEach, describe, expect, it, vi } from 'vitest';
import { BufferGeometry, Mesh, MeshStandardMaterial, PerspectiveCamera, PointLight, ShaderMaterial, Texture, TextureLoader, Vector3 } from 'three';
import { SOLAR_BODIES, SOLAR_KM_PER_UNIT } from '../content/solarSystem';
import { CAMERA_START_POSITION } from './bridgeMotion';
import { createBridgeSolarSystem } from './bridgeSolarSystem';
import { EARTH_SIDEREAL_DAY_SECONDS, inertialOrientationFromStation, solarPositionFromStation, STATION_ORBIT_PERIOD } from './stationOrbit';
import { HABITAT_ROTATION_PERIOD } from './habitatFrame';
import { moonPositionFromEarth } from './moonOrbit';

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
            '/textures/solar/moon_4k.webp', '/textures/solar/earth_daymap.jpg', '/textures/solar/earth_clouds.jpg', '/textures/sky/milky-way-diffuse-8k.webp',
        ]));
        expect(requested()).not.toContain('/textures/solar/sun.jpg');
        expect(load).toHaveBeenCalledTimes(4);
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

    it('keeps a thin cloud deck above Earth without a displaced duplicate or fill on other bodies', async () => {
        vi.spyOn(TextureLoader.prototype, 'loadAsync').mockImplementation(async () => new Texture());
        const system = createBridgeSolarSystem(new TextureLoader(), new Set(), () => false, vi.fn());
        await system.ready;
        const surfaces = (id: string) => system.scene.getObjectByName(id)!.children
            .filter((child): child is Mesh<BufferGeometry, MeshStandardMaterial> => child instanceof Mesh && child.material instanceof MeshStandardMaterial);
        const earth = surfaces('earth').find(sphere => sphere.material.map)!;
        earth.geometry.computeBoundingSphere();
        const clouds = system.scene.getObjectByName('earth-tropospheric-clouds') as Mesh<BufferGeometry, MeshStandardMaterial>;
        clouds.geometry.computeBoundingSphere();
        const heightKm = (clouds.geometry.boundingSphere!.radius - earth.geometry.boundingSphere!.radius) * SOLAR_KM_PER_UNIT;
        expect(heightKm).toBeCloseTo(8, 2);
        expect(clouds.material.depthWrite).toBe(false);
        expect(clouds.material.alphaMap).toBeTruthy();
        expect(clouds.material.bumpScale * SOLAR_KM_PER_UNIT).toBeLessThan(heightKm);
        expect(surfaces('earth').filter(sphere => sphere.material.alphaMap)).toHaveLength(1);
        for (const sphere of surfaces('moon')) {
            expect(sphere.material.emissive.getHex()).toBe(0);
            expect(sphere.material.customProgramCacheKey()).not.toContain('earth-');
        }
    });

    it('renders Earth, the Moon, and the illuminating Sun in the same moving reference frame', async () => {
        vi.spyOn(TextureLoader.prototype, 'loadAsync').mockImplementation(async () => new Texture());
        const system = createBridgeSolarSystem(new TextureLoader(), new Set(), () => false, vi.fn());
        await system.ready;
        const camera = new PerspectiveCamera(52, 16 / 9);
        camera.position.fromArray(CAMERA_START_POSITION);
        const frame = system.scene.getObjectByName('earth')!.parent!;
        const sunlight = frame.children.find(child => child instanceof PointLight)!;
        for (const seconds of [0, HABITAT_ROTATION_PERIOD / 4, STATION_ORBIT_PERIOD / 3]) {
            system.update(camera, seconds, 0, 720);
            system.scene.updateMatrixWorld(true);
            for (const body of SOLAR_BODIES) {
                const rendered = system.scene.getObjectByName(body.id)!.getWorldPosition(new Vector3());
                expect(rendered.distanceTo(solarPositionFromStation(body, seconds))).toBeLessThan(1e-8);
            }
            const moon = system.scene.getObjectByName('moon')!.getWorldPosition(new Vector3());
            const earth = system.scene.getObjectByName('earth')!.getWorldPosition(new Vector3());
            const expectedMoonOffset = moonPositionFromEarth(seconds).applyQuaternion(inertialOrientationFromStation(seconds));
            expect(moon.sub(earth).distanceTo(expectedMoonOffset)).toBeLessThan(1e-10);
            expect(sunlight.getWorldPosition(new Vector3()).distanceTo(system.scene.getObjectByName('sun')!.getWorldPosition(new Vector3()))).toBeLessThan(1e-10);
            // Atmospheric day/night shading must follow the actual Sun through both rotations.
            const atmosphere = system.scene.getObjectByName('earth-atmosphere') as Mesh<BufferGeometry, ShaderMaterial>;
            const atmosphereSun = (atmosphere.material.uniforms.sunDirection.value as Vector3).clone()
                .transformDirection(atmosphere.matrixWorld);
            const visibleSun = sunlight.getWorldPosition(new Vector3()).sub(earth).normalize();
            expect(atmosphereSun.distanceTo(visibleSun)).toBeLessThan(1e-10);
        }
    });

    it('rotates Earth at its sidereal rate while cloud decks drift relative to the surface', async () => {
        vi.spyOn(TextureLoader.prototype, 'loadAsync').mockImplementation(async () => new Texture());
        const system = createBridgeSolarSystem(new TextureLoader(), new Set(), () => false, vi.fn());
        await system.ready;
        const earth = system.scene.getObjectByName('earth')!.children.find(child => child instanceof Mesh && child.material instanceof MeshStandardMaterial && child.material.map) as Mesh;
        const clouds = system.scene.getObjectByName('earth-tropospheric-clouds')!;
        const initialRotation = earth.rotation.y;
        const camera = new PerspectiveCamera(52);
        camera.position.fromArray(CAMERA_START_POSITION);
        system.update(camera, 3600, 3600, 720);
        expect(earth.rotation.y - initialRotation).toBeCloseTo(2 * Math.PI * 3600 / EARTH_SIDEREAL_DAY_SECONDS, 12);
        expect(clouds.rotation.y).toBeGreaterThan(earth.rotation.y);
        expect(clouds.rotation.y - earth.rotation.y).toBeLessThan(.01);
    });
});
