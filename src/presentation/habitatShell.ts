import * as THREE from 'three';
import { HABITAT_AXIAL_MAX, HABITAT_CAP_THICKNESS_M, HABITAT_CAP_Z, HABITAT_GROUND_Y, HABITAT_RADIUS_M } from './habitatFrame';
import { useProceduralSurface, withPatternEdge } from './proceduralSurface';

export const HABITAT_HULL_RADIUS_M = HABITAT_RADIUS_M - HABITAT_GROUND_Y + 40;
/** The near cap's opening around the cantilevered residence, in room metres. */
export const RESIDENCE_CAP_OPENING = { xMin: -9.1, xMax: 9.1, yMin: -.3, yMax: 6.1 } as const;

// The inner face of each cap is a cliff city: facade-scale windows up close, lit blocks and terrace
// promenades from afar, divided by structural ribs that carry beacons.
const CAP_INNER = `
    vec2 p = vPatternUv; float r = length(p), a = atan(p.y, p.x), s = a * r;
    vec2 fine = vec2(s / 3.2, r / 4.2), block = vec2(s / 46.0, r / 34.0);
    float fineDetail = surfaceDetail(fine), blockDetail = surfaceDetail(block);
    float room = step(.6, surfaceHash(floor(fine)));
    float pane = step(.1, fract(fine.x)) * step(.22, fract(fine.y));
    float blockHash = surfaceHash(floor(block) + 3.1);
    float occupancy = mix(.45, smoothstep(.2, .85, blockHash), blockDetail);
    // Up close individual rooms; farther away whole blocks are lit or dark; beyond that a dim average.
    float blockLit = step(.55, blockHash) * (.12 + .3 * surfaceHash(floor(block) + 9.7));
    float windows = mix(mix(.022, blockLit, blockDetail), room * pane * occupancy, fineDetail);
    // Behind the row of towers along the floor, the wall is plain hull: dark plates, sparse service lights.
    float rim = smoothstep(13600.0, 14100.0, r);
    windows *= 1.0 - rim;
    // Thin lines fade to their average coverage, so distance never brightens the wall.
    float ledge = mix(.035, 1.0 - smoothstep(0.0, 1.2, abs(fract(r / 68.0 + .5) - .5) * 68.0), surfaceDetail(vec2(r / 3.4)));
    float promenadeWidth = 9.0 + fwidth(r) * 2.0;
    float promenade = (1.0 - smoothstep(4.0, promenadeWidth, abs(fract(r / 850.0 + .5) - .5) * 850.0)) * 9.0 / promenadeWidth;
    float sector = 6.2831853 / 24.0, ribDistance = abs(fract(a / sector + .5) - .5) * sector * r;
    float rib = 1.0 - smoothstep(16.0, 22.0 + fwidth(s) * 2.0, ribDistance);
    // Dark albedo: the cabin's directional sun would otherwise light a face no sunlight reaches.
    vec3 glass = vec3(.02, .026, .032), concrete = vec3(.09, .1, .11);
    patternColor = mix(mix(concrete, glass, mix(.7, pane, fineDetail)), vec3(.05, .055, .06), max(rib, ledge));
    // Hull plates 24 × 12 m with dark seams and occasional service lamps, fading to their average with distance.
    vec2 plate = vec2(s / 24.0, r / 12.0), plateEdge = abs(fract(plate) - .5);
    float plateDetail = surfaceDetail(plate);
    float seam = mix(.08, smoothstep(.465, .495, max(plateEdge.x * 1.0, plateEdge.y)), plateDetail);
    float serviceLamp = step(.9, surfaceHash(floor(plate) + 5.3)) * (1.0 - smoothstep(.03, .07, length((fract(plate) - vec2(.5, .15)) * vec2(2.0, 1.0))));
    vec3 hullPlate = vec3(.05, .055, .06) * (.7 + .6 * surfaceHash(floor(plate))) * (1.0 - .6 * seam);
    // Self-lit rather than lit: the residence's cabin lights must not tint the hull outside its glass.
    patternColor = mix(patternColor, hullPlate * .15, rim);
    vec3 lamp = mix(vec3(1.0, .72, .42), vec3(.55, .8, 1.0), step(.72, blockHash));
    float hub = 1.0 - smoothstep(900.0, 1300.0, r);
    patternGlow = windows * lamp * (1.0 - rib) * (1.0 - ledge) * 1.05
        + ledge * vec3(.65, .7, .72) * .07 + promenade * vec3(.7, .65, .5) * .15
        + rib * (mix(.015, step(.94, fract(r / 90.0)), surfaceDetail(vec2(r / 5.0))) * vec3(.8, .65, .45) * .4 + vec3(.008, .009, .01))
        + hub * vec3(.9, .95, 1.0) * 1.6;
    patternGlow = mix(patternGlow, hullPlate * .45 + mix(.004, serviceLamp, plateDetail) * vec3(.5, .85, 1.0) * 1.4
        + seam * plateDetail * vec3(.01, .02, .03), rim);
`;
// Hull plating, with running lights along the structural ribs.
const HULL = `
    vec2 p = vPatternUv; float r = length(p), a = atan(p.y, p.x);
    vec2 plate = vec2(a * r, r) / vec2(64.0, 48.0);
    float seam = surfaceDetail(plate) * (1.0 - smoothstep(.0, .04, min(min(fract(plate.x), 1.0 - fract(plate.x)), min(fract(plate.y), 1.0 - fract(plate.y)))));
    float sector = 6.2831853 / 36.0;
    float rib = 1.0 - smoothstep(10.0, 16.0, abs(fract(a / sector + .5) - .5) * sector * r);
    patternColor = vec3(.72 + .2 * surfaceHash(floor(plate))) * (1.0 - .45 * seam) * mix(1.0, .6, rib);
    float blink = step(.6, fract(uTime * .5 + floor(r / 300.0) * .13));
    patternGlow = rib * step(.985, fract(r / 300.0)) * blink * vec3(1.0, .2, .15) * 4.0;
`;

/** Endcaps, the exterior hull and the docking hub. Everything is fixed to the rotating habitat. */
export function createHabitatShell(time: THREE.IUniform<number>) {
    const group = new THREE.Group(); group.name = 'habitat-shell';
    const radius = HABITAT_HULL_RADIUS_M;
    const uniforms = { uTime: time };
    const inner = useProceduralSurface(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0, envMapIntensity: 0 }),
        'habitat-cap-inner-v9', CAP_INNER, uniforms, 'uniform float uTime;');
    const hull = useProceduralSurface(new THREE.MeshStandardMaterial({ color: '#9aa4ad', roughness: .5, metalness: .55, fog: false }),
        'habitat-hull-v1', HULL, uniforms, 'uniform float uTime;');
    const disk = (opening: boolean) => {
        const shape = new THREE.Shape().absarc(0, 0, radius, 0, Math.PI * 2, false);
        if (opening) {
            const { xMin, xMax, yMin, yMax } = RESIDENCE_CAP_OPENING, y = -HABITAT_RADIUS_M;
            shape.holes.push(new THREE.Path().moveTo(xMin, yMin + y).lineTo(xMax, yMin + y).lineTo(xMax, yMax + y).lineTo(xMin, yMax + y).lineTo(xMin, yMin + y));
        }
        return withPatternEdge(new THREE.ShapeGeometry(shape, 256));
    };
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, name: string, z: number, flip: boolean) => {
        const mesh = new THREE.Mesh(geometry, material); mesh.name = name;
        mesh.position.set(0, HABITAT_RADIUS_M, z); if (flip) mesh.rotation.y = Math.PI;
        group.add(mesh); return mesh;
    };
    const nearCap = disk(true);
    add(nearCap, inner, 'near-endcap-inner', HABITAT_CAP_Z, false);
    add(nearCap, hull, 'near-endcap-outer', HABITAT_CAP_Z - HABITAT_CAP_THICKNESS_M, true);
    add(disk(false), inner, 'far-endcap-inner', HABITAT_AXIAL_MAX, true);

    // Hull cylinder, seen only from outside: its uv carries metres around and along the axis.
    const length = HABITAT_AXIAL_MAX - HABITAT_CAP_Z + HABITAT_CAP_THICKNESS_M;
    const cylinder = withPatternEdge(new THREE.CylinderGeometry(radius, radius, length, 256, 1, true));
    const uv = cylinder.getAttribute('uv'), position = cylinder.getAttribute('position');
    for (let i = 0; i < uv.count; i++) {
        const angle = Math.atan2(position.getZ(i), position.getX(i));
        uv.setXY(i, Math.cos(angle) * (radius + position.getY(i) + length), Math.sin(angle) * (radius + position.getY(i) + length));
    }
    const shell = new THREE.Mesh(cylinder, hull); shell.name = 'habitat-hull';
    shell.rotation.x = Math.PI / 2; shell.position.set(0, HABITAT_RADIUS_M, HABITAT_CAP_Z - HABITAT_CAP_THICKNESS_M + length / 2);
    group.add(shell);

    // Docking spindle on the axis and radial trusses across the Earth-facing cap.
    const metal = new THREE.MeshStandardMaterial({ color: '#7d8791', roughness: .45, metalness: .7, fog: false });
    const outside = HABITAT_CAP_Z - HABITAT_CAP_THICKNESS_M;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(700, 1100, 1800, 64), metal); hub.name = 'docking-spindle';
    hub.rotation.x = -Math.PI / 2; hub.position.set(0, HABITAT_RADIUS_M, outside - 900); group.add(hub);
    const dock = new THREE.Mesh(new THREE.TorusGeometry(1500, 70, 12, 128), metal); dock.name = 'docking-ring';
    dock.position.set(0, HABITAT_RADIUS_M, outside - 1400); group.add(dock);
    const beacon = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff4a3a').multiplyScalar(4), fog: false });
    const beaconGeometry = new THREE.SphereGeometry(1, 8, 6);
    for (let spoke = 0; spoke < 6; spoke++) {
        // Offset by 30° so no truss runs through the residence directly below the axis.
        const angle = -Math.PI / 2 + Math.PI / 6 + spoke * Math.PI / 3, span = radius - 1100 - 150;
        const truss = new THREE.Mesh(new THREE.BoxGeometry(span, 90, 70), metal); truss.name = 'cap-truss';
        const centre = 1100 + span / 2;
        truss.position.set(Math.cos(angle) * centre, HABITAT_RADIUS_M + Math.sin(angle) * centre, outside - 35);
        truss.rotation.z = angle; group.add(truss);
        for (let r = 1500; r < radius; r += 1400) {
            const light = new THREE.Mesh(beaconGeometry, beacon); light.scale.setScalar(9);
            light.position.set(Math.cos(angle) * r, HABITAT_RADIUS_M + Math.sin(angle) * r, outside - 80); group.add(light);
        }
    }
    return {
        group,
        update(seconds: number) {
            // Anti-collision beacons flash together, as a single slow strobe.
            beacon.color.set('#ff4a3a').multiplyScalar(seconds % 2 < .25 ? 6 : .15);
        },
    };
}
