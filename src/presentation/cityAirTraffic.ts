import { mulberry32 } from '../simulation/rng';
import { cityBuildingBounds, type CityBuilding } from './cityLayout';
import { buildingMasses } from './cityMassing';
import { HABITAT_GROUND_Y } from './habitatFrame';

/** A cantilevered landing pad. `heading` is the outward direction: (sin, cos) of it is (arc, axial). */
export interface LandingPad { arc: number; axial: number; height: number; heading: number; yaw: number; approach: [arc: number, axial: number] }
/** `docked` marks the segment that ends at this keyframe as time spent standing on a pad. */
interface Keyframe { time: number; arc: number; height: number; axial: number; heading: number; docked: boolean }
export interface AirRoute { keyframes: Keyframe[]; period: number }
export interface AirSample { arc: number; height: number; axial: number; heading: number; docked: boolean }

export const PAD_SIZE = 16;
const CRUISE_SPEED = 55, CLIMB_SPEED = 9, TAXI_SECONDS = 6, TURN_SECONDS = 4;

/** Spatial index over footprints, for keeping pads, approaches and cruise legs clear of towers. */
function footprintIndex(buildings: readonly CityBuilding[]) {
    const cell = 120, grid = new Map<string, CityBuilding[]>();
    for (const b of buildings) {
        const f = cityBuildingBounds(b);
        for (let x = Math.floor(f.arcMin / cell); x <= Math.floor(f.arcMax / cell); x++)
            for (let z = Math.floor(f.axialMin / cell); z <= Math.floor(f.axialMax / cell); z++) {
                const key = `${x},${z}`; const list = grid.get(key); if (list) list.push(b); else grid.set(key, [b]);
            }
    }
    /** Tallest tower whose footprint, grown by `margin`, contains the point; 0 when the point is open air. */
    return (arc: number, axial: number, margin = 0, except?: CityBuilding) => {
        let tallest = 0;
        for (let x = Math.floor((arc - margin) / cell); x <= Math.floor((arc + margin) / cell); x++)
            for (let z = Math.floor((axial - margin) / cell); z <= Math.floor((axial + margin) / cell); z++)
                for (const b of grid.get(`${x},${z}`) ?? []) {
                    if (b === except) continue;
                    const f = cityBuildingBounds(b);
                    if (arc > f.arcMin - margin && arc < f.arcMax + margin && axial > f.axialMin - margin && axial < f.axialMax + margin)
                        tallest = Math.max(tallest, b.height);
                }
        return tallest;
    };
}

/** Pads project from the upper half of tall towers, with open air in front of them for the approach. */
export function planLandingPads(buildings: readonly CityBuilding[], excludedHostSeeds?: ReadonlySet<number>): LandingPad[] {
    const occupied = footprintIndex(buildings), pads: LandingPad[] = [];
    for (const b of buildings) {
        const random = mulberry32(b.seed ^ 0x9ad1);
        if (b.height < 110 || b.archetype === 'courtyard' || excludedHostSeeds?.has(b.seed) || random() > .5) continue;
        const main = buildingMasses(b).reduce((best, m) => m.width * m.height > best.width * best.height ? m : best);
        const face = Math.floor(random() * 4), alongZ = face < 2, sign = face % 2 ? -1 : 1;
        const out: [number, number] = alongZ ? [0, sign] : [sign, 0];
        const half = (alongZ ? main.depth : main.width) / 2;
        const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
        const world = (lx: number, lz: number): [number, number] => [b.arc + c * lx + s * lz, b.axial - s * lx + c * lz];
        const along = (distance: number) => world(main.x + out[0] * (half + distance), main.z + out[1] * (half + distance));
        const [arc, axial] = along(PAD_SIZE / 2), approach = along(45);
        const direction = [c * out[0] + s * out[1], -s * out[0] + c * out[1]];
        const height = HABITAT_GROUND_Y + main.bottom + main.height * (.5 + random() * .35);
        if (height < HABITAT_GROUND_Y + 100 || occupied(arc, axial, 4, b) || occupied(...approach, 12, b)
            || pads.some(pad => Math.hypot(pad.arc - arc, pad.axial - axial) < 70)) continue;
        pads.push({ arc, axial, height, heading: Math.atan2(direction[0], direction[1]), yaw: b.yaw + [0, Math.PI, Math.PI / 2, -Math.PI / 2][face], approach });
    }
    return pads;
}

const angleTo = (from: number, to: number) => from + ((to - from + Math.PI * 3) % (Math.PI * 2) - Math.PI);

/**
 * Each craft repeats a loop of hops: taxi off its pad, climb over the local skyline, cruise, descend at the
 * next pad's approach point, taxi in and stay docked for a while. Routes are fixed keyframe loops, so a
 * timestamp always gives the same traffic.
 */
export function planAirRoutes(pads: readonly LandingPad[], buildings: readonly CityBuilding[], count: number, seed = 7351): AirRoute[] {
    const skyline = footprintIndex(buildings), random = mulberry32(seed), routes: AirRoute[] = [];
    if (pads.length < 2) return routes;
    for (let n = 0; n < count; n++) {
        const stops = [pads[Math.floor(random() * pads.length)]];
        while (stops.length < 5) {
            // Never the pad it is standing on, and the loop's last hop must lead somewhere other than home.
            const from = stops[stops.length - 1], last = stops.length === 4;
            const options = pads.filter(pad => pad !== from && !(last && pad === stops[0]));
            const nearby = options.filter(pad => Math.hypot(pad.arc - from.arc, pad.axial - from.axial) < 2400);
            const pool = nearby.length ? nearby : options;
            stops.push(pool[Math.floor(random() * pool.length)]);
        }
        const keyframes: Keyframe[] = [];
        let time = 0, heading = stops[0].heading + Math.PI;
        const key = (duration: number, arc: number, height: number, axial: number, nextHeading: number, docked = false) => {
            time += duration; heading = angleTo(heading, nextHeading);
            keyframes.push({ time, arc, height, axial, heading, docked });
        };
        keyframes.push({ time, arc: stops[0].arc, height: stops[0].height + 1.2, axial: stops[0].axial, heading, docked: true });
        for (let i = 0; i < stops.length; i++) {
            const a = stops[i], b = stops[(i + 1) % stops.length];
            const dock = 12 + random() * 40;
            key(dock, a.arc, a.height + 1.2, a.axial, heading, true);
            // Turn on the pad to face out before lifting off.
            key(TURN_SECONDS, a.arc, a.height + 1.2, a.axial, a.heading, true);
            key(TAXI_SECONDS, a.approach[0], a.height + 4, a.approach[1], a.heading);
            // Cruise just above whatever stands along the leg.
            const [ax, az] = a.approach, [bx, bz] = b.approach, length = Math.hypot(bx - ax, bz - az);
            let cruise = Math.max(a.height, b.height) + 30;
            for (let d = 0; d <= length; d += 30) cruise = Math.max(cruise, HABITAT_GROUND_Y + skyline(ax + (bx - ax) * d / length, az + (bz - az) * d / length, 20) + 35);
            cruise += random() * 40;
            const course = Math.atan2(bx - ax, bz - az);
            key((cruise - a.height) / CLIMB_SPEED + 2, ax, cruise, az, course);
            key(length / CRUISE_SPEED + 4, bx, cruise, bz, course);
            key((cruise - b.height) / CLIMB_SPEED + 2, bx, b.height + 4, bz, b.heading + Math.PI);
            key(TAXI_SECONDS, b.arc, b.height + 1.2, b.axial, b.heading + Math.PI);
        }
        routes.push({ keyframes, period: time });
    }
    return routes;
}

export function sampleAirRoute(route: AirRoute, seconds: number, target: AirSample): AirSample {
    const frames = route.keyframes, t = (seconds % route.period + route.period) % route.period;
    let low = 0, high = frames.length - 1;
    while (low < high) { const mid = (low + high + 1) >> 1; if (frames[mid].time <= t) low = mid; else high = mid - 1; }
    const a = frames[low], b = frames[Math.min(low + 1, frames.length - 1)];
    const u = b.time > a.time ? (t - a.time) / (b.time - a.time) : 0, e = u * u * (3 - 2 * u);
    target.arc = a.arc + (b.arc - a.arc) * e; target.axial = a.axial + (b.axial - a.axial) * e;
    target.height = a.height + (b.height - a.height) * e; target.heading = a.heading + (b.heading - a.heading) * e;
    target.docked = b.docked;
    return target;
}
