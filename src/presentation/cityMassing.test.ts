import { describe, expect, it } from 'vitest';
import { buildingMasses } from './cityMassing';
import { CITY_LOCAL_BOUNDS, createCityLayout, type CityBuilding } from './cityLayout';

const buildings = createCityLayout(CITY_LOCAL_BOUNDS, { density: 'local' });

describe('city building silhouettes', () => {
    it('keeps every component inside its collision-free parcel and planned height', () => {
        for (const building of buildings) {
            const masses = buildingMasses(building);
            expect(masses.length).toBeGreaterThan(0);
            for (const mass of masses) {
                expect(Math.abs(mass.x) + mass.width / 2).toBeLessThanOrEqual(building.width / 2 + 1e-8);
                expect(Math.abs(mass.z) + mass.depth / 2).toBeLessThanOrEqual(building.depth / 2 + 1e-8);
                expect(mass.bottom).toBeGreaterThanOrEqual(0);
                expect(mass.bottom + mass.height).toBeLessThanOrEqual(building.height + 1e-8);
                expect(Math.min(mass.width, mass.depth, mass.height)).toBeGreaterThan(0);
            }
            expect(Math.max(...masses.map(m => m.bottom + m.height))).toBeCloseTo(building.height, 6);
        }
    });

    it('leaves courtyards open and terraces inset instead of stacking repeated full-width boxes', () => {
        for (const building of buildings.filter(b => b.archetype === 'courtyard')) {
            for (const mass of buildingMasses(building)) {
                const centerCovered = Math.abs(mass.x) < mass.width / 2 && Math.abs(mass.z) < mass.depth / 2;
                expect(centerCovered).toBe(false);
            }
        }
        for (const building of buildings.filter(b => b.archetype === 'terrace')) {
            const masses = buildingMasses(building);
            for (let i = 1; i < masses.length; i++) {
                const below = masses[i - 1], above = masses[i];
                expect(above.bottom).toBeCloseTo(below.bottom + below.height, 6);
                expect(Math.abs(above.x - below.x) + above.width / 2).toBeLessThan(below.width / 2);
                expect(Math.abs(above.z - below.z) + above.depth / 2).toBeLessThan(below.depth / 2);
            }
        }
    });

    it('produces distinct silhouettes without changing them between detail levels', () => {
        const sample = buildings[0];
        const archetypes: CityBuilding['archetype'][] = ['slab', 'terrace', 'courtyard', 'needle', 'offset'];
        const shapes = archetypes.map(archetype => buildingMasses({ ...sample, archetype }));
        expect(new Set(shapes.map(shape => JSON.stringify(shape))).size).toBe(archetypes.length);
        for (const building of buildings) expect(buildingMasses(building)).toEqual(buildingMasses({ ...building }));
    });
});
