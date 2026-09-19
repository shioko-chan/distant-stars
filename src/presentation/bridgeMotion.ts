export type BridgeVector = [number, number, number];
export type BridgeMotionPhase = 'approaching' | 'seating' | 'companion' | 'complete';
export const BRIDGE_MOTION_DURATION = 5.3;
export const LOUNGE_Z = -5.5;
export const CAT_START_POSITION: Readonly<BridgeVector> = [0, 0, LOUNGE_Z + .2];
export const CAT_LANDING_POSITION: Readonly<BridgeVector> = [.68, .75, LOUNGE_Z - 1.15];
export const CAMERA_START_POSITION: Readonly<BridgeVector> = [0, 1.6, LOUNGE_Z + 3.4];
export const CAMERA_END_POSITION: Readonly<BridgeVector> = [1.1, 1.12, LOUNGE_Z - .15];
const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const vector = (a: Readonly<BridgeVector>, b: Readonly<BridgeVector>, t: number): BridgeVector => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

/** Walk up to the chair, sit, then reveal the companion on the desk. */
export function sampleBridgeMotion(seconds: number) {
    const time = Math.max(0, Math.min(BRIDGE_MOTION_DURATION, Number.isNaN(seconds) ? 0 : seconds));
    const approach = smooth(time / 2.4);
    const seating = smooth((time - 2.4) / .9);
    const cameraPosition = vector(CAMERA_START_POSITION, [1.1, 1.6, LOUNGE_Z + .25], approach);
    cameraPosition[1] = mix(1.6, CAMERA_END_POSITION[1], seating);
    cameraPosition[2] = mix(cameraPosition[2], CAMERA_END_POSITION[2], seating);
    const phase: BridgeMotionPhase = time < 2.4 ? 'approaching' : time < 3.3 ? 'seating' : time < BRIDGE_MOTION_DURATION ? 'companion' : 'complete';
    return {
        cameraPosition,
        cameraTarget: vector([0, 1.1, LOUNGE_Z - 3], [.95, .98, LOUNGE_Z - 1.2], smooth(time / 3.3)),
        cameraFov: mix(48, 52, smooth(time / 3.3)),
        catPosition: [...CAT_LANDING_POSITION] as BridgeVector,
        catVisible: time >= 3.45,
        catYaw: .45,
        phase,
        screenBlend: smooth((time - 4.8) / .5),
    };
}
