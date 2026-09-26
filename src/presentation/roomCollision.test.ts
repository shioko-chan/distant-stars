import { expect, it } from 'vitest';
import { moveInRoom, ROOM_OBSTACLES } from './roomCollision';
it('blocks furniture from each direction, even with a large movement', () => {
    for (const b of ROOM_OBSTACLES) {
        const x = (b.x0 + b.x1) / 2, z = (b.z0 + b.z1) / 2;
        expect(moveInRoom({ x, z: b.z1 + .3 }, { x: 0, z: -20 }).z).toBeGreaterThanOrEqual(b.z1 + .25 - 1e-9);
        expect(moveInRoom({ x: b.x0 - .3, z }, { x: 20, z: 0 }).x).toBeLessThanOrEqual(b.x0 - .25 + 1e-9);
    }
});
it('slides along a sofa edge instead of stopping all movement', () => {
    const p = moveInRoom({ x: -2, z: -6.49 + .01 }, { x: .2, z: -.2 });
    expect(p.x).toBeCloseTo(-1.8);
    expect(p.z).toBeCloseTo(-6.49);
});
it('blocks walls and leaves unobstructed movement unchanged', () => {
    expect(moveInRoom({ x: 0, z: 0 }, { x: 1, z: 1 })).toEqual({ x: expect.closeTo(1), z: expect.closeTo(1) });
    expect(moveInRoom({ x: 8, z: 10 }, { x: 5, z: 5 })).toEqual({ x: 8.5, z: 10.8 });
});
