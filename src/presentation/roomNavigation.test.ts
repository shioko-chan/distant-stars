import { describe, expect, it } from 'vitest';
import { ROOM_BOUNDS, ROOM_OBSTACLES, ROOM_PLAYER_RADIUS, type FloorPoint } from './roomCollision';
import { findRoomPath, isRoomMovementKey, movementFromKeys, ROOM_WALK_SPEED, stepRoomPath } from './roomNavigation';

function expectWalkable(p: FloorPoint) {
    expect(p.x).toBeGreaterThanOrEqual(ROOM_BOUNDS.x0);
    expect(p.x).toBeLessThanOrEqual(ROOM_BOUNDS.x1);
    expect(p.z).toBeGreaterThanOrEqual(ROOM_BOUNDS.z0);
    expect(p.z).toBeLessThanOrEqual(ROOM_BOUNDS.z1);
    for (const b of ROOM_OBSTACLES) {
        const inside = p.x > b.x0 - ROOM_PLAYER_RADIUS + 1e-8 && p.x < b.x1 + ROOM_PLAYER_RADIUS - 1e-8
            && p.z > b.z0 - ROOM_PLAYER_RADIUS + 1e-8 && p.z < b.z1 + ROOM_PLAYER_RADIUS - 1e-8;
        expect(inside).toBe(false);
    }
}

describe('room walking keys', () => {
    it('maps arrows and WASD to the same directions, without doubling aliases', () => {
        expect(movementFromKeys(new Set(['ArrowUp', 'ArrowLeft']))).toEqual({ forward: 1, sideways: -1 });
        expect(movementFromKeys(new Set(['KeyW', 'KeyA']))).toEqual({ forward: 1, sideways: -1 });
        expect(movementFromKeys(new Set(['KeyW', 'ArrowUp', 'KeyD', 'ArrowRight']))).toEqual({ forward: 1, sideways: 1 });
        expect(movementFromKeys(new Set(['ArrowDown', 'ArrowRight']))).toEqual({ forward: -1, sideways: 1 });
    });

    it('cancels opposing directions and ignores unrelated keys', () => {
        expect(movementFromKeys(new Set(['KeyW', 'ArrowDown', 'KeyD', 'ArrowLeft', 'Space']))).toEqual({ forward: 0, sideways: 0 });
        for (const key of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
            expect(isRoomMovementKey(key)).toBe(true);
        }
        expect(isRoomMovementKey('Space')).toBe(false);
        expect(isRoomMovementKey('Home')).toBe(false);
    });
});

describe('click-to-walk routes', () => {
    it('walks directly to unobstructed floor and does not modify the supplied points', () => {
        const start = { x: 0, z: 0 }, target = { x: 6, z: 3 };
        const path = findRoomPath(start, target);
        expect(path).toEqual([target]);
        expect(path[0]).not.toBe(target);
        expect(start).toEqual({ x: 0, z: 0 });
        expect(findRoomPath(start, start)).toEqual([]);
    });

    it('rejects furniture, player-clearance margins and positions outside the room', () => {
        for (const b of ROOM_OBSTACLES) {
            const centerZ = (b.z0 + b.z1) / 2;
            expect(findRoomPath({ x: 0, z: 0 }, { x: (b.x0 + b.x1) / 2, z: centerZ })).toEqual([]);
            expect(findRoomPath({ x: 0, z: 0 }, { x: b.x0 - ROOM_PLAYER_RADIUS / 2, z: centerZ })).toEqual([]);
        }
        for (const target of [{ x: 9, z: 0 }, { x: 0, z: -9 }, { x: 0, z: 11 }, { x: NaN, z: 0 }]) {
            expect(findRoomPath({ x: 0, z: 0 }, target)).toEqual([]);
        }
        expect(findRoomPath({ x: 20, z: 0 }, { x: 0, z: 0 })).toEqual([]);
    });

    it('routes to the floor behind the sofa, clearing the sofa and overlapping table margins', () => {
        const target = { x: -2, z: -8.3 };
        const path = findRoomPath({ x: -2, z: -4 }, target);
        expect(path.length).toBeGreaterThan(1);
        expect(path.at(-1)).toEqual(target);
        let point = { x: -2, z: -4 };
        for (let frame = 0; frame < 1200 && path.length; frame++) {
            const next = stepRoomPath(point, path, 1 / 60);
            expect(Math.hypot(next.x - point.x, next.z - point.z)).toBeLessThanOrEqual(ROOM_WALK_SPEED / 60 + 1e-8);
            expectWalkable(next);
            point = next;
        }
        expect(path).toEqual([]);
        expect(point.x).toBeCloseTo(target.x, 7);
        expect(point.z).toBeCloseTo(target.z, 7);
    });

    it('navigates safely between room edges and on either side of the desk', () => {
        const trips = [
            [{ x: -8.5, z: 10.8 }, { x: 8.5, z: -8.5 }],
            [{ x: 1.1, z: -4.6 }, { x: 1.1, z: -8.3 }],
            [{ x: -5, z: -7.3 }, { x: 4, z: -7.3 }],
            [{ x: -3.01, z: ROOM_OBSTACLES[0].z1 + ROOM_PLAYER_RADIUS }, { x: -4.5, z: -8.4 }],
        ];
        for (const [start, target] of trips) {
            const path = findRoomPath(start, target);
            expect(path.length).toBeGreaterThan(0);
            let point = start;
            for (let frame = 0; frame < 2000 && path.length; frame++) {
                point = stepRoomPath(point, path, 1 / 30);
                expectWalkable(point);
            }
            expect(point.x).toBeCloseTo(target.x, 7);
            expect(point.z).toBeCloseTo(target.z, 7);
            expect(path).toEqual([]);
        }
    });

    it('uses 1.8 metres per second in all directions and consumes the time budget across corners', () => {
        const diagonal = stepRoomPath({ x: 0, z: 0 }, [{ x: 4, z: 4 }], 1);
        expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(1.8);
        const path = [{ x: .5, z: 0 }, { x: .5, z: 5 }];
        expect(stepRoomPath({ x: 0, z: 0 }, path, 1)).toEqual({ x: expect.closeTo(.5), z: expect.closeTo(1.3) });
        expect(path).toEqual([{ x: .5, z: 5 }]);
    });

    it('finishes exactly at the destination without overshoot and ignores nonpositive time', () => {
        const target = { x: .2, z: .3 }, path = [{ ...target }];
        const arrived = stepRoomPath({ x: 0, z: 0 }, path, 5);
        expect(arrived.x).toBeCloseTo(target.x);
        expect(arrived.z).toBeCloseTo(target.z);
        expect(path).toEqual([]);
        expect(stepRoomPath(arrived, path, 1)).toEqual(arrived);
        expect(stepRoomPath(arrived, [{ x: 5, z: 5 }], -1)).toEqual(arrived);
        expect(stepRoomPath(arrived, [{ x: 5, z: 5 }], NaN)).toEqual(arrived);
    });

    it('still applies collision protection to an invalid externally supplied straight route', () => {
        const path = [{ x: -2, z: -7.2 }];
        const point = stepRoomPath({ x: -2, z: -4 }, path, 20);
        expectWalkable(point);
        expect(point.z).toBeGreaterThanOrEqual(-5.525 - 1e-8);
    });
});
