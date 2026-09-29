import { describe, expect, it } from 'vitest';
import { createTimetable, sampleTimetable, STATION_DWELL, TERMINAL_DWELL } from './railSchedule';
import { lineStops, planSkybridges } from './cityTransit';
import { planAirRoutes, planLandingPads, sampleAirRoute, type AirSample } from './cityAirTraffic';
import { CITY_RAIL_LINES } from './cityLandUse';
import { CITY_LOCAL_BOUNDS, cityBuildingBounds, createCityLayout, type CityBuilding } from './cityLayout';

describe('light-rail timetables', () => {
    const stops = [0, 1200, 3000, 5000];

    it('stops at every station and turns back only after dwelling at a terminal', () => {
        const table = createTimetable(stops);
        const dwells = table.runs.filter(run => run.kind !== 'run');
        expect(dwells.filter(run => run.kind === 'terminal').map(run => run.from).sort((a, b) => a - b)).toEqual([0, 5000]);
        expect(dwells.filter(run => run.kind === 'dwell').map(run => run.from).sort((a, b) => a - b)).toEqual([1200, 1200, 3000, 3000]);
        for (const run of dwells) {
            expect(run.duration).toBe(run.kind === 'terminal' ? TERMINAL_DWELL : STATION_DWELL);
            const middle = sampleTimetable(table, run.start + run.duration / 2);
            expect(middle.stopped).toBe(true); expect(middle.speed).toBe(0); expect(middle.distance).toBe(run.from);
        }
        // Crossing over at the far terminal: arrives on one track, leaves on the other.
        const far = dwells.find(run => run.kind === 'terminal' && run.from === 5000)!;
        expect(sampleTimetable(table, far.start + .01).lateral).toBeCloseTo(1, 5);
        expect(sampleTimetable(table, far.start + far.duration - .01).lateral).toBeCloseTo(-1, 5);
    });

    it('moves continuously, starting and ending each run at rest within the line', () => {
        for (const table of [createTimetable(stops), createTimetable(stops, { loop: 6000 }), createTimetable(stops, { loop: 6000, reverse: true })]) {
            let previous = sampleTimetable(table, 0);
            for (let t = .5; t < table.period * 2; t += .5) {
                const sample = sampleTimetable(table, t);
                let step = Math.abs(sample.distance - previous.distance);
                if (table.loop) step = Math.min(step, table.loop - step);
                expect(step).toBeLessThan(43 * .5 + 1e-6);
                expect(sample.distance).toBeGreaterThanOrEqual(0);
                expect(sample.distance).toBeLessThanOrEqual(table.loop || 5000);
                previous = sample;
            }
            for (const run of table.runs.filter(run => run.kind === 'run')) {
                expect(sampleTimetable(table, run.start + 1e-6).speed).toBeLessThan(.01);
                expect(sampleTimetable(table, run.start + run.duration - 1e-6).speed).toBeLessThan(.01);
            }
        }
    });

    it('gives axial lines terminals at both endcaps and ring lines stations all around', () => {
        for (const line of CITY_RAIL_LINES) {
            const stops = lineStops(line);
            expect(stops.length).toBeGreaterThan(line.direction === 'ring' ? 20 : 5);
            for (let i = 1; i < stops.length; i++) expect(stops[i] - stops[i - 1]).toBeGreaterThan(200);
        }
    });
});

describe('landing-pad air traffic', () => {
    const buildings = createCityLayout(CITY_LOCAL_BOUNDS, { density: 'local' });
    const pads = planLandingPads(buildings);
    const routes = planAirRoutes(pads, buildings, 60);

    it('puts pads on tower faces with clear approaches', () => {
        expect(pads.length).toBeGreaterThan(40);
        for (const pad of pads) for (const b of buildings) {
            const f = cityBuildingBounds(b);
            const inside = (arc: number, axial: number) => arc > f.arcMin && arc < f.arcMax && axial > f.axialMin && axial < f.axialMax;
            expect(inside(...pad.approach)).toBe(false);
        }
    });

    it('docks at pads between hops and cruises above the towers it passes', () => {
        const sample: AirSample = { arc: 0, height: 0, axial: 0, heading: 0, docked: false };
        for (const route of routes) {
            let docked = 0, previous = { ...sampleAirRoute(route, 0, sample) };
            for (let t = 1; t < route.period; t += 1) {
                sampleAirRoute(route, t, sample);
                if (sample.docked) {
                    docked++;
                    expect(pads.some(pad => Math.hypot(pad.arc - sample.arc, pad.axial - sample.axial) < 1e-6)).toBe(true);
                }
                expect(Math.hypot(sample.arc - previous.arc, sample.axial - previous.axial, sample.height - previous.height)).toBeLessThan(90);
                previous = { ...sample };
            }
            expect(docked).toBeGreaterThan(40);
            expect(route.period).toBeGreaterThan(200);
        }
    });
});

describe('imported building attachment exclusions', () => {
    const building: CityBuilding = { arc: 1000, axial: 200, width: 30, depth: 30, height: 300,
        yaw: 0, seed: 1, archetype: 'slab', shade: 1 };

    it('does not attach a skybridge to an imported building', () => {
        const neighbour = { ...building, arc: 1120, seed: 2 };
        expect(planSkybridges([building, neighbour])).toHaveLength(2);
        expect(planSkybridges([building, neighbour], new Set([building.seed]))).toEqual([]);
    });

    it('keeps an excluded building between two hosts as a bridge obstacle', () => {
        const neighbour = { ...building, arc: 1120, seed: 2 };
        const imported = { ...building, arc: 1060, width: 24, seed: 3 };
        expect(planSkybridges([building, neighbour], new Set([imported.seed]))).toHaveLength(2);
        expect(planSkybridges([building, neighbour, imported], new Set([imported.seed]))).toEqual([]);
        // A narrow facade between the old quarter-segment samples still blocks the whole bridge.
        const narrow = { ...imported, arc: 1020, width: 8 };
        expect(planSkybridges([building, neighbour, narrow], new Set([narrow.seed]))).toEqual([]);
    });

    it('omits imported pad hosts while keeping their footprints clear of other pad approaches', () => {
        const host = { ...building, seed: 2 };
        const [pad] = planLandingPads([host]);
        expect(pad).toBeDefined();
        expect(planLandingPads([host], new Set([host.seed]))).toEqual([]);
        const imported = { ...building, arc: pad.approach[0], axial: pad.approach[1], seed: 3 };
        expect(planLandingPads([host, imported], new Set([imported.seed]))).toEqual([]);
    });
});
