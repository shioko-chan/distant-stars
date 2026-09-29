import { terrainElevation } from '../../simulation/terrain';
export type Vec3 = [
    number,
    number,
    number
];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = (a: Vec3) => Math.hypot(...a);
export const unit = (a: Vec3): Vec3 => scale(a, 1 / (length(a) || 1));
export const mix = (a: Vec3, b: Vec3, t: number) => add(scale(a, 1 - t), scale(b, t));
export const surfacePosition = (n: Vec3, lift = 0, planetId = '') => scale(n, 1.8 + terrainElevation(n, planetId) + lift);
export interface Camera {
    position: Vec3;
    target: Vec3;
    fov: number;
}
function basis(camera: Camera) {
    const forward = unit(sub(camera.target, camera.position));
    const right = unit(cross(forward, Math.abs(forward[1]) > .9999999999 ? [0, 0, 1] : [0, 1, 0]));
    return { forward, right, up: cross(right, forward) };
}
export function project(point: Vec3, camera: Camera, width: number, height: number) {
    const { forward, right, up } = basis(camera), delta = sub(point, camera.position), depth = dot(delta, forward);
    const focal = height / (2 * Math.tan(camera.fov * Math.PI / 360));
    return { x: width / 2 + dot(delta, right) * focal / depth, y: height / 2 - dot(delta, up) * focal / depth, visible: depth > 0 };
}
export function ray(x: number, y: number, camera: Camera, width: number, height: number) {
    const { forward, right, up } = basis(camera), t = Math.tan(camera.fov * Math.PI / 360);
    return unit(add(forward, add(scale(right, (2 * x - width) / height * t), scale(up, (height - 2 * y) / height * t))));
}
export function sphereHit(origin: Vec3, direction: Vec3, radius: number, center: Vec3 = [0, 0, 0]) {
    const delta = sub(origin, center), b = dot(delta, direction), c = dot(delta, delta) - radius * radius, d = b * b - c;
    if (d < 0)
        return;
    const near = -b - Math.sqrt(d), far = -b + Math.sqrt(d), distance = near >= 0 ? near : far;
    return distance >= 0 ? add(origin, scale(direction, distance)) : undefined;
}
export function pickSurface(origin: Vec3, direction: Vec3, planetId: string) {
    // Bracket the terrain within its known elevation envelope, then intersect the same height field as simulation.
    const enter = length(origin) <= 1.86 ? origin : sphereHit(origin, direction, 1.86);
    if (!enter)
        return;
    const start = Math.max(0, dot(sub(enter, origin), direction));
    const center = -dot(origin, direction), end = Math.max(start, center);
    const signed = (t: number) => { const p = add(origin, scale(direction, t)); return length(p) - length(surfacePosition(unit(p), 0, planetId)); };
    let previous = start, previousHeight = signed(start);
    for (let i = 1; i <= 96; i++) {
        const t = start + (end - start) * i / 96, h = signed(t);
        if (previousHeight >= 0 && h <= 0) {
            let lo = previous, hi = t;
            for (let j = 0; j < 28; j++) {
                const mid = (lo + hi) / 2;
                if (signed(mid) > 0)
                    lo = mid;
                else
                    hi = mid;
            }
            return unit(add(origin, scale(direction, (lo + hi) / 2)));
        }
        previous = t;
        previousHeight = h;
    }
}
