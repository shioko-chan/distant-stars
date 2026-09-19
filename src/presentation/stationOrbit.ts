import { Quaternion, Vector3 } from 'three';
import { ASTRONOMICAL_UNIT_KM, EARTH_BODY, SOLAR_KM_PER_UNIT, type SolarBody } from '../content/solarSystem';

/** Stylized 120-minute orbit in an Earth-pointing station frame.
 * Earth stays in the window; inertial objects rotate opposite the station.
 */
export const STATION_ORBIT_PERIOD = 120 * 60;
// Preserve the original Earth's angular size and direction from the opening camera.
// All exterior positions/radii use 1 unit = 1,000 km; the cabin still uses metres.
const earthScale = EARTH_BODY.radiusKm / SOLAR_KM_PER_UNIT / 7.5;
export const EARTH_POSITION: [number, number, number] = [-14 * earthScale, -5.6 * earthScale, -53.8 * earthScale];
const earthInCabin = new Vector3(...EARTH_POSITION);
const orbitAxis = new Vector3(0, 1, 0);
const earthHeliocentric = new Vector3(...EARTH_BODY.heliocentricAU);
// Put the Sun to the right, perpendicular to the Earth–station line at Earth.
const initialSunDirection = new Vector3(1, 0, 0)
    .addScaledVector(earthInCabin, -earthInCabin.x / earthInCabin.lengthSq()).normalize();
const eclipticToCabin = new Quaternion().setFromUnitVectors(
    new Vector3(-earthHeliocentric.x, -earthHeliocentric.z, earthHeliocentric.y).normalize(),
    initialSunDirection,
);

export function inertialYawFromStation(seconds: number): number {
    return -(seconds % STATION_ORBIT_PERIOD) / STATION_ORBIT_PERIOD * Math.PI * 2;
}

/** Translate about Earth before rotating into the cabin; never compress orbital distances. */
export function solarPositionFromStation(body: SolarBody, seconds: number, target = new Vector3()): Vector3 {
    target.fromArray(body.heliocentricAU).sub(earthHeliocentric);
    target.set(target.x, target.z, -target.y).multiplyScalar(ASTRONOMICAL_UNIT_KM / SOLAR_KM_PER_UNIT);
    target.applyQuaternion(eclipticToCabin).applyAxisAngle(orbitAxis, inertialYawFromStation(seconds));
    return target.add(earthInCabin);
}

/** Project a spherical disk through the vertical field of view, without a minimum size. */
export function solarDiameterPixels(radiusKm: number, distance: number, fovDegrees: number, height: number): number {
    const radius = radiusKm / SOLAR_KM_PER_UNIT;
    return height * radius / (Math.sqrt(distance * distance - radius * radius) * Math.tan(fovDegrees * Math.PI / 360));
}
