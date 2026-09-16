export const SOLAR_TEXTURES = ['mercury', 'venus_surface', 'earth_daymap', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
export function solarTexture(id: string) {
    const match = /^sol-planet-([0-7])$/.exec(id);
    return match ? `/textures/solar/${SOLAR_TEXTURES[Number(match[1])]}.jpg` : undefined;
}
