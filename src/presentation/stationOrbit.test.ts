import { describe, expect, it } from 'vitest';
import { Frustum, MathUtils, Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { ASTRONOMICAL_UNIT_KM, EARTH_BODY, SOLAR_BODIES, SOLAR_KM_PER_UNIT } from '../content/solarSystem';
import { CAMERA_START_POSITION, sampleBridgeMotion } from './bridgeMotion';
import { HABITAT_RADIUS_M, HABITAT_ROTATION_PERIOD } from './habitatFrame';
import { EARTH_POSITION, earthPositionFromStation, inertialOrientationFromStation, solarPositionFromStation, STATION_ORBIT_PERIOD, STATION_ORBIT_RADIUS_KM } from './stationOrbit';

const habitatCenter = new Vector3(0, HABITAT_RADIUS_M, 0).sub(new Vector3(...CAMERA_START_POSITION))
    .divideScalar(1000 * SOLAR_KM_PER_UNIT);

describe('circular geocentric orbit in a rotating habitat', () => {
    it('opens along the Earth-pointing axis with a crescent facing the visible Sun', () => {
        const earth = new Vector3(...EARTH_POSITION);
        const earthRadius = EARTH_BODY.radiusKm / SOLAR_KM_PER_UNIT;
        expect(earth.length()).toBeGreaterThan(earthRadius);
        expect(2 * MathUtils.radToDeg(Math.asin(earthRadius / earth.length()))).toBeCloseTo(29, 8);
        const toStation = earth.clone().negate().normalize();
        const toSun = solarPositionFromStation(SOLAR_BODIES[0], 0).sub(earth).normalize();
        const illuminatedFraction = (1 + toStation.dot(toSun)) / 2;
        expect(illuminatedFraction).toBeGreaterThan(.04);
        expect(illuminatedFraction).toBeLessThan(.05);
        expect(toSun.x).toBeGreaterThan(0);
    });
    it('fits the Earth and Sun within the opening desktop and portrait camera frustums', () => {
        const opening = sampleBridgeMotion(0);
        const viewDirection = new Vector3(...opening.cameraTarget).sub(new Vector3(...opening.cameraPosition));
        for (const aspect of [16 / 9, 390 / 844]) {
            const fov = Math.max(52, 2 * MathUtils.radToDeg(Math.atan(Math.tan(MathUtils.degToRad(27)) / aspect)));
            const camera = new PerspectiveCamera(fov, aspect, 1, 10_000_000);
            camera.lookAt(viewDirection);
            camera.updateMatrixWorld();
            const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
            for (const body of [EARTH_BODY, SOLAR_BODIES[0]]) {
                const center = solarPositionFromStation(body, 0);
                for (const plane of frustum.planes) {
                    expect(plane.distanceToPoint(center)).toBeGreaterThan(body.radiusKm / SOLAR_KM_PER_UNIT);
                }
            }
        }
    });
    it('derives its geocentric period from orbital radius and Earth gravity', () => {
        const radiusKm = new Vector3(...EARTH_POSITION).sub(habitatCenter).length() * SOLAR_KM_PER_UNIT;
        expect(STATION_ORBIT_RADIUS_KM).toBeCloseTo(radiusKm, 10);
        const speedKmPerSecond = 2 * Math.PI * radiusKm / STATION_ORBIT_PERIOD;
        expect(speedKmPerSecond ** 2 / radiusKm).toBeCloseTo(398_600.4418 / radiusKm ** 2, 12);
        expect(STATION_ORBIT_PERIOD / 3600).toBeGreaterThan(11);
        expect(STATION_ORBIT_PERIOD / 3600).toBeLessThan(12);
    });
    it('preserves axial spin while steering the spin axis toward Earth throughout the orbit', () => {
        const orbitNormal = new Vector3(0, 1, 0);
        for (const seconds of [0, HABITAT_ROTATION_PERIOD / 4, HABITAT_ROTATION_PERIOD, STATION_ORBIT_PERIOD * .37, STATION_ORBIT_PERIOD * 2.5]) {
            const orbit = seconds / STATION_ORBIT_PERIOD * 2 * Math.PI;
            const spin = seconds / HABITAT_ROTATION_PERIOD * 2 * Math.PI;
            const attitude = inertialOrientationFromStation(seconds).invert();
            const earthward = new Vector3(-Math.sin(orbit), 0, -Math.cos(orbit));
            expect(new Vector3(0, 0, -1).applyQuaternion(attitude).distanceTo(earthward)).toBeLessThan(1e-12);
            const ringTangent = new Vector3(1, 0, 0).applyQuaternion(attitude).applyAxisAngle(orbitNormal, -orbit);
            expect(ringTangent.distanceTo(new Vector3(Math.cos(spin), Math.sin(spin), 0))).toBeLessThan(1e-12);
        }
    });
    it('keeps Earth fixed in the room while the habitat follows a circular geocentric orbit', () => {
        const initial = new Vector3(...EARTH_POSITION).sub(habitatCenter);
        const inertialEarth = (seconds: number) => earthPositionFromStation(seconds)
            .sub(habitatCenter).applyQuaternion(inertialOrientationFromStation(seconds).invert());
        for (const fraction of [0, .013, .25, .5, .75, 1, 2.7]) {
            expect(inertialEarth(STATION_ORBIT_PERIOD * fraction).length()).toBeCloseTo(initial.length(), 10);
            expect(earthPositionFromStation(STATION_ORBIT_PERIOD * fraction).distanceTo(new Vector3(...EARTH_POSITION))).toBeLessThan(1e-12);
            const fromAxis = earthPositionFromStation(STATION_ORBIT_PERIOD * fraction).sub(habitatCenter).normalize();
            expect(fromAxis.distanceTo(new Vector3(0, 0, -1))).toBeLessThan(1e-12);
        }
        expect(inertialEarth(STATION_ORBIT_PERIOD / 4).dot(initial)).toBeCloseTo(0, 10);
        expect(inertialEarth(STATION_ORBIT_PERIOD / 2).distanceTo(initial.clone().negate())).toBeLessThan(1e-10);
        expect(inertialEarth(STATION_ORBIT_PERIOD).distanceTo(initial)).toBeLessThan(1e-10);
    });
    it('includes the room observer offset while both spin and Earth-pointing attitude change', () => {
        const initialFromCenter = new Vector3(...EARTH_POSITION).sub(habitatCenter);
        const orbitalNormal = new Vector3(0, 1, 0);
        for (const seconds of [HABITAT_ROTATION_PERIOD / 4, HABITAT_ROTATION_PERIOD / 2, HABITAT_ROTATION_PERIOD, STATION_ORBIT_PERIOD / 3]) {
            const spin = seconds / HABITAT_ROTATION_PERIOD * Math.PI * 2;
            const orbit = seconds / STATION_ORBIT_PERIOD * Math.PI * 2;
            const earthInInertialFrame = initialFromCenter.clone().applyAxisAngle(orbitalNormal, orbit);
            // Independently compose the observer circuit: spin first, then orbital steering.
            const observerInInertialFrame = habitatCenter.clone().negate()
                .applyAxisAngle(new Vector3(0, 0, 1), spin).applyAxisAngle(orbitalNormal, orbit);
            const expected = earthInInertialFrame.sub(observerInInertialFrame)
                .applyAxisAngle(orbitalNormal, -orbit).applyAxisAngle(new Vector3(0, 0, 1), -spin);
            expect(earthPositionFromStation(seconds).distanceTo(expected)).toBeLessThan(1e-10);
            expect(earthPositionFromStation(seconds).y * SOLAR_KM_PER_UNIT * 1000)
                .toBeCloseTo(HABITAT_RADIUS_M - CAMERA_START_POSITION[1], 8);
        }
    });
    it('keeps distant directions moving instead of locking the whole sky to Earth', () => {
        const initialSun = solarPositionFromStation(SOLAR_BODIES[0], 0).sub(earthPositionFromStation(0)).normalize();
        // A full spin removes roll, leaving the slower orbital steering of distant directions.
        const afterSpin = solarPositionFromStation(SOLAR_BODIES[0], HABITAT_ROTATION_PERIOD)
            .sub(earthPositionFromStation(HABITAT_ROTATION_PERIOD)).normalize();
        const orbitalSteering = 2 * Math.PI * HABITAT_ROTATION_PERIOD / STATION_ORBIT_PERIOD;
        const expected = initialSun.clone().applyAxisAngle(new Vector3(0, 1, 0), -orbitalSteering);
        expect(afterSpin.distanceTo(expected)).toBeLessThan(1e-12);
        // Only the component perpendicular to the orbit's +Y normal sweeps that angle.
        const expectedAngularSeparation = Math.acos(initialSun.y ** 2 + (1 - initialSun.y ** 2) * Math.cos(orbitalSteering));
        expect(afterSpin.angleTo(initialSun)).toBeCloseTo(expectedAngularSeparation, 12);
        const afterHalfOrbit = solarPositionFromStation(SOLAR_BODIES[0], STATION_ORBIT_PERIOD / 2)
            .sub(earthPositionFromStation(STATION_ORBIT_PERIOD / 2)).normalize();
        expect(Math.sign(afterHalfOrbit.z)).toBe(-Math.sign(initialSun.z));
    });
    it('preserves the inertial relationship between sunlight and the planet', () => {
        const sun = new Vector3(-18, 14, -7).normalize();
        const surfaceNormal = new Vector3(.4, .2, 1).normalize();
        const illumination = sun.dot(surfaceNormal);
        for (const seconds of [0, HABITAT_ROTATION_PERIOD / 4, STATION_ORBIT_PERIOD / 2]) {
            const orientation = inertialOrientationFromStation(seconds);
            expect(sun.clone().applyQuaternion(orientation).dot(surfaceNormal.clone().applyQuaternion(orientation))).toBeCloseTo(illumination, 10);
        }
    });
    it('preserves every interplanetary distance in the same units as physical radii', () => {
        for (const seconds of [0, STATION_ORBIT_PERIOD / 4, STATION_ORBIT_PERIOD / 2]) {
            for (const body of SOLAR_BODIES) for (const other of SOLAR_BODIES) {
                const au = new Vector3(...body.heliocentricAU).distanceTo(new Vector3(...other.heliocentricAU));
                const renderedKm = solarPositionFromStation(body, seconds).distanceTo(solarPositionFromStation(other, seconds)) * SOLAR_KM_PER_UNIT;
                expect(renderedKm).toBeCloseTo(au * ASTRONOMICAL_UNIT_KM, 4);
            }
        }
    });
    it('gives the Sun its roughly half-degree apparent diameter from the station', () => {
        const sun = SOLAR_BODIES[0];
        for (const seconds of [0, STATION_ORBIT_PERIOD / 2]) {
            const distanceKm = solarPositionFromStation(sun, seconds).length() * SOLAR_KM_PER_UNIT;
            const diameterDegrees = 2 * Math.asin(sun.radiusKm / distanceKm) * 180 / Math.PI;
            expect(diameterDegrees).toBeGreaterThan(.52);
            expect(diameterDegrees).toBeLessThan(.55);
        }
        expect(sun.radiusKm / EARTH_BODY.radiusKm).toBeCloseTo(109.2, 1);
    });
    it('keeps distant planetary disks below an arcminute instead of enlarging them', () => {
        for (const body of SOLAR_BODIES.filter(body => body.id !== 'sun' && body.id !== 'earth')) {
            const distanceKm = solarPositionFromStation(body, 0).length() * SOLAR_KM_PER_UNIT;
            const diameterArcMinutes = 2 * Math.asin(body.radiusKm / distanceKm) * 180 / Math.PI * 60;
            expect(diameterArcMinutes).toBeGreaterThan(0);
            expect(diameterArcMinutes).toBeLessThan(1);
        }
    });
    it('returns the geocentric translation after an orbital period while preserving independent spin', () => {
        for (const body of SOLAR_BODIES) {
            const inertial = solarPositionFromStation(body, STATION_ORBIT_PERIOD)
                .sub(habitatCenter).applyQuaternion(inertialOrientationFromStation(STATION_ORBIT_PERIOD).invert()).add(habitatCenter);
            expect(solarPositionFromStation(body, 0).distanceTo(inertial)).toBeLessThan(1e-8);
        }
    });
});
