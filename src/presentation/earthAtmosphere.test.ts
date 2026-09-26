import { describe, expect, it } from 'vitest';
import { Group, PerspectiveCamera, Scene, Vector3 } from 'three';
import { createEarthAtmosphere } from './earthAtmosphere';
import { EARTH_BODY, SOLAR_KM_PER_UNIT } from '../content/solarSystem';

describe('Earth atmosphere reference frame', () => {
    it('keeps density and extinction in the astronomical pass distance units', () => {
        const radius = EARTH_BODY.radiusKm / SOLAR_KM_PER_UNIT;
        const atmosphere = createEarthAtmosphere(radius, new Vector3(3, 0, 0));
        const uniforms = atmosphere.material.uniforms;
        expect((uniforms.outerRadius.value - radius) * SOLAR_KM_PER_UNIT).toBeCloseTo(80);
        expect(uniforms.scaleHeight.value * SOLAR_KM_PER_UNIT).toBeCloseTo(8);
        expect(uniforms.scattering.value.z * uniforms.scaleHeight.value).toBeCloseTo(.0331 * 8);
        expect(uniforms.sunDirection.value.length()).toBeCloseTo(1);
        expect(atmosphere.material.depthWrite).toBe(false);
    });

    it('uses the rendered camera world position and ignores looking around in place', () => {
        const scene = new Scene(), frame = new Group(), rig = new Group();
        const atmosphere = createEarthAtmosphere(6.371, new Vector3(1, 0, 0));
        const camera = new PerspectiveCamera();
        frame.position.set(-4, 2, -25);
        frame.rotation.set(.1, .2, -.7);
        rig.position.set(2, 0, 3);
        camera.position.set(.1, .2, -.3);
        scene.add(frame, rig); frame.add(atmosphere); rig.add(camera);
        const update = () => {
            scene.updateMatrixWorld(true);
            // The callback only consumes the camera; no WebGL context is required.
            atmosphere.onBeforeRender(null!, scene, camera, atmosphere.geometry, atmosphere.material, null!);
            return atmosphere.material.uniforms.eyePosition.value.clone() as Vector3;
        };
        const initial = update();
        expect(initial.distanceTo(atmosphere.worldToLocal(camera.getWorldPosition(new Vector3())))).toBeLessThan(1e-10);
        camera.rotation.set(.8, -.4, .6);
        expect(update().distanceTo(initial)).toBeLessThan(1e-10);
        frame.rotation.z += Math.PI / 2;
        const rotated = update();
        expect(rotated.distanceTo(initial)).toBeGreaterThan(1);
        expect(rotated.distanceTo(atmosphere.worldToLocal(camera.getWorldPosition(new Vector3())))).toBeLessThan(1e-10);
        expect(atmosphere.material.uniforms.sunDirection.value.toArray()).toEqual([1, 0, 0]);
    });
});
