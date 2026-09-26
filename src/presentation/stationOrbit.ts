import { MathUtils, Quaternion, Vector3 } from 'three';
import { ASTRONOMICAL_UNIT_KM, EARTH_BODY, SOLAR_KM_PER_UNIT, type SolarBody } from '../content/solarSystem';
import { CAMERA_START_POSITION } from './bridgeMotion';
import { HABITAT_ANGULAR_SPEED, HABITAT_RADIUS_M, HABITAT_ROTATION_PERIOD } from './habitatFrame';

// All exterior positions/radii use 1 unit = 1,000 km; the cabin still uses metres.
// At this altitude Earth spans 29° along the habitat's Earth-pointing -Z axis.
const earthDistance = EARTH_BODY.radiusKm / SOLAR_KM_PER_UNIT / Math.sin(MathUtils.degToRad(14.5));
// The astronomical camera starts at zero, whereas the real spin axis is above the room.
// Keeping this offset accounts for the observer's radius-sized circuit about the habitat center.
const observerToHabitatCenter = new Vector3(0, HABITAT_RADIUS_M, 0)
    .sub(new Vector3(...CAMERA_START_POSITION)).multiplyScalar(1 / (1000 * SOLAR_KM_PER_UNIT));
const initialEarthPosition = new Vector3(
    observerToHabitatCenter.x, observerToHabitatCenter.y,
    -Math.sqrt(earthDistance ** 2 - observerToHabitatCenter.x ** 2 - observerToHabitatCenter.y ** 2),
);
export const EARTH_POSITION: [number, number, number] = initialEarthPosition.toArray();
const initialEarthFromCenter = initialEarthPosition.clone().sub(observerToHabitatCenter);
// Circular two-body station orbit; the illustrative planetary snapshot is not a live ephemeris.
// Earth GM and sidereal day: https://nssdc.gsfc.nasa.gov/planetary/factsheet/earthfact.html
export const EARTH_GRAVITATIONAL_PARAMETER_KM3_S2 = 398_600.4418;
export const EARTH_SIDEREAL_DAY_SECONDS = 23.9345 * 3600;
export const STATION_ORBIT_RADIUS_KM = initialEarthFromCenter.length() * SOLAR_KM_PER_UNIT;
export const STATION_ORBIT_PERIOD = 2 * Math.PI * Math.sqrt(STATION_ORBIT_RADIUS_KM ** 3 / EARTH_GRAVITATIONAL_PARAMETER_KM3_S2);
// The initial radius is -Z, so +Y is the circular orbit's perpendicular normal.
const orbitAxis = new Vector3(0, 1, 0);
const spinAxis = new Vector3(0, 0, 1);
const stationOrientation = new Quaternion();
const orbitOrientation = new Quaternion();
const earthPosition = new Vector3();
const earthHeliocentric = new Vector3(...EARTH_BODY.heliocentricAU);
// Frame the real half-degree Sun beside Earth, giving Earth its natural crescent phase.
const initialSunDirection = new Vector3(
    Math.sin(MathUtils.degToRad(20)), Math.tan(MathUtils.degToRad(13.1)), -Math.cos(MathUtils.degToRad(20)),
).normalize();
const eclipticToInitialFrame = new Quaternion().setFromUnitVectors(
    new Vector3(-earthHeliocentric.x, -earthHeliocentric.z, earthHeliocentric.y).normalize(),
    initialSunDirection,
);

/**
 * The habitat points -Z at Earth while spinning around its own +Z axis.
 * Local-to-inertial attitude is Ry(orbit) * Rz(spin); invert both in reverse order.
 * This prescribes attitude kinematically, without simulating control torque.
 */
export function inertialOrientationFromStation(seconds: number, target = new Quaternion()): Quaternion {
    const orbitalAngle = (seconds % STATION_ORBIT_PERIOD) / STATION_ORBIT_PERIOD * Math.PI * 2;
    orbitOrientation.setFromAxisAngle(orbitAxis, -orbitalAngle);
    return target.setFromAxisAngle(spinAxis, -(seconds % HABITAT_ROTATION_PERIOD) * HABITAT_ANGULAR_SPEED)
        .multiply(orbitOrientation);
}

/** Earth stays on the habitat axis, with the room observer's finite radial offset. */
export function earthPositionFromStation(_seconds: number, target = new Vector3()): Vector3 {
    return target.copy(initialEarthPosition);
}

/** Preserve Earth-relative inertial positions, then translate and rotate into the habitat. */
export function solarPositionFromStation(body: SolarBody, seconds: number, target = new Vector3()): Vector3 {
    target.fromArray(body.heliocentricAU).sub(earthHeliocentric);
    target.set(target.x, target.z, -target.y).multiplyScalar(ASTRONOMICAL_UNIT_KM / SOLAR_KM_PER_UNIT);
    target.applyQuaternion(eclipticToInitialFrame).applyQuaternion(inertialOrientationFromStation(seconds, stationOrientation));
    return target.add(earthPositionFromStation(seconds, earthPosition));
}

/** Project a spherical disk through the vertical field of view, without a minimum size. */
export function solarDiameterPixels(radiusKm: number, distance: number, fovDegrees: number, height: number): number {
    const radius = radiusKm / SOLAR_KM_PER_UNIT;
    return height * radius / (Math.sqrt(distance * distance - radius * radius) * Math.tan(fovDegrees * Math.PI / 360));
}
