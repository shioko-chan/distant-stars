export type BridgeVector = [number, number, number];
export type BridgeMotionPhase = 'preparing' | 'jumping' | 'landing' | 'approaching' | 'complete';

export const BRIDGE_MOTION_DURATION = 4.6;
export const CAT_START_POSITION: Readonly<BridgeVector> = [0, 0, 0.2];
export const CAT_LANDING_POSITION: Readonly<BridgeVector> = [1.65, 1.05, -2.35];
export const CAMERA_START_POSITION: Readonly<BridgeVector> = [0, 2.1, 5.8];
export const CAMERA_END_POSITION: Readonly<BridgeVector> = [2.3, 2.25, -0.75];

const TAKEOFF_TIME = 0.45;
const TOUCHDOWN_TIME = 1.35;
const APPROACH_TIME = 1.6;
const CAMERA_START_TARGET: Readonly<BridgeVector> = [0, 1.6, -4.5];
const CAMERA_END_TARGET: Readonly<BridgeVector> = [2.3, 1.55, -2.65];
const JUMP_YAW = Math.atan2(
    CAT_LANDING_POSITION[0] - CAT_START_POSITION[0],
    CAT_LANDING_POSITION[2] - CAT_START_POSITION[2],
);

export interface BridgeMotionSample {
    catPosition: BridgeVector;
    /** Local +Z points forward; put any model-specific correction on its child node. */
    catYaw: number;
    catPitch: number;
    catScale: BridgeVector;
    cameraPosition: BridgeVector;
    cameraTarget: BridgeVector;
    cameraFov: number;
    phase: BridgeMotionPhase;
    screenBlend: number;
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => {
    const t = clamp(value);
    return t * t * (3 - 2 * t);
};
const mix = (from: number, to: number, t: number) => from + (to - from) * t;
const mixVector = (from: Readonly<BridgeVector>, to: Readonly<BridgeVector>, t: number): BridgeVector => [
    mix(from[0], to[0], t), mix(from[1], to[1], t), mix(from[2], to[2], t),
];

function cameraArc(t: number): BridgeVector {
    // The rightward arc reveals the console before settling in front of its screen.
    const first = mixVector(CAMERA_START_POSITION, [3.6, 2.8, 5.6], t);
    const second = mixVector([3.6, 2.8, 5.6], [4.35, 2.5, 1.2], t);
    const third = mixVector([4.35, 2.5, 1.2], CAMERA_END_POSITION, t);
    return mixVector(mixVector(first, second, t), mixVector(second, third, t), t);
}

/** A deterministic timeline; positions use a cat root whose origin sits at its feet. */
export function sampleBridgeMotion(seconds: number): BridgeMotionSample {
    const time = Math.max(0, Math.min(BRIDGE_MOTION_DURATION, Number.isNaN(seconds) ? 0 : seconds));
    const approach = smooth((time - APPROACH_TIME) / (BRIDGE_MOTION_DURATION - APPROACH_TIME));
    const sample: BridgeMotionSample = {
        catPosition: [...CAT_START_POSITION],
        catYaw: Math.PI,
        catPitch: 0,
        catScale: [1, 1, 1],
        cameraPosition: cameraArc(approach),
        cameraTarget: mixVector(CAMERA_START_TARGET, CAMERA_END_TARGET, approach),
        cameraFov: mix(48, 43, approach),
        phase: 'preparing',
        screenBlend: smooth((time - (BRIDGE_MOTION_DURATION - 0.5)) / 0.5),
    };

    if (time < TAKEOFF_TIME) {
        const progress = time / TAKEOFF_TIME;
        const crouch = smooth(progress);
        sample.catYaw = mix(Math.PI, JUMP_YAW, crouch);
        sample.catPitch = 0.09 * Math.sin(Math.PI * progress);
        sample.catScale = [1 + 0.09 * crouch, 1 - 0.28 * crouch, 1 + 0.09 * crouch];
    } else if (time < TOUCHDOWN_TIME) {
        const progress = (time - TAKEOFF_TIME) / (TOUCHDOWN_TIME - TAKEOFF_TIME);
        const stretch = Math.sin(Math.PI * progress);
        const crouch = 1 - smooth(progress / 0.16);
        sample.phase = 'jumping';
        // Clear the raised front rim before descending onto the inset tabletop.
        sample.catPosition = mixVector(CAT_START_POSITION, CAT_LANDING_POSITION, smooth(progress));
        sample.catPosition[1] = mix(CAT_START_POSITION[1], CAT_LANDING_POSITION[1], progress) + 1.15 * stretch;
        sample.catYaw = JUMP_YAW;
        sample.catPitch = -0.22 * Math.sin(2 * Math.PI * progress);
        sample.catScale = [1 + 0.09 * crouch - 0.035 * stretch,
            1 - 0.28 * crouch + 0.12 * stretch, 1 + 0.09 * crouch - 0.035 * stretch];
    } else {
        sample.catPosition = [...CAT_LANDING_POSITION];
        if (time < APPROACH_TIME) {
            const progress = (time - TOUCHDOWN_TIME) / (APPROACH_TIME - TOUCHDOWN_TIME);
            const compression = Math.sin(Math.PI * progress);
            sample.phase = 'landing';
            sample.catYaw = mix(JUMP_YAW, Math.PI, smooth(progress));
            // Squash around the feet; pitching the root would push the rear paws into the table.
            sample.catScale = [1 + 0.06 * compression, 1 - 0.18 * compression, 1 + 0.06 * compression];
        } else {
            sample.phase = time < BRIDGE_MOTION_DURATION ? 'approaching' : 'complete';
        }
    }

    return sample;
}
