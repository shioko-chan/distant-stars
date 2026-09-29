import { describe, expect, it } from 'vitest';
import { CITY_LOCAL_BOUNDS, CITY_ROOM_CLEARANCE, cityBuildingBounds, createCityLayout, createCitySectors, type CityBuilding } from './cityLayout';
import { HABITAT_AXIAL_MAX, HABITAT_AXIAL_MIN, HABITAT_HALF_WIDTH_M, HABITAT_RADIUS_M } from './habitatFrame';
import { CITY_RAIL_LINES, landUseAt, reservedLand, wrapArc } from './cityLandUse';

function footprintsOverlap(a: CityBuilding, b: CityBuilding) {
    for (const angle of [a.yaw, a.yaw + Math.PI / 2, b.yaw, b.yaw + Math.PI / 2]) {
        const x = Math.cos(angle), z = -Math.sin(angle);
        const separation = Math.abs((a.arc - b.arc) * x + (a.axial - b.axial) * z);
        const radius = (building: CityBuilding) => Math.abs(Math.cos(building.yaw - angle)) * building.width / 2
            + Math.abs(Math.sin(building.yaw - angle)) * building.depth / 2;
        if (separation >= radius(a) + radius(b)) return false;
    }
    return true;
}

describe('inhabited ring districts', () => {
    const local = createCityLayout(CITY_LOCAL_BOUNDS, { density: 'local' });

    it('is reproducible and does not reshuffle buildings when the query rectangle changes', () => {
        expect(createCityLayout(CITY_LOCAL_BOUNDS, { density: 'local' })).toEqual(local);
        const inset = { arcMin: -1100, arcMax: 850, axialMin: -1300, axialMax: 1600 };
        const subset = local.filter(building => {
            const footprint = cityBuildingBounds(building);
            return footprint.arcMin >= inset.arcMin && footprint.arcMax <= inset.arcMax
                && footprint.axialMin >= inset.axialMin && footprint.axialMax <= inset.axialMax;
        });
        expect(createCityLayout(inset, { density: 'local' })).toEqual(subset);
    });

    it('keeps the local budget dense while giving quarters distinct street directions, heights and footprints', () => {
        expect(local.length).toBeGreaterThan(1000);
        expect(local.length).toBeLessThan(1800);
        expect(new Set(local.map(b => b.archetype)).size).toBe(5);
        expect(new Set(local.map(b => b.yaw)).size).toBeGreaterThan(12);
        expect(local.some(b => b.height < 45)).toBe(true);
        expect(local.some(b => b.height > 400)).toBe(true);
        expect(Math.max(...local.map(b => b.width)) / Math.min(...local.map(b => b.width))).toBeGreaterThan(4);
        const counts = Array.from({ length: 16 }, (_, i) => local.filter(b =>
            Math.floor((b.arc + 1750) / 875) === i % 4 && Math.floor((b.axial - CITY_LOCAL_BOUNDS.axialMin) / 1175) === Math.floor(i / 4)).length);
        // Neighbourhoods have deliberately different occupied densities, not equal cells plus jitter.
        expect(Math.max(...counts) / Math.min(...counts)).toBeGreaterThan(1.7);
    });

    it('keeps rotated footprints separate, inside their region, and clear of the room', () => {
        for (let i = 0; i < local.length; i++) {
            const building = local[i], footprint = cityBuildingBounds(building);
            expect(footprint.arcMin).toBeGreaterThanOrEqual(CITY_LOCAL_BOUNDS.arcMin);
            expect(footprint.arcMax).toBeLessThanOrEqual(CITY_LOCAL_BOUNDS.arcMax);
            expect(footprint.axialMin).toBeGreaterThanOrEqual(CITY_LOCAL_BOUNDS.axialMin);
            expect(footprint.axialMax).toBeLessThanOrEqual(CITY_LOCAL_BOUNDS.axialMax);
            expect(footprint.arcMax <= CITY_ROOM_CLEARANCE.arcMin || footprint.arcMin >= CITY_ROOM_CLEARANCE.arcMax
                || footprint.axialMax <= CITY_ROOM_CLEARANCE.axialMin || footprint.axialMin >= CITY_ROOM_CLEARANCE.axialMax).toBe(true);
            // Roofs step up gently away from the residence, keeping its inner view open.
            const roomDistance = Math.hypot(building.arc, building.axial);
            if (roomDistance < 900) expect(building.height).toBeLessThanOrEqual(110 + roomDistance * .4 + 1e-9);
            expect(building.height).toBeGreaterThanOrEqual(20);
            for (let j = i + 1; j < local.length; j++) {
                if (footprintsOverlap(building, local[j])) throw new Error(`Overlapping building seeds ${building.seed} and ${local[j].seed}`);
            }
        }
    });

    it('keeps parks, lakes, farmland and elevated rail corridors free of towers', () => {
        for (const building of local) {
            const footprint = cityBuildingBounds(building);
            expect(reservedLand(footprint.arcMin, footprint.arcMax, footprint.axialMin, footprint.axialMax)).toBe(false);
        }
        // A park and lake open the residence's inner view; open land covers a real share of the ring.
        expect(landUseAt(-500, 2500)).toBe('park');
        expect(landUseAt(160, 2800)).toBe('lake');
        const samples = { park: 0, lake: 0, farm: 0, urban: 0 };
        const columns = 400, rows = 240, total = columns * rows;
        for (let i = 0; i < columns; i++) for (let j = 0; j < rows; j++)
            samples[landUseAt(wrapArc(i / columns * Math.PI * 2 * HABITAT_RADIUS_M), HABITAT_AXIAL_MIN + (j + .5) / rows * (HABITAT_AXIAL_MAX - HABITAT_AXIAL_MIN)) ?? 'urban']++;
        expect(samples.park / total).toBeGreaterThan(.03);
        expect(samples.lake / total).toBeGreaterThan(.01);
        expect(samples.farm / total).toBeGreaterThan(.05);
        expect(samples.urban / total).toBeGreaterThan(.7);
        expect(CITY_RAIL_LINES.filter(line => line.direction === 'ring').length).toBeGreaterThan(2);
        expect(CITY_RAIL_LINES.some(line => line.direction === 'axial' && Math.abs(line.at) < 500)).toBe(true);
    });

    it('leaves excluded districts empty and bounds far-sector geometry cost', () => {
        const region = { arcMin: -4000, arcMax: 4000, axialMin: -4000, axialMax: 4000 };
        const nearby = createCityLayout(region, { density: 'near', exclude: [CITY_LOCAL_BOUNDS] });
        const distant = createCityLayout(region, { density: 'far', exclude: [CITY_LOCAL_BOUNDS] });
        expect(nearby.length).toBeGreaterThan(distant.length * 2);
        expect(distant.length).toBeLessThan(1500);
        for (const building of [...nearby, ...distant]) {
            const footprint = cityBuildingBounds(building);
            expect(footprint.arcMax <= CITY_LOCAL_BOUNDS.arcMin || footprint.arcMin >= CITY_LOCAL_BOUNDS.arcMax
                || footprint.axialMax <= CITY_LOCAL_BOUNDS.axialMin || footprint.axialMin >= CITY_LOCAL_BOUNDS.axialMax).toBe(true);
        }
        expect(createCityLayout({ arcMin: 1, arcMax: 0, axialMin: 0, axialMax: 1 })).toEqual([]);
    });

    it('budgets a complete 32 by 10 sector ring without repeated or empty quarters', () => {
        let count = local.length;
        const positions = new Set(local.map(b => `${b.arc},${b.axial}`));
        for (const sector of createCitySectors(32, 10)) {
            // Reservoirs can fill most of a sector, but never all of it.
            expect(sector.length).toBeGreaterThan(3);
            expect(sector.length).toBeLessThan(800);
            for (const building of sector) {
                const position = `${building.arc},${building.axial}`;
                expect(positions.has(position)).toBe(false);
                positions.add(position);
            }
            count += sector.length;
        }
        expect(count).toBeGreaterThan(45_000);
        expect(count).toBeLessThan(90_000);
    });

    it('preserves every building crossing an internal rendering seam exactly once', () => {
        const halfCircumference = Math.PI * HABITAT_RADIUS_M, arcSpan = halfCircumference * 2 / 32;
        const axialSpan = HABITAT_HALF_WIDTH_M * 2 / 10;
        const near = createCityLayout({ arcMin: -3 * arcSpan, arcMax: 3 * arcSpan,
            axialMin: HABITAT_AXIAL_MIN, axialMax: HABITAT_AXIAL_MAX }, { density: 'near', exclude: [CITY_LOCAL_BOUNDS] });
        const sectors = createCitySectors(32, 10);
        const actual = sectors.slice(13 * 10, 19 * 10).flat();
        const key = (b: CityBuilding) => `${b.arc},${b.axial}`;
        expect(new Set(actual.map(key))).toEqual(new Set(near.map(key)));
        expect(actual.length).toBe(near.length);
        const crossing = near.filter(building => {
            const footprint = cityBuildingBounds(building);
            return Math.floor((footprint.arcMin + halfCircumference) / arcSpan) !== Math.floor((footprint.arcMax + halfCircumference) / arcSpan)
                || Math.floor((footprint.axialMin - HABITAT_AXIAL_MIN) / axialSpan) !== Math.floor((footprint.axialMax - HABITAT_AXIAL_MIN) / axialSpan);
        });
        expect(crossing.length).toBeGreaterThan(1000);
        for (const building of crossing) {
            const column = Math.floor((building.arc + halfCircumference) / arcSpan);
            const row = Math.floor((building.axial - HABITAT_AXIAL_MIN) / axialSpan);
            expect(sectors[column * 10 + row].filter(b => key(b) === key(building))).toHaveLength(1);
        }
    });
});
