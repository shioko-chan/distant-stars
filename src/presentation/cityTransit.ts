import { mulberry32 } from '../simulation/rng';
import { CITY_RAIL_LINES, reservedLand, wrapArc, type RailLine } from './cityLandUse';
import { cityBuildingBounds, type CityBuilding } from './cityLayout';
import { HABITAT_AXIAL_MAX, HABITAT_AXIAL_MIN, HABITAT_RADIUS_M } from './habitatFrame';
const CIRCUMFERENCE = Math.PI * 2 * HABITAT_RADIUS_M;
const LINE_MARGIN = 110;
export interface Skybridge { arc: number; axial: number; height: number; length: number; yaw: number }

/**
 * Enclosed walkways between neighbouring towers, at one to three levels. A bridge never passes through a
 * third tower or over a rail corridor, and courtyard blocks (whose centres are open) are not connected.
 */
export function planSkybridges(buildings: readonly CityBuilding[], excludedHostSeeds?: ReadonlySet<number>): Skybridge[] {
    const cell = 160, grid = new Map<string, CityBuilding[]>();
    const canHost = (b: CityBuilding) => b.height >= 110 && b.archetype !== 'courtyard' && !excludedHostSeeds?.has(b.seed);
    const candidates = buildings.filter(canHost);
    // Imported buildings do not host procedural attachments, but their entire footprint still blocks a bridge.
    for (const b of buildings) {
        const f = cityBuildingBounds(b);
        for (let x = Math.floor(f.arcMin / cell); x <= Math.floor(f.arcMax / cell); x++)
            for (let z = Math.floor(f.axialMin / cell); z <= Math.floor(f.axialMax / cell); z++) {
                const key = `${x},${z}`, list = grid.get(key);
                if (list) list.push(b); else grid.set(key, [b]);
            }
    }
    const nearby = (b: CityBuilding) => {
        const result = new Set<CityBuilding>(), x = Math.floor(b.arc / cell), z = Math.floor(b.axial / cell);
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++)
            for (const candidate of grid.get(`${x + i},${z + j}`) ?? []) result.add(candidate);
        return [...result];
    };
    const crosses = (a: CityBuilding, b: CityBuilding, obstacle: CityBuilding) => {
        const bounds = cityBuildingBounds(obstacle);
        let enter = 0, leave = 1;
        for (const [start, delta, min, max] of [[a.arc, b.arc - a.arc, bounds.arcMin, bounds.arcMax],
            [a.axial, b.axial - a.axial, bounds.axialMin, bounds.axialMax]]) {
            if (Math.abs(delta) < 1e-9) { if (start < min || start > max) return false; }
            else {
                const first = (min - start) / delta, last = (max - start) / delta;
                enter = Math.max(enter, Math.min(first, last)); leave = Math.min(leave, Math.max(first, last));
                if (enter > leave) return false;
            }
        }
        return true;
    };
    const bridges: Skybridge[] = [], linked = new Set<string>();
    for (const a of candidates) {
        const random = mulberry32(a.seed ^ 0x5b1d);
        const neighbours = nearby(a).filter(b => b !== a && canHost(b))
            .map(b => ({ b, distance: Math.hypot(b.arc - a.arc, b.axial - a.axial) }))
            .filter(({ distance }) => distance > 30 && distance < 150).sort((p, q) => p.distance - q.distance).slice(0, 2);
        for (const { b, distance } of neighbours) {
            const pair = a.seed < b.seed ? `${a.seed}:${b.seed}` : `${b.seed}:${a.seed}`;
            if (linked.has(pair) || random() > .75) continue;
            const lower = Math.min(a.height, b.height);
            const blocked = [.25, .5, .75].some(t => {
                const arc = a.arc + (b.arc - a.arc) * t, axial = a.axial + (b.axial - a.axial) * t;
                return reservedLand(arc - 1, arc + 1, axial - 1, axial + 1);
            }) || nearby(a).some(other => other !== a && other !== b && crosses(a, b, other));
            if (blocked) continue;
            linked.add(pair);
            const levels = Math.min(3, Math.max(1, Math.floor(lower / 150)));
            for (let level = 0; level < levels; level++) bridges.push({
                arc: (a.arc + b.arc) / 2, axial: (a.axial + b.axial) / 2,
                height: Math.max(72 + 20, lower * (.32 + level * .2)), length: distance,
                yaw: Math.atan2(-(b.axial - a.axial), b.arc - a.arc),
            });
        }
    }
    return bridges;
}

/** Arc/axial position along a line, given a distance travelled from its start. */
function linePoint(line: RailLine, distance: number): [arc: number, axial: number] {
    if (line.direction === 'ring') return [wrapArc(distance), line.at];
    return [line.at, HABITAT_AXIAL_MIN + LINE_MARGIN + distance];
}
const lineLength = (line: RailLine) => line.direction === 'ring' ? CIRCUMFERENCE : HABITAT_AXIAL_MAX - HABITAT_AXIAL_MIN - LINE_MARGIN * 2;

/**
 * Stops along a line. Axial lines have a terminal at each endcap and a station just past every ring line
 * (an interchange); ring lines stop just past every axial line and midway between them.
 */
export function lineStops(line: RailLine): number[] {
    const length = lineLength(line);
    if (line.direction === 'axial') {
        const stops = [0, length];
        for (const ring of CITY_RAIL_LINES) if (ring.direction === 'ring') {
            const stop = ring.at - HABITAT_AXIAL_MIN - LINE_MARGIN + 130;
            if (stop > 300 && stop < length - 300) stops.push(stop);
        }
        return stops.sort((a, b) => a - b);
    }
    const crossings = CITY_RAIL_LINES.filter(other => other.direction === 'axial')
        .map(other => ((other.at + 130) % length + length) % length).sort((a, b) => a - b);
    return crossings.flatMap((stop, i) => {
        const next = i + 1 < crossings.length ? crossings[i + 1] : crossings[0] + length;
        return [stop, ((stop + next) / 2) % length];
    }).sort((a, b) => a - b);
}
