import { ASTRONOMICAL_UNIT_KM, EARTH_BODY, SOLAR_BODIES } from '../../content/solarSystem';
import { HABITAT_ANGULAR_SPEED } from '../habitatFrame';
import { add, cross, dot, scale, sub, unit, type Vec3 } from './math';
import type { NativeObject } from './bridge';
// The observation deck uses the same illustrative J2000 snapshot and circular station orbit as before.
const earthDistance = EARTH_BODY.radiusKm / Math.sin(14.5 * Math.PI / 180);
const earth: Vec3 = [0, 14.9984, -Math.sqrt(earthDistance ** 2 - 14.9984 ** 2)];
const period = 2 * Math.PI * Math.sqrt(earthDistance ** 3 / 398600.4418);
const from = unit([-EARTH_BODY.heliocentricAU[0], -EARTH_BODY.heliocentricAU[2], EARTH_BODY.heliocentricAU[1]]);
const to = unit([Math.sin(20 * Math.PI / 180), Math.tan(13.1 * Math.PI / 180), -Math.cos(20 * Math.PI / 180)]);
const axis = unit(cross(from, to)), angle = Math.acos(dot(from, to));
export function rotate(v: Vec3, axis: Vec3, angle: number) { const c = Math.cos(angle), s = Math.sin(angle); return add(add(scale(v, c), scale(cross(axis, v), s)), scale(axis, dot(axis, v) * (1 - c))); }
function inertial(v: Vec3, seconds: number) { return rotate(rotate(v, [0, 1, 0], -seconds / period * Math.PI * 2), [0, 0, 1], -seconds * HABITAT_ANGULAR_SPEED); }
export function solarScene(seconds: number): NativeObject[] {
    const objects: NativeObject[] = SOLAR_BODIES.map(body => {
        const p = sub(body.heliocentricAU, EARTH_BODY.heliocentricAU);
        const position = add(earth, inertial(rotate(scale([p[0], p[2], -p[1]], ASTRONOMICAL_UNIT_KM), axis, angle), seconds));
        return { id: 'sky:' + body.id, position, radius: body.radiusKm, color: '#ffffff', texture: `/textures/solar/${body.texture}.jpg`, unlit: body.id === 'sun' };
    });
    const phase = .46 + seconds / (27.321661 * 86400) * Math.PI * 2;
    objects.push({ id: 'sky:moon', position: add(earth, inertial(scale(unit([Math.sin(phase), .12 * Math.cos(phase), -Math.cos(phase)]), 384400), seconds)), radius: 1737.4, color: '#ffffff', texture: '/native/moon.png' });
    objects.push({ id: 'sky:background', position: [0, 0, 0], radius: 8e9, color: '#687989', texture: '/native/sky.png', unlit: true });
    return objects;
}
