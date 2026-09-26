import { mulberry32 } from '../simulation/rng';
import type { CityBuilding } from './cityLayout';

export interface BuildingMass { x: number; z: number; width: number; depth: number; bottom: number; height: number }

/** Shared silhouettes at every geometry LOD: detail changes, footprints and setbacks do not. */
export function buildingMasses(b: CityBuilding): BuildingMass[] {
    const random = mulberry32(b.seed);
    const w = b.width, d = b.depth, h = b.height;
    const mass = (x: number, z: number, width: number, depth: number, bottom: number, height: number): BuildingMass =>
        ({ x, z, width, depth, bottom, height });
    switch (b.archetype) {
        case 'courtyard': {
            const wing = .19 + random() * .07;
            return [
                mass(0, -d * (1 - wing) / 2, w, d * wing, 0, h * .86),
                mass(0, d * (1 - wing) / 2, w, d * wing, 0, h * .72),
                mass(-w * (1 - wing) / 2, 0, w * wing, d * (1 - 2 * wing), 0, h),
                mass(w * (1 - wing) / 2, 0, w * wing, d * (1 - 2 * wing), 0, h * .92),
            ];
        }
        case 'terrace': {
            const levels = 2 + Math.floor(random() * 3);
            return Array.from({ length: levels }, (_, i) => {
                const inset = i / levels;
                return mass(w * inset * .15, -d * inset * .08, w * (1 - .48 * inset), d * (1 - .56 * inset), h * i / levels, h / levels);
            });
        }
        case 'needle': {
            const podium = h * (.12 + random() * .12);
            return [mass(0, 0, w, d, 0, podium), mass(-w * .06, d * .05, w * .51, d * .57, podium, h - podium)];
        }
        case 'offset':
            return [mass(-w * .2, 0, w * .6, d, 0, h * .7), mass(w * .3, -d * .22, w * .4, d * .56, 0, h)];
        case 'slab': {
            const setback = random() > .48;
            return setback
                ? [mass(0, 0, w, d, 0, h * .87), mass(w * .08, 0, w * .72, d * .85, h * .87, h * .13)]
                : [mass(0, 0, w, d, 0, h)];
        }
    }
}
