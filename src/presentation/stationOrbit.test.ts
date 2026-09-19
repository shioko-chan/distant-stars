import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { ASTRONOMICAL_UNIT_KM, EARTH_BODY, SOLAR_BODIES, SOLAR_KM_PER_UNIT } from '../content/solarSystem';
import { EARTH_POSITION, inertialYawFromStation, solarPositionFromStation, STATION_ORBIT_PERIOD } from './stationOrbit';

const axis = new Vector3(0, 1, 0);
describe('Earth-pointing station orbit', () => {
    it('opens at a 90-degree station–Earth–Sun phase angle', () => {
        const earth = new Vector3(...EARTH_POSITION);
        const toStation = earth.clone().negate().normalize();
        const toSun = solarPositionFromStation(SOLAR_BODIES[0], 0).sub(earth).normalize();
        expect(toStation.dot(toSun)).toBeCloseTo(0, 12);
        expect(toSun.x).toBeGreaterThan(0);
    });
    it('preserves the window composition throughout a complete orbit', () => {
        for (let seconds = 0; seconds <= STATION_ORBIT_PERIOD; seconds += 15) {
            const earth = solarPositionFromStation(EARTH_BODY, seconds);
            expect(earth.distanceTo(new Vector3(...EARTH_POSITION))).toBeLessThan(1e-10);
        }
    });
    it('turns the exterior by half a revolution and returns after a full orbit', () => {
        expect(inertialYawFromStation(0)).toBeCloseTo(0);
        expect(inertialYawFromStation(STATION_ORBIT_PERIOD / 2)).toBeCloseTo(-Math.PI);
        expect(inertialYawFromStation(STATION_ORBIT_PERIOD)).toBeCloseTo(0);
    });
    it('preserves the inertial relationship between sunlight and the planet', () => {
        const sun = new Vector3(-18, 14, -7).normalize();
        const surfaceNormal = new Vector3(.4, .2, 1).normalize();
        const illumination = sun.dot(surfaceNormal);
        for (let seconds = 0; seconds <= STATION_ORBIT_PERIOD; seconds += 15) {
            const yaw = inertialYawFromStation(seconds);
            expect(sun.clone().applyAxisAngle(axis, yaw).dot(surfaceNormal.clone().applyAxisAngle(axis, yaw))).toBeCloseTo(illumination, 10);
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
    it('returns the complete sky after an orbit without moving the Earth', () => {
        for (const body of SOLAR_BODIES) {
            expect(solarPositionFromStation(body, 0).distanceTo(solarPositionFromStation(body, STATION_ORBIT_PERIOD))).toBeLessThan(1e-8);
        }
    });
});
