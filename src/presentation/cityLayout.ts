import { mulberry32 } from '../simulation/rng';
import { HABITAT_HALF_WIDTH_M, HABITAT_RADIUS_M } from './habitatFrame';

export interface CityBounds { arcMin: number; arcMax: number; axialMin: number; axialMax: number }
export type CityArchetype = 'slab' | 'terrace' | 'courtyard' | 'needle' | 'offset';
export interface CityBuilding {
    arc: number; axial: number; width: number; depth: number; height: number; yaw: number; seed: number;
    archetype: CityArchetype; shade: number;
}
export const CITY_LOCAL_BOUNDS: CityBounds = { arcMin: -1750, arcMax: 1750, axialMin: -2350, axialMax: 2350 };
export const CITY_ROOM_CLEARANCE: CityBounds = { arcMin: -67, arcMax: 67, axialMin: -70, axialMax: 70 };

// District density is a geometry budget, never an LOD setting. Every LOD uses the same returned buildings.
// Mean parcel area before streets/courts: local 0.012 km², near 0.014 km², far 0.055 km².
export const CITY_PARCEL_AREA = { local: 12_000, near: 14_000, far: 55_000 } as const;
interface LayoutOptions { density?: keyof typeof CITY_PARCEL_AREA; exclude?: readonly CityBounds[] }
interface Parcel { x: number; z: number; width: number; depth: number }
const WORLD_SEED = 731993;
const mixSeed = (seed: number, salt: number) => (Math.imul(seed ^ salt, 0x45d9f3b) ^ (seed >>> 16)) >>> 0;
const overlaps = (a: CityBounds, b: CityBounds) => a.arcMin < b.arcMax && a.arcMax > b.arcMin && a.axialMin < b.axialMax && a.axialMax > b.axialMin;
const contains = (a: CityBounds, b: CityBounds) => b.arcMin >= a.arcMin && b.arcMax <= a.arcMax && b.axialMin >= a.axialMin && b.axialMax <= a.axialMax;

export function cityBuildingBounds(building: CityBuilding): CityBounds {
    const c = Math.abs(Math.cos(building.yaw)), s = Math.abs(Math.sin(building.yaw));
    const halfArc = (c * building.width + s * building.depth) / 2;
    const halfAxial = (s * building.width + c * building.depth) / 2;
    return { arcMin: building.arc - halfArc, arcMax: building.arc + halfArc,
        axialMin: building.axial - halfAxial, axialMax: building.axial + halfAxial };
}

/** A handful of commercial centres grade into lower residential quarters, rather than uniform tower coverage. */
function centrality(arc: number, axial: number): number {
    const circumference = Math.PI * 2 * HABITAT_RADIUS_M;
    const centres = [
        [-1450, 900, 1000], [1100, -2200, 1200], [-3200, -2700, 1300],
        [-.37 * circumference, -.42 * HABITAT_HALF_WIDTH_M, 1900],
        [-.19 * circumference, .56 * HABITAT_HALF_WIDTH_M, 2400],
        [.15 * circumference, -.37 * HABITAT_HALF_WIDTH_M, 1800],
        [.31 * circumference, .61 * HABITAT_HALF_WIDTH_M, 2100],
        [.46 * circumference, -.12 * HABITAT_HALF_WIDTH_M, 1800],
    ];
    return Math.max(...centres.map(([x, z, radius]) => {
        const directArc = Math.abs(arc - x), wrappedArc = Math.min(directArc, circumference - directArc);
        return Math.exp(-(wrappedArc * wrappedArc + (axial - z) ** 2) / (2 * radius ** 2));
    }));
}

/**
 * Split a fixed world into unequal districts, then split their rotated interiors into blocks and lots.
 * Streets are the space left by recursive cuts. Because all seeds belong to world parcels, querying a
 * different rectangle does not reshuffle its neighbours; a footprint crossing a query edge is omitted.
 */
export function createCityLayout(bounds: CityBounds, { density = 'near', exclude = [] }: LayoutOptions = {}): CityBuilding[] {
    if (bounds.arcMax <= bounds.arcMin || bounds.axialMax <= bounds.axialMin) return [];
    const buildings: CityBuilding[] = [];
    const exclusion = [CITY_ROOM_CLEARANCE, ...exclude];
    const world: CityBounds = { arcMin: -Math.PI * HABITAT_RADIUS_M, arcMax: Math.PI * HABITAT_RADIUS_M,
        axialMin: -HABITAT_HALF_WIDTH_M, axialMax: HABITAT_HALF_WIDTH_M };

    const district = (area: CityBounds, seed: number) => {
        const random = mulberry32(seed);
        const centerX = (area.arcMin + area.arcMax) / 2, centerZ = (area.axialMin + area.axialMax) / 2;
        const width = area.arcMax - area.arcMin, depth = area.axialMax - area.axialMin;
        const yaw = (random() - .5) * .52, c = Math.cos(yaw), s = Math.sin(yaw);
        // An inscribed rectangle leaves irregular wedges between differently aligned neighbourhoods.
        const fit = Math.min(width / (width * c + depth * Math.abs(s)), depth / (depth * c + width * Math.abs(s)));
        const intensity = centrality(centerX, centerZ);
        const grain = .72 + random() * .66;
        const targetArea = CITY_PARCEL_AREA[density] * grain * (1.18 - intensity * .36);
        const occupied = .82 + random() * .15;
        const districtShade = .73 + random() * .24;

        const parcel = (lot: Parcel, parcelSeed: number, level: number) => {
            const rng = mulberry32(parcelSeed);
            const alongX = lot.width / lot.depth > 1.2 || (lot.width / lot.depth > .8 && rng() > .5);
            const span = alongX ? lot.width : lot.depth;
            const road = level < 2 ? 15 + rng() * 23 : 5 + rng() * 10;
            if (lot.width * lot.depth > targetArea * (.72 + rng() * .65) && span > 105 && level < 12) {
                const first = (span - road) * (.34 + rng() * .32), second = span - road - first;
                parcel({ ...lot, [alongX ? 'width' : 'depth']: first,
                    [alongX ? 'x' : 'z']: (alongX ? lot.x : lot.z) - (span - first) / 2 }, mixSeed(parcelSeed, 11), level + 1);
                parcel({ ...lot, [alongX ? 'width' : 'depth']: second,
                    [alongX ? 'x' : 'z']: (alongX ? lot.x : lot.z) + (span - second) / 2 }, mixSeed(parcelSeed, 29), level + 1);
                return;
            }
            if (rng() > occupied) return; // Courtyards, unbuilt plots and small civic squares.
            const arc = centerX + c * lot.x + s * lot.z, axial = centerZ - s * lot.x + c * lot.z;
            const setback = 3 + rng() * 10;
            let buildingWidth = Math.max(16, lot.width - setback * 2), buildingDepth = Math.max(16, lot.depth - setback * 2);
            const centre = centrality(arc, axial), choice = rng();
            let archetype: CityArchetype = choice < .27 ? 'terrace' : choice < .51 ? 'courtyard' : choice < .76 ? 'slab' : 'offset';
            let height = 24 + rng() * 47 + centre * (35 + rng() * 135);
            if (centre > .36 && choice > .84) {
                archetype = 'needle'; height = 185 + centre * (95 + rng() * 310);
                buildingWidth *= .55; buildingDepth *= .62;
            } else if (archetype === 'slab') {
                buildingDepth *= .58 + rng() * .17;
                height *= 1.18;
            } else if (archetype === 'courtyard') height *= .68;
            const roomDistance = Math.hypot(arc, axial);
            if (roomDistance < 850) height = Math.min(height, 112 + roomDistance * .055);
            const building: CityBuilding = { arc, axial, width: buildingWidth, depth: buildingDepth,
                height: Math.max(20, height), yaw, seed: parcelSeed, archetype, shade: districtShade * (.94 + rng() * .12) };
            const footprint = cityBuildingBounds(building);
            if (contains(bounds, footprint) && !exclusion.some(avoid => overlaps(avoid, footprint))) buildings.push(building);
        };
        parcel({ x: 0, z: 0, width: width * fit - 18, depth: depth * fit - 18 }, mixSeed(seed, 71), 0);
    };

    const partition = (area: CityBounds, seed: number, level: number) => {
        if (!overlaps(area, bounds)) return;
        const width = area.arcMax - area.arcMin, depth = area.axialMax - area.axialMin;
        const rng = mulberry32(seed);
        if (Math.max(width, depth) < 1050 + rng() * 750 || level > 17) { district(area, seed); return; }
        const alongX = width / depth > 1.25 || (width / depth > .8 && rng() > .5);
        const road = 18 + rng() * 37;
        const split = (alongX ? area.arcMin : area.axialMin) + (alongX ? width : depth) * (.36 + rng() * .28);
        partition({ ...area, [alongX ? 'arcMax' : 'axialMax']: split - road / 2 }, mixSeed(seed, 101), level + 1);
        partition({ ...area, [alongX ? 'arcMin' : 'axialMin']: split + road / 2 }, mixSeed(seed, 307), level + 1);
    };
    partition(world, WORLD_SEED, 0);
    return buildings;
}

/** Rendering sectors own buildings by centre, so a sector seam never cuts a street through the city. */
export function createCitySectors(arcSectorCount: number, axialSectorCount: number): CityBuilding[][] {
    const halfCircumference = Math.PI * HABITAT_RADIUS_M;
    const arcSpan = halfCircumference * 2 / arcSectorCount;
    const axialSpan = HABITAT_HALF_WIDTH_M * 2 / axialSectorCount;
    const sectors = Array.from({ length: arcSectorCount * axialSectorCount }, () => [] as CityBuilding[]);
    const densityAt = (column: number) => Math.abs(-halfCircumference + (column + .5) * arcSpan) < 10_000 ? 'near' : 'far';
    // Generate one contiguous near district and the two far districts before splitting them for LOD.
    // Density boundaries remain broad avenues; the repeated rendering grid leaves no gaps.
    const bandEdges = [0];
    for (let column = 1; column < arcSectorCount; column++)
        if (densityAt(column) !== densityAt(column - 1)) bandEdges.push(column);
    bandEdges.push(arcSectorCount);
    for (let band = 0; band < bandEdges.length - 1; band++) {
        const buildings = createCityLayout({
            arcMin: -halfCircumference + bandEdges[band] * arcSpan,
            arcMax: -halfCircumference + bandEdges[band + 1] * arcSpan,
            axialMin: -HABITAT_HALF_WIDTH_M, axialMax: HABITAT_HALF_WIDTH_M,
        }, { density: densityAt(bandEdges[band]), exclude: [CITY_LOCAL_BOUNDS] });
        for (const building of buildings) {
            const column = Math.floor((building.arc + halfCircumference) / arcSpan);
            const row = Math.floor((building.axial + HABITAT_HALF_WIDTH_M) / axialSpan);
            sectors[column * axialSectorCount + row].push(building);
        }
    }
    return sectors;
}
