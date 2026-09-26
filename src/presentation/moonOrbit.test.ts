import { expect, it } from 'vitest';
import { MOON_DISTANCE_KM, MOON_PERIOD_SECONDS, moonPositionFromEarth } from './moonOrbit';
import { SOLAR_KM_PER_UNIT } from '../content/solarSystem';
it('keeps the Moon at the physical mean distance and closes its orbit', () => {
    for (const t of [0, 7200, MOON_PERIOD_SECONDS / 2]) expect(moonPositionFromEarth(t).length()).toBeCloseTo(MOON_DISTANCE_KM / SOLAR_KM_PER_UNIT, 8);
    expect(moonPositionFromEarth(0).distanceTo(moonPositionFromEarth(MOON_PERIOD_SECONDS))).toBeLessThan(1e-9);
});
