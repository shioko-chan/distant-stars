import gait from '../content/catGait.json';
import { CAT_START_POSITION, LOUNGE_Z } from './bridgeMotion';

export const CAT_WALK_SPEED = gait.stride * gait.modelScale / gait.duration;
export const CAT_WALK_STRIDE = gait.stride * gait.modelScale;

type Point = { x: number; z: number };
// Conservative footprints include a 34 cm margin for the cat's body and tail.
const margin = .34;
const obstacles = [
    [-3.12, -.88, -2.2, -1.24], // sofa
    [-2.55, -1.45, -.825, -.275], // coffee table
    [.3, 1.9, -1.475, -.725], // desk
    [.85, 1.35, -.39, .105], // chair
    [-3.8, -3.2, -2.2, -1.6], // floor lamp
].map(([x0, x1, z0, z1]) => [x0 - margin, x1 + margin, z0 + LOUNGE_Z - margin, z1 + LOUNGE_Z + margin]);

export function catPositionClear(p: Point): boolean {
    return Math.abs(p.x) < 8.3 && p.z > -8.3 && p.z < 10.6 &&
        !obstacles.some(([x0, x1, z0, z1]) => p.x >= x0 && p.x <= x1 && p.z >= z0 && p.z <= z1);
}
export function catPathClear(a: Point, b: Point): boolean {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / .04);
    for (let i = 0; i <= steps; i++) {
        const t = steps ? i / steps : 0;
        if (!catPositionClear({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })) return false;
    }
    return true;
}
export function createCatWander(random = Math.random) {
    const position = { x: CAT_START_POSITION[0], z: CAT_START_POSITION[2] };
    let goal: Point | undefined;
    let pause = 1.5, yaw = Math.PI;
    return {
        position,
        update(delta: number, enabled = true) {
            let distanceMoved = 0;
            let turnMoved = 0;
            let moving = false;
            if (enabled) {
                pause -= delta;
                if (!goal && pause <= 0) {
                    for (let attempt = 0; attempt < 24; attempt++) {
                        const candidate = { x: -4 + random() * 8, z: LOUNGE_Z - 2.2 + random() * 5.8 };
                        if (Math.hypot(candidate.x - position.x, candidate.z - position.z) > .6 && catPathClear(position, candidate)) { goal = candidate; break; }
                    }
                    if (!goal) pause = 1;
                }
                if (goal) {
                    const dx = goal.x - position.x, dz = goal.z - position.z;
                    const distance = Math.hypot(dx, dz);
                    const desired = Math.atan2(dx, dz);
                    const turn = Math.atan2(Math.sin(desired - yaw), Math.cos(desired - yaw));
                    turnMoved = Math.max(-delta * 1.2, Math.min(delta * 1.2, turn));
                    yaw += turnMoved;
                    moving = Math.abs(turnMoved) > .0001;
                    if (Math.abs(turn) < .12) {
                        const step = Math.min(distance, delta * CAT_WALK_SPEED);
                        distanceMoved = step;
                        position.x += dx / distance * step; position.z += dz / distance * step;
                        moving = true;
                        if (distance <= step + .001) { goal = undefined; pause = 2 + random() * 4; }
                    }
                }
            }
            return { x: position.x, z: position.z, yaw, moving, distanceMoved, turnMoved };
        },
    };
}
