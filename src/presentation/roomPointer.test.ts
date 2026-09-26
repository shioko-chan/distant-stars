import { describe, expect, it } from 'vitest';
import { createRoomPointer } from './roomPointer';

describe('room tap and look gestures', () => {
    it('accepts a jittery tap without rotating the camera', () => {
        const pointer = createRoomPointer();
        pointer.begin(7, 100, 100);
        expect(pointer.move(7, 104, 103)).toBeUndefined();
        expect(pointer.end(7, 104, 103)).toBe(true);
        expect(pointer.pointerId).toBeUndefined();
    });
    it('keeps a drag a drag even after returning to its starting point', () => {
        const pointer = createRoomPointer();
        pointer.begin(2, 100, 100);
        expect(pointer.move(2, 104, 103)).toBeUndefined();
        expect(pointer.move(2, 120, 105)).toEqual({ x: 20, y: 5 });
        expect(pointer.move(2, 100, 100)).toEqual({ x: -20, y: -5 });
        expect(pointer.end(2, 100, 100)).toBe(false);
    });
    it('rejects a displaced release even when no move event was delivered', () => {
        const pointer = createRoomPointer();
        pointer.begin(2, 100, 100);
        expect(pointer.end(2, 120, 100)).toBe(false);
    });
    it('ignores unrelated pointers and never walks after cancellation', () => {
        const pointer = createRoomPointer();
        pointer.begin(2, 100, 100);
        pointer.begin(3, 200, 200);
        expect(pointer.move(3, 250, 200)).toBeUndefined();
        expect(pointer.end(3, 200, 200)).toBe(false);
        expect(pointer.pointerId).toBe(2);
        pointer.cancel();
        expect(pointer.end(2, 100, 100)).toBe(false);
        pointer.begin(4, 200, 200);
        expect(pointer.end(4, 200, 200)).toBe(true);
    });
});
