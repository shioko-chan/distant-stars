import { mulberry32 } from '../simulation/rng';
import { HABITAT_AXIAL_MAX, HABITAT_AXIAL_MIN, HABITAT_RADIUS_M } from './habitatFrame';

export type LandUse = 'park' | 'lake' | 'farm';
/** Organic park or lake outline: an ellipse whose radius wobbles with angle. */
export interface BlobZone { shape: 'blob'; kind: LandUse; arc: number; axial: number; radiusArc: number; radiusAxial: number; seed: number }
/** A strip running around the complete circumference. */
export interface BandZone { shape: 'band'; kind: LandUse; axialMin: number; axialMax: number }
export interface RectZone { shape: 'rect'; kind: LandUse; arcMin: number; arcMax: number; axialMin: number; axialMax: number }
export type LandZone = BlobZone | BandZone | RectZone;

/** Elevated light-rail line. Axial lines keep a constant arc; ring lines keep a constant axial position. */
export interface RailLine { direction: 'axial' | 'ring'; at: number }

const CIRCUMFERENCE = Math.PI * 2 * HABITAT_RADIUS_M;
export const RAIL_CORRIDOR_WIDTH = 34;
export const RAIL_HEIGHT = 72;
const axialAt = (fraction: number) => HABITAT_AXIAL_MIN + (HABITAT_AXIAL_MAX - HABITAT_AXIAL_MIN) * fraction;

/** Shortest signed arc distance around the ring. */
export function wrapArc(delta: number) {
    return ((delta + CIRCUMFERENCE / 2) % CIRCUMFERENCE + CIRCUMFERENCE) % CIRCUMFERENCE - CIRCUMFERENCE / 2;
}

export function blobRadius(zone: BlobZone, angle: number) {
    const random = mulberry32(zone.seed), a = random() * 6.3, b = random() * 6.3;
    return 1 + .09 * Math.sin(3 * angle + a) + .05 * Math.sin(5 * angle + b);
}

function createZones(): LandZone[] {
    const zones: LandZone[] = [
        // The park and lake stretching away from the residence's inner windows.
        { shape: 'blob', kind: 'park', arc: 40, axial: 2500, radiusArc: 820, radiusAxial: 1600, seed: 11 },
        { shape: 'blob', kind: 'lake', arc: 160, axial: 2800, radiusArc: 420, radiusAxial: 1000, seed: 12 },
        // Three reservoirs, each ringed by parkland, spaced around the ring.
        ...[[CIRCUMFERENCE / 3, axialAt(.36)], [-CIRCUMFERENCE / 3, axialAt(.63)], [CIRCUMFERENCE / 2, axialAt(.22)]].flatMap(([arc, axial], i) => [
            { shape: 'blob' as const, kind: 'park' as const, arc: wrapArc(arc), axial, radiusArc: 2100, radiusAxial: 1500, seed: 30 + i },
            { shape: 'blob' as const, kind: 'lake' as const, arc: wrapArc(arc), axial, radiusArc: 1500, radiusAxial: 950, seed: 40 + i },
        ]),
        // A green ring with a canal at mid-length, and an agricultural belt near the far cap.
        { shape: 'band', kind: 'park', axialMin: axialAt(.49), axialMax: axialAt(.515) },
        { shape: 'band', kind: 'lake', axialMin: axialAt(.5), axialMax: axialAt(.5045) },
        { shape: 'band', kind: 'farm', axialMin: axialAt(.77), axialMax: axialAt(.83) },
        { shape: 'rect', kind: 'farm', arcMin: 17_500, arcMax: 25_500, axialMin: 5200, axialMax: 7600 },
        { shape: 'rect', kind: 'farm', arcMin: -31_000, arcMax: -24_500, axialMin: 13_800, axialMax: 15_900 },
        { shape: 'rect', kind: 'farm', arcMin: 36_000, arcMax: 42_000, axialMin: 1500, axialMax: 3400 },
    ];
    const random = mulberry32(58213);
    for (let i = 0; i < 16; i++) {
        const arc = wrapArc((i + .3 + random() * .4) / 16 * CIRCUMFERENCE + 2600);
        const axial = axialAt(.08 + random() * .84);
        if (Math.hypot(arc, axial) < 5000) continue;
        const radiusArc = 380 + random() * 620, radiusAxial = 380 + random() * 720;
        zones.push({ shape: 'blob', kind: 'park', arc, axial, radiusArc, radiusAxial, seed: 100 + i });
        if (random() > .35) zones.push({ shape: 'blob', kind: 'lake', arc: arc + (random() - .5) * radiusArc * .3,
            axial: axial + (random() - .5) * radiusAxial * .3, radiusArc: radiusArc * (.38 + random() * .18),
            radiusAxial: radiusAxial * (.38 + random() * .18), seed: 200 + i });
    }
    return zones;
}
export const CITY_LAND_ZONES: readonly LandZone[] = createZones();

export const CITY_RAIL_LINES: readonly RailLine[] = [
    ...Array.from({ length: 18 }, (_, i) => ({ direction: 'axial' as const, at: wrapArc(280 + i * CIRCUMFERENCE / 18) })),
    ...[640, 3900, 7400, 11_000, 14_600, 17_200, 21_000, 23_300].map(at => ({ direction: 'ring' as const, at })),
];

function inZone(zone: LandZone, arc: number, axial: number) {
    if (zone.shape === 'band') return axial >= zone.axialMin && axial <= zone.axialMax;
    const dx = wrapArc(arc - (zone.shape === 'rect' ? (zone.arcMin + zone.arcMax) / 2 : zone.arc));
    if (zone.shape === 'rect') return Math.abs(dx) <= (zone.arcMax - zone.arcMin) / 2 && axial >= zone.axialMin && axial <= zone.axialMax;
    const x = dx / zone.radiusArc, z = (axial - zone.axial) / zone.radiusAxial;
    const radius = Math.hypot(x, z);
    return radius <= 1.15 && radius <= blobRadius(zone, Math.atan2(z, x));
}

/** Lakes win over parks, which win over farms; undefined means urban land. */
export function landUseAt(arc: number, axial: number): LandUse | undefined {
    let result: LandUse | undefined;
    for (const zone of CITY_LAND_ZONES) {
        if (!inZone(zone, arc, axial)) continue;
        if (zone.kind === 'lake') return 'lake';
        if (zone.kind === 'park' || !result) result = zone.kind;
    }
    return result;
}

/** True when a building footprint rectangle would touch open land or a rail corridor. */
export function reservedLand(arcMin: number, arcMax: number, axialMin: number, axialMax: number) {
    for (const line of CITY_RAIL_LINES) {
        const half = RAIL_CORRIDOR_WIDTH / 2;
        if (line.direction === 'ring' ? axialMax > line.at - half && axialMin < line.at + half
            : Math.abs(wrapArc((arcMin + arcMax) / 2 - line.at)) < (arcMax - arcMin) / 2 + half) return true;
    }
    for (let i = 0; i <= 2; i++) for (let j = 0; j <= 2; j++)
        if (landUseAt(arcMin + (arcMax - arcMin) * i / 2, axialMin + (axialMax - axialMin) * j / 2)) return true;
    return false;
}
