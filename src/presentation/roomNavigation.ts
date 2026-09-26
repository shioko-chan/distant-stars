import { moveInRoom, ROOM_BOUNDS, ROOM_OBSTACLES, ROOM_PLAYER_RADIUS, type FloorPoint } from './roomCollision';

export const ROOM_WALK_SPEED = 1.8;
const EPSILON = 1e-9;
const CORNER_CLEARANCE = .02;
const obstacles = ROOM_OBSTACLES.map(b => ({
    x0: b.x0 - ROOM_PLAYER_RADIUS, x1: b.x1 + ROOM_PLAYER_RADIUS,
    z0: b.z0 - ROOM_PLAYER_RADIUS, z1: b.z1 + ROOM_PLAYER_RADIUS,
}));
const movementKeys = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight']);

export function isRoomMovementKey(code: string): boolean {
    return movementKeys.has(code);
}

/** Aliases count once, and opposite directions cancel. The caller normalizes diagonals. */
export function movementFromKeys(keys: ReadonlySet<string>): { forward: number; sideways: number } {
    return {
        forward: Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown')),
        sideways: Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')),
    };
}

function validPoint(p: FloorPoint): boolean {
    return Number.isFinite(p.x) && Number.isFinite(p.z)
        && p.x >= ROOM_BOUNDS.x0 && p.x <= ROOM_BOUNDS.x1
        && p.z >= ROOM_BOUNDS.z0 && p.z <= ROOM_BOUNDS.z1
        && !obstacles.some(b => p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1);
}

/** A segment can follow a footprint boundary, but cannot enter its interior. */
function clearSegment(a: FloorPoint, b: FloorPoint): boolean {
    return !obstacles.some(box => {
        let enter = 0, leave = 1;
        for (const axis of ['x', 'z'] as const) {
            const low = box[`${axis}0`], high = box[`${axis}1`];
            const origin = a[axis], delta = b[axis] - origin;
            if (Math.abs(delta) < EPSILON) {
                if (origin <= low || origin >= high) return false;
                continue;
            }
            const t0 = (low - origin) / delta, t1 = (high - origin) / delta;
            enter = Math.max(enter, Math.min(t0, t1));
            leave = Math.min(leave, Math.max(t0, t1));
            if (leave - enter <= EPSILON) return false;
        }
        return leave - enter > EPSILON;
    });
}

/** Shortest visibility-graph route around furniture; returned waypoints exclude start. */
export function findRoomPath(start: FloorPoint, target: FloorPoint): FloorPoint[] {
    if (!validPoint(start) || !validPoint(target)) return [];
    if (Math.hypot(target.x - start.x, target.z - start.z) < EPSILON) return [];
    if (clearSegment(start, target)) return [{ ...target }];

    const corners = obstacles.flatMap(b => [
        { x: b.x0 - CORNER_CLEARANCE, z: b.z0 - CORNER_CLEARANCE },
        { x: b.x0 - CORNER_CLEARANCE, z: b.z1 + CORNER_CLEARANCE },
        { x: b.x1 + CORNER_CLEARANCE, z: b.z0 - CORNER_CLEARANCE },
        { x: b.x1 + CORNER_CLEARANCE, z: b.z1 + CORNER_CLEARANCE },
    ]).filter(validPoint);
    const nodes = [{ ...start }, { ...target }, ...corners];
    const distances = nodes.map(() => Infinity), previous = nodes.map(() => -1);
    const visited = new Set<number>();
    distances[0] = 0;

    for (let count = 0; count < nodes.length; count++) {
        let nearest = -1;
        for (let i = 0; i < nodes.length; i++) {
            if (!visited.has(i) && (nearest === -1 || distances[i] < distances[nearest])) nearest = i;
        }
        if (nearest === -1 || !Number.isFinite(distances[nearest])) return [];
        if (nearest === 1) {
            const path: FloorPoint[] = [];
            for (let i = 1; i !== 0; i = previous[i]) path.unshift(nodes[i]);
            return path;
        }
        visited.add(nearest);
        for (let i = 0; i < nodes.length; i++) {
            if (visited.has(i) || !clearSegment(nodes[nearest], nodes[i])) continue;
            const distance = distances[nearest] + Math.hypot(nodes[i].x - nodes[nearest].x, nodes[i].z - nodes[nearest].z);
            if (distance < distances[i]) {
                distances[i] = distance;
                previous[i] = nearest;
            }
        }
    }
    return [];
}

/** Consumes reached waypoints, sharing the same collision checks and speed as keyboard walking. */
export function stepRoomPath(start: FloorPoint, path: FloorPoint[], deltaSeconds: number): FloorPoint {
    let point = { ...start };
    let remaining = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) * ROOM_WALK_SPEED : 0;
    while (path.length && remaining > 0) {
        const target = path[0];
        const dx = target.x - point.x, dz = target.z - point.z;
        const distance = Math.hypot(dx, dz);
        if (distance < EPSILON) { path.shift(); continue; }
        const step = Math.min(distance, remaining);
        const next = moveInRoom(point, { x: dx / distance * step, z: dz / distance * step });
        remaining -= step;
        const blocked = Math.hypot(next.x - point.x, next.z - point.z) < EPSILON;
        point = next;
        if (Math.hypot(target.x - point.x, target.z - point.z) < EPSILON) path.shift();
        else if (blocked) { path.length = 0; break; }
    }
    return point;
}
