import { Vector3 } from 'three';
import { SOLAR_KM_PER_UNIT } from '../content/solarSystem';

export const MOON_RADIUS_KM = 1737.4;
export const MOON_DISTANCE_KM = 384400;
export const MOON_PERIOD_SECONDS = 27.321661 * 86400;
// Mean circular orbit with an illustrative opening phase, not a live ephemeris.
export function moonPositionFromEarth(seconds: number, target = new Vector3()) {
    const phase = .46 + seconds / MOON_PERIOD_SECONDS * Math.PI * 2;
    return target.set(Math.sin(phase), .12 * Math.cos(phase), -Math.cos(phase))
        .normalize().multiplyScalar(MOON_DISTANCE_KM / SOLAR_KM_PER_UNIT);
}
