import { LOUNGE_Z } from './bridgeMotion';

export interface FloorPoint { x: number; z: number }
// Furniture footprints in world metres, shared by player collision and cat navigation.
export const ROOM_OBSTACLES = [
    [-3.12, -.88, -2.2, -1.24],
    [-2.55, -1.45, -.825, -.275],
    [.3, 1.9, -1.475, -.725],
    [.85, 1.35, -.39, .105],
    [-3.8, -3.2, -2.2, -1.6],
].map(([x0, x1, z0, z1]) => ({ x0, x1, z0: z0 + LOUNGE_Z, z1: z1 + LOUNGE_Z }));
export const ROOM_PLAYER_RADIUS = .25;
export const ROOM_BOUNDS = { x0: -8.5, x1: 8.5, z0: -8.5, z1: 10.8 };

/** Swept axis movement prevents tunnelling and lets a blocked player slide along edges. */
export function moveInRoom(start: FloorPoint, movement: FloorPoint): FloorPoint {
    const p = { ...start };
    // Short substeps keep diagonal movement symmetric near small obstacles.
    const steps = Math.max(1, Math.ceil(Math.hypot(movement.x, movement.z) / .05));
    for (let i = 0; i < steps; i++) {
        let x = Math.max(ROOM_BOUNDS.x0, Math.min(ROOM_BOUNDS.x1, p.x + movement.x / steps));
        for (const b of ROOM_OBSTACLES) {
            if (p.z <= b.z0 - ROOM_PLAYER_RADIUS || p.z >= b.z1 + ROOM_PLAYER_RADIUS) continue;
            if (p.x <= b.x0 - ROOM_PLAYER_RADIUS && x > b.x0 - ROOM_PLAYER_RADIUS) x = Math.min(x, b.x0 - ROOM_PLAYER_RADIUS);
            if (p.x >= b.x1 + ROOM_PLAYER_RADIUS && x < b.x1 + ROOM_PLAYER_RADIUS) x = Math.max(x, b.x1 + ROOM_PLAYER_RADIUS);
        }
        p.x = x;
        let z = Math.max(ROOM_BOUNDS.z0, Math.min(ROOM_BOUNDS.z1, p.z + movement.z / steps));
        for (const b of ROOM_OBSTACLES) {
            if (p.x <= b.x0 - ROOM_PLAYER_RADIUS || p.x >= b.x1 + ROOM_PLAYER_RADIUS) continue;
            if (p.z <= b.z0 - ROOM_PLAYER_RADIUS && z > b.z0 - ROOM_PLAYER_RADIUS) z = Math.min(z, b.z0 - ROOM_PLAYER_RADIUS);
            if (p.z >= b.z1 + ROOM_PLAYER_RADIUS && z < b.z1 + ROOM_PLAYER_RADIUS) z = Math.max(z, b.z1 + ROOM_PLAYER_RADIUS);
        }
        p.z = z;
    }
    return p;
}
