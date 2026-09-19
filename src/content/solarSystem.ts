/** Physical sizes and a fixed J2000.0 sky for the observation deck, independent of game time.
 * Mean radii: https://ssd.jpl.nasa.gov/planets/phys_par.html
 * Sun: https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html
 * Heliocentric ecliptic positions (AU): JPL approximate elements, Table 1 at T = 0,
 * solving E - e sin(E) = L - longitude of perihelion, then rotating the orbital plane.
 * https://ssd.jpl.nasa.gov/planets/approx_pos.html
 * Earth uses the Earth–Moon barycentre approximation; this is not a live ephemeris.
 */
export const ASTRONOMICAL_UNIT_KM = 149_597_870.7;
export const SOLAR_KM_PER_UNIT = 1_000;

export interface SolarBody {
    id: string;
    radiusKm: number;
    heliocentricAU: [number, number, number];
    texture: string;
}

export const SOLAR_BODIES: readonly SolarBody[] = [
    { id: 'sun', radiusKm: 695_700, heliocentricAU: [0, 0, 0], texture: 'sun' },
    { id: 'mercury', radiusKm: 2_439.4, heliocentricAU: [-.1300886204, -.4472923366, -.0245988197], texture: 'mercury' },
    { id: 'venus', radiusKm: 6_051.8, heliocentricAU: [-.7183163556, -.0327066616, .0410156243], texture: 'venus_surface' },
    { id: 'earth', radiusKm: 6_371.0084, heliocentricAU: [-.1771712491, .967214485, -.0000002584], texture: 'earth_daymap' },
    { id: 'mars', radiusKm: 3_389.5, heliocentricAU: [1.3906677477, -.0133910642, -.0344612592], texture: 'mars' },
    { id: 'jupiter', radiusKm: 69_911, heliocentricAU: [3.9983209398, 2.9457109111, -.1017178146], texture: 'jupiter' },
    { id: 'saturn', radiusKm: 58_232, heliocentricAU: [6.4147844873, 6.5456674649, -.3691467729], texture: 'saturn' },
    { id: 'uranus', radiusKm: 25_362, heliocentricAU: [14.4254658825, -13.7376457257, -.2380331204], texture: 'uranus' },
    { id: 'neptune', radiusKm: 24_622, heliocentricAU: [16.8047628119, -24.9927098602, .1274032101], texture: 'neptune' },
];

export const EARTH_BODY = SOLAR_BODIES[3];
