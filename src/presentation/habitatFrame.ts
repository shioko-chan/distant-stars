import { Quaternion, Vector3 } from 'three';

/** Room metres in the co-rotating habitat: the rotation axis passes through (0, R, 0). */
export const HABITAT_RADIUS_M = 15_000;
export const HABITAT_GROUND_Y = -240;
export const HABITAT_HALF_WIDTH_M = 12_000;
/** Inner face of the Earth-facing endcap; the residence cantilevers through it into space. */
export const HABITAT_CAP_Z = -3.5;
export const HABITAT_CAP_THICKNESS_M = .8;
export const HABITAT_AXIAL_MIN = HABITAT_CAP_Z;
export const HABITAT_AXIAL_MAX = HABITAT_CAP_Z + HABITAT_HALF_WIDTH_M * 2;
export const HABITAT_AXIAL_CENTER = (HABITAT_AXIAL_MIN + HABITAT_AXIAL_MAX) / 2;
export const HABITAT_GRAVITY = 9.80665;
export const HABITAT_ANGULAR_SPEED = Math.sqrt(HABITAT_GRAVITY / HABITAT_RADIUS_M);
export const HABITAT_ROTATION_PERIOD = 2 * Math.PI / HABITAT_ANGULAR_SPEED;
export const HABITAT_RPM = HABITAT_ANGULAR_SPEED * 60 / (2 * Math.PI);
const rotationAxis = new Vector3(0, 0, 1);

/** Arc length follows the room-floor circumference; positive height points toward the axis. */
export function habitatPoint(arc: number, height: number, axial: number, target = new Vector3()): Vector3 {
    const theta = arc / HABITAT_RADIUS_M;
    const radius = HABITAT_RADIUS_M - height;
    return target.set(radius * Math.sin(theta), HABITAT_RADIUS_M - radius * Math.cos(theta), axial);
}

/** Local +Y is the inward surface normal and +X follows increasing arc length. */
export function habitatOrientation(arc: number, target = new Quaternion()): Quaternion {
    return target.setFromAxisAngle(rotationAxis, arc / HABITAT_RADIUS_M);
}
