import * as THREE from 'three';
import { mulberry32 } from '../simulation/rng';
import { CITY_RAIL_LINES, RAIL_HEIGHT, reservedLand, wrapArc, type RailLine } from './cityLandUse';
import { cityBuildingBounds, type CityBuilding } from './cityLayout';
import { HABITAT_AXIAL_MAX, HABITAT_AXIAL_MIN, HABITAT_GROUND_Y, HABITAT_RADIUS_M, habitatOrientation, habitatPoint } from './habitatFrame';
import { NEON_COLORS } from './cityNeon';
import { createTimetable, sampleTimetable, type RailTimetable } from './railSchedule';
import { PAD_SIZE, planAirRoutes, planLandingPads, sampleAirRoute, type AirSample } from './cityAirTraffic';

const CIRCUMFERENCE = Math.PI * 2 * HABITAT_RADIUS_M;
const RING_SEGMENTS = 480;
const PYLON_SPACING = 160;
const PLATFORM_LENGTH = 150, TERMINAL_LENGTH = 210;
const LINE_MARGIN = 110;
const TRACK_OFFSET = 2.7;
const CAR_LENGTH = 22, CARS = 4;

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
                height: Math.max(RAIL_HEIGHT + 20, lower * (.32 + level * .2)), length: distance,
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

/** Elevated light rail, its stations and trains, and flying traffic, all in the co-rotating habitat frame. */
export function createCityTransit(localBuildings: readonly CityBuilding[] = [], excludedHostSeeds?: ReadonlySet<number>) {
    const group = new THREE.Group(); group.name = 'city-transit';
    const box = new THREE.BoxGeometry(1, 1, 1);
    const concrete = new THREE.MeshStandardMaterial({ color: '#a7b1b8', roughness: .7, metalness: .2 });
    const hull = new THREE.MeshStandardMaterial({ color: '#e6ecf0', roughness: .3, metalness: .5 });
    const dark = new THREE.MeshStandardMaterial({ color: '#1d2730', roughness: .4, metalness: .6 });
    const glass = new THREE.MeshStandardMaterial({ color: '#9fd4e6', emissive: '#2a6d86', emissiveIntensity: .9, roughness: .15, metalness: .5 });
    const glow = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const transform = new THREE.Object3D(), yaw = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), color = new THREE.Color();
    const setPart = (mesh: THREE.InstancedMesh, index: number, arc: number, height: number, axial: number, scale: THREE.Vector3Tuple, rotation = 0) => {
        habitatPoint(arc, height, axial, transform.position);
        habitatOrientation(arc, transform.quaternion).multiply(yaw.setFromAxisAngle(up, rotation));
        transform.scale.fromArray(scale); transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix);
    };
    type Part = { arc: number; height: number; axial: number; scale: THREE.Vector3Tuple; rotation: number; tint?: THREE.Vector3Tuple };
    const staticMesh = (name: string, material: THREE.Material, parts: Part[]) => {
        const mesh = new THREE.InstancedMesh(box, material, parts.length); mesh.name = name;
        parts.forEach((p, i) => { setPart(mesh, i, p.arc, p.height, p.axial, p.scale, p.rotation); if (p.tint) mesh.setColorAt(i, color.setRGB(...p.tint)); });
        mesh.computeBoundingSphere(); group.add(mesh); return mesh;
    };
    // Parts laid along a line: `along` runs with the track, `lateral` across it.
    const onLine = (parts: Part[], line: RailLine, distance: number, lateral: number, height: number, [width, tall, along]: THREE.Vector3Tuple, tint?: THREE.Vector3Tuple) => {
        const [arc, axial] = linePoint(line, distance), ring = line.direction === 'ring';
        parts.push({ arc: ring ? arc : arc + lateral, height, axial: ring ? axial + lateral : axial, scale: ring ? [along, tall, width] : [width, tall, along], rotation: 0, tint });
    };

    // Guideways: straight along the axis, or ring segments whose chords stay within 35 cm of the arc.
    // One thin lit strip, slightly wider than each beam, shows as a light line along both edges.
    const beams: Part[] = [], rails: Part[] = [], pylons: Part[] = [], platforms: Part[] = [], canopies: Part[] = [], halls: Part[] = [], signs: Part[] = [];
    const deck = HABITAT_GROUND_Y + RAIL_HEIGHT;
    const timetables: { line: RailLine; table: RailTimetable; trains: number }[] = [];
    for (const line of CITY_RAIL_LINES) {
        const length = lineLength(line);
        if (line.direction === 'axial') {
            const axial = HABITAT_AXIAL_MIN + LINE_MARGIN + length / 2;
            beams.push({ arc: line.at, height: deck - 1.2, axial, scale: [11, 2.4, length + TERMINAL_LENGTH], rotation: 0 });
            rails.push({ arc: line.at, height: deck - .6, axial, scale: [11.5, .35, length], rotation: 0, tint: [.18, .34, .38] });
        } else {
            const step = length / RING_SEGMENTS, chord = 2 * (HABITAT_RADIUS_M - deck) * Math.sin(step / HABITAT_RADIUS_M / 2) + .6;
            for (let i = 0; i < RING_SEGMENTS; i++) {
                const arc = wrapArc((i + .5) * step);
                beams.push({ arc, height: deck - 1.2, axial: line.at, scale: [chord, 2.4, 11], rotation: 0 });
                rails.push({ arc, height: deck - .6, axial: line.at, scale: [chord, .35, 11.5], rotation: 0, tint: [.32, .39, .42] });
            }
        }
        for (let distance = PYLON_SPACING / 2; distance < length; distance += PYLON_SPACING) {
            const [arc, axial] = linePoint(line, distance);
            pylons.push({ arc, height: HABITAT_GROUND_Y + (RAIL_HEIGHT - 2.4) / 2, axial, scale: [4, RAIL_HEIGHT - 2.4, 4], rotation: 0 });
        }
        const stops = lineStops(line), hue = NEON_COLORS[CITY_RAIL_LINES.indexOf(line) % NEON_COLORS.length];
        for (const stop of stops) {
            const terminal = line.direction === 'axial' && (stop === 0 || stop === length);
            if (terminal) {
                // Terminal hall: the guideway ends inside it, where trains cross over to the return track.
                // The hall reaches back almost to the endcap, and the stopped train sits wholly inside it.
                const centre = stop + (stop === 0 ? 1 : -1) * 5;
                onLine(halls, line, centre, 0, deck + 8, [30, 17, TERMINAL_LENGTH]);
                // A lit band wraps the hall just below its roof, which carries a glass skylight.
                onLine(signs, line, centre, 0, deck + 15.4, [30.6, .7, TERMINAL_LENGTH + .6], [hue[0] * 1.8, hue[1] * 1.8, hue[2] * 1.8]);
                onLine(canopies, line, centre, 0, deck + 16.6, [12, .4, TERMINAL_LENGTH - 24]);
                for (const side of [-1, 1]) onLine(signs, line, centre, side * 15.3, deck + 4, [.4, .6, TERMINAL_LENGTH - 10], [2, 1.7, 1.2]);
                onLine(pylons, line, centre, 0, HABITAT_GROUND_Y + RAIL_HEIGHT / 2, [26, RAIL_HEIGHT, 40]);
                continue;
            }
            for (const side of [-1, 1]) {
                onLine(platforms, line, stop, side * 9.6, deck + .4, [7, 1, PLATFORM_LENGTH]);
                onLine(canopies, line, stop, side * 8.6, deck + 6.4, [9.5, .4, PLATFORM_LENGTH - 6]);
                onLine(signs, line, stop, side * 13.2, deck + 3, [.3, 1.2, PLATFORM_LENGTH - 10], [hue[0] * 1.6, hue[1] * 1.6, hue[2] * 1.6]);
            }
            onLine(pylons, line, stop + PLATFORM_LENGTH / 2 - 8, 16, HABITAT_GROUND_Y + (RAIL_HEIGHT + 8) / 2, [7, RAIL_HEIGHT + 8, 7]);
        }
        if (line.direction === 'axial') timetables.push({ line, table: createTimetable(stops), trains: 7 });
        else for (const reverse of [false, true]) timetables.push({ line, table: createTimetable(stops, { loop: length, reverse }), trains: 9 });
    }
    staticMesh('rail-guideways', concrete, beams);
    staticMesh('rail-pylons', concrete, pylons);
    staticMesh('rail-edge-lights', glow, rails);
    staticMesh('rail-stations', hull, [...platforms, ...halls]);
    staticMesh('rail-station-canopies', glass, canopies);
    staticMesh('rail-station-lights', glow, signs);

    // Trains share their line's timetable at even offsets, so they keep their headway and never overtake.
    const trains = timetables.flatMap(({ line, table, trains: count }) =>
        Array.from({ length: count }, (_, i) => ({ line, table, offset: table.period * i / count })));
    const cars = new THREE.InstancedMesh(box, hull, trains.length * CARS), windows = new THREE.InstancedMesh(box, glow, trains.length * CARS);
    cars.name = 'light-rail-cars'; windows.name = 'light-rail-windows';
    for (let i = 0; i < windows.count; i++) windows.setColorAt(i, color.setRGB(1.6, 1.35, 1).multiplyScalar(.85 + (i % 5) * .06));

    // Lane traffic weaves gently above the rail corridors, where no tower stands.
    const random = mulberry32(60617);
    const lanes = CITY_RAIL_LINES.flatMap(line => (line.direction === 'ring' ? [140, 260, 380, 500] : [150, 290, 430])
        .flatMap(height => [-1, 1].map(direction => ({ line, height, direction, offset: direction * (7 + random() * 5) }))));
    const flyers = lanes.flatMap(lane => {
        const count = lane.line.direction === 'ring' ? 30 : 8;
        return Array.from({ length: count }, (_, i) => ({
            lane, phase: (i + random() * .8) / count, speed: 55 + random() * 60, size: random() > .92 ? 2.6 : .9 + random() * .5,
            jitter: (random() - .5) * 10, weave: random() * 6.3,
        }));
    });
    // Private craft hop between landing pads on the towers around the residence.
    const pads = planLandingPads(localBuildings, excludedHostSeeds);
    const routes = planAirRoutes(pads, localBuildings, Math.min(320, pads.length * 3));
    const padParts: Part[] = [], padLights: Part[] = [];
    for (const pad of pads) {
        padParts.push({ arc: pad.arc, height: pad.height - .5, axial: pad.axial, scale: [PAD_SIZE, 1, PAD_SIZE], rotation: pad.yaw });
        padLights.push({ arc: pad.arc, height: pad.height - .75, axial: pad.axial, scale: [PAD_SIZE + .8, .35, PAD_SIZE + .8], rotation: pad.yaw, tint: [.3, .9, .7] });
    }
    if (pads.length) { staticMesh('landing-pads', dark, padParts); staticMesh('landing-pad-lights', glow, padLights); }

    const vehicles = flyers.length + routes.length;
    const bodies = new THREE.InstancedMesh(box, dark, vehicles), lights = new THREE.InstancedMesh(box, glow, vehicles * 2);
    bodies.name = 'flying-vehicles'; lights.name = 'flying-vehicle-lights';
    for (let i = 0; i < vehicles; i++) {
        // Readable direction of travel: restrained red tail lamps and warm-white headlights.
        lights.setColorAt(i * 2, color.setRGB(2.5, .16, .08));
        lights.setColorAt(i * 2 + 1, color.setRGB(2.2, 2.05, 1.7));
    }
    for (const mesh of [cars, windows, bodies, lights]) { mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; group.add(mesh); }

    const travel = (line: RailLine, direction: number, phase: number, speed: number, seconds: number) => {
        const length = lineLength(line), distance = (seconds * speed / length + phase) % 1;
        if (line.direction === 'ring') return { distance: (direction > 0 ? distance : 1 - distance) * length, heading: direction };
        const outbound = distance < .5, along = outbound ? distance * 2 : 2 - distance * 2;
        return { distance: along * length, heading: outbound ? 1 : -1 };
    };
    // Local frame: ring motion runs along +x (arc), axial motion along +z.
    const place = (mesh: THREE.InstancedMesh, index: number, line: RailLine, distance: number, lateral: number, height: number, scale: THREE.Vector3Tuple) => {
        const [arc, axial] = linePoint(line, distance);
        const ring = line.direction === 'ring';
        setPart(mesh, index, ring ? arc : arc + lateral, height, ring ? axial + lateral : axial, scale, ring ? Math.PI / 2 : 0);
    };
    const craft: AirSample = { arc: 0, height: 0, axial: 0, heading: 0, docked: false };
    const vehicle = (index: number, arc: number, height: number, axial: number, heading: number, size: number) => {
        const nose = Math.sin(heading), tail = Math.cos(heading);
        setPart(bodies, index, arc, height, axial, [2.2 * size, .8 * size, 5.2 * size], heading);
        setPart(lights, index * 2, arc - nose * 2.7 * size, height, axial - tail * 2.7 * size, [1.7 * size, .25 * size, .2 * size], heading);
        setPart(lights, index * 2 + 1, arc + nose * 2.7 * size, height, axial + tail * 2.7 * size, [1.9 * size, .2 * size, .2 * size], heading);
    };
    const update = (seconds: number) => {
        trains.forEach((train, t) => {
            const { distance, lateral } = sampleTimetable(train.table, seconds + train.offset);
            for (let c = 0; c < CARS; c++) {
                const along = distance + (c - (CARS - 1) / 2) * (CAR_LENGTH + 1.2);
                place(cars, t * CARS + c, train.line, along, lateral * TRACK_OFFSET, deck + 2.2, [3.1, 3.6, CAR_LENGTH]);
                place(windows, t * CARS + c, train.line, along, lateral * TRACK_OFFSET, deck + 2.6, [3.16, .9, CAR_LENGTH - 2]);
            }
        });
        flyers.forEach((flyer, i) => {
            const { lane } = flyer;
            const { distance, heading } = travel(lane.line, lane.direction, flyer.phase, flyer.speed, seconds);
            const weave = Math.sin(distance / 650 + flyer.weave), ring = lane.line.direction === 'ring';
            const [arc, axial] = linePoint(lane.line, distance), lateral = lane.offset + weave * 5;
            const course = ring ? (heading > 0 ? Math.PI / 2 : -Math.PI / 2) : (heading > 0 ? 0 : Math.PI);
            vehicle(i, ring ? arc : arc + lateral, HABITAT_GROUND_Y + lane.height + flyer.jitter + weave * 6, ring ? axial + lateral : axial, course, flyer.size);
        });
        routes.forEach((route, r) => {
            sampleAirRoute(route, seconds, craft);
            vehicle(flyers.length + r, craft.arc, craft.height + .4, craft.axial, craft.heading, 1.1);
        });
        for (const mesh of [cars, windows, bodies, lights]) mesh.instanceMatrix.needsUpdate = true;
    };
    update(0);
    group.userData.trainCount = trains.length; group.userData.flyerCount = vehicles; group.userData.padCount = pads.length;
    return { group, update, instanceCount: beams.length + rails.length + pylons.length + platforms.length + halls.length + canopies.length + signs.length
        + pads.length * 2 + cars.count * 2 + vehicles * 3 };
}
