/** A tap tolerates a little finger jitter; once dragging starts it cannot become a tap. */
export function createRoomPointer() {
    let gesture: { id: number; x: number; y: number; startX: number; startY: number; dragging: boolean } | undefined;
    const moved = (x: number, y: number) => !!gesture && Math.hypot(x - gesture.startX, y - gesture.startY) > 8;
    return {
        get pointerId() { return gesture?.id; },
        begin(id: number, x: number, y: number) {
            if (gesture) return;
            gesture = { id, x, y, startX: x, startY: y, dragging: false };
        },
        move(id: number, x: number, y: number) {
            if (!gesture || gesture.id !== id || (!gesture.dragging && !moved(x, y))) return;
            gesture.dragging = true;
            const delta = { x: x - gesture.x, y: y - gesture.y };
            gesture.x = x; gesture.y = y;
            return delta;
        },
        end(id: number, x: number, y: number) {
            if (!gesture || gesture.id !== id) return false;
            const tap = !gesture.dragging && !moved(x, y);
            gesture = undefined;
            return tap;
        },
        cancel() { gesture = undefined; },
    };
}
