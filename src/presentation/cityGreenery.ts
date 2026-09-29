import * as THREE from 'three';
import { mulberry32 } from '../simulation/rng';
import { blobRadius, CITY_LAND_ZONES, landUseAt, wrapArc, type LandUse, type LandZone } from './cityLandUse';
import { HABITAT_GROUND_Y, HABITAT_RADIUS_M, habitatOrientation, habitatPoint } from './habitatFrame';
import { useProceduralSurface } from './proceduralSurface';

const PARK = `
    vec2 p = vPatternUv;
    float n = surfaceNoise(p / 38.0) * .6 + surfaceNoise(p / 9.0) * .4;
    float canopy = smoothstep(.42, .68, surfaceNoise(p / 26.0 + 7.0));
    patternColor = mix(mix(vec3(.2, .42, .16), vec3(.34, .54, .2), n), mix(vec3(.06, .19, .08), vec3(.12, .3, .12), n), canopy);
    vec2 q = p / 170.0 + vec2(surfaceNoise(p / 310.0), surfaceNoise(p / 310.0 + 3.0)) * .9;
    vec2 g = abs(fract(q) - .5) * 170.0;
    float d = min(g.x, g.y), w = max(2.5, fwidth(d) * 1.5);
    float path = (1.0 - smoothstep(w * .5, w, d)) * 2.5 / w;
    patternColor = mix(patternColor, vec3(.66, .63, .56), path);
    patternGlow = path * vec3(1.0, .78, .48) * .45 + patternColor * .1;
`;
const LAKE = `
    vec2 p = vPatternUv;
    float ripple = surfaceNoise(p / 14.0 + vec2(uTime * .05, 0.0)) * surfaceNoise(p / 5.0 - vec2(0.0, uTime * .08));
    float sparkle = mix(.07, smoothstep(.3, .55, ripple), surfaceDetail(p / 5.0));
    float shore = smoothstep(.93, .985, vPatternEdge);
    patternColor = mix(vec3(.02, .09, .13), vec3(.05, .25, .28), smoothstep(.55, 1.0, vPatternEdge));
    patternGlow = sparkle * vec3(.3, .6, .85) * .55 + shore * vec3(1.0, .8, .52) * 1.3 + patternColor * .5;
`;
const FARM = `
    vec2 p = vPatternUv;
    vec2 field = p / vec2(320.0, 190.0), f = fract(field);
    float h = surfaceHash(floor(field));
    float border = 1.0 - smoothstep(0.0, .03, min(min(f.x, 1.0 - f.x) * 1.6, min(f.y, 1.0 - f.y)));
    float along = h > .5 ? p.x : p.y;
    float rows = mix(.5, .5 + .5 * sin(along * 2.1), surfaceDetail(vec2(along / 3.0)));
    // Mostly greens and ripening gold with gentle variation; a few hydroponic fields under grow lights.
    vec3 crop = h < .35 ? vec3(.24, .44, .15) : h < .55 ? vec3(.46, .45, .2) : h < .92 ? vec3(.18, .36, .14) : vec3(.26, .2, .3);
    crop *= .85 + .3 * surfaceNoise(p / 90.0);
    patternColor = crop * (.72 + .28 * rows) * (1.0 - .55 * border);
    float hydroponic = step(.92, h);
    patternGlow = hydroponic * vec3(.8, .3, .7) * (.18 + .12 * rows) + crop * .08 + border * vec3(.35, .75, 1.0) * .12;
`;
// Stacked hydroponic floors behind glass, lit by magenta grow lamps.
const VERTICAL_FARM = `
    float floorLine = fract((vPatternPosition.y + .5) * 22.0);
    float wall = 1.0 - step(.5, abs(vNormal.y));
    patternColor = vec3(.55, .7, .75);
    patternGlow = wall * (step(.25, floorLine) * vec3(.95, .25, .8) * 1.7 + (1.0 - step(.25, floorLine)) * vec3(.1, .6, .25) * .6);
`;
const LIFT: Record<LandUse, number> = { farm: .6, park: 1, lake: 1.5 };

interface ZoneMesh { positions: number[]; uvs: number[]; edges: number[]; indices: number[] }

/** A curved grid lying on the habitat floor; `sample` maps grid coordinates to arc/axial and edge distance. */
function zoneGeometry(columns: number, rows: number, lift: number, origin: THREE.Vector3,
    sample: (u: number, v: number) => [arc: number, axial: number, edge: number]) {
    const mesh: ZoneMesh = { positions: [], uvs: [], edges: [], indices: [] }, point = new THREE.Vector3();
    for (let v = 0; v <= rows; v++) for (let u = 0; u <= columns; u++) {
        const [arc, axial, edge] = sample(u / columns, v / rows);
        habitatPoint(arc, HABITAT_GROUND_Y + lift, axial, point).sub(origin);
        mesh.positions.push(point.x, point.y, point.z); mesh.uvs.push(arc, axial); mesh.edges.push(edge);
    }
    for (let v = 0; v < rows; v++) for (let u = 0; u < columns; u++) {
        const a = v * (columns + 1) + u, b = a + 1, c = a + columns + 1, d = c + 1;
        mesh.indices.push(a, c, b, b, c, d);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(mesh.uvs, 2));
    geometry.setAttribute('patternEdge', new THREE.Float32BufferAttribute(mesh.edges, 1));
    geometry.setIndex(mesh.indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
    return geometry;
}

function zoneMesh(zone: LandZone) {
    const lift = LIFT[zone.kind];
    if (zone.shape === 'blob') {
        const origin = habitatPoint(zone.arc, HABITAT_GROUND_Y, zone.axial);
        return { origin, geometry: zoneGeometry(96, 14, lift, origin, (u, v) => {
            const angle = u * Math.PI * 2, radius = v * blobRadius(zone, angle);
            return [zone.arc + Math.cos(angle) * radius * zone.radiusArc, zone.axial + Math.sin(angle) * radius * zone.radiusAxial, v];
        }) };
    }
    if (zone.shape === 'band') {
        const origin = new THREE.Vector3(0, HABITAT_RADIUS_M, (zone.axialMin + zone.axialMax) / 2);
        return { origin, geometry: zoneGeometry(640, 2, lift, origin, (u, v) =>
            [(u - .5) * Math.PI * 2 * HABITAT_RADIUS_M, zone.axialMin + (zone.axialMax - zone.axialMin) * v, Math.abs(v * 2 - 1)]) };
    }
    const centre = (zone.arcMin + zone.arcMax) / 2, origin = habitatPoint(centre, HABITAT_GROUND_Y, (zone.axialMin + zone.axialMax) / 2);
    return { origin, geometry: zoneGeometry(24, 6, lift, origin, (u, v) =>
        [zone.arcMin + (zone.arcMax - zone.arcMin) * u, zone.axialMin + (zone.axialMax - zone.axialMin) * v, Math.max(Math.abs(u * 2 - 1), Math.abs(v * 2 - 1))]) };
}

/** Parks, lakes and farmland. Trees are instanced only near the residence; farther parks rely on canopy texture. */
export function createCityGreenery(time: THREE.IUniform<number>) {
    const group = new THREE.Group(); group.name = 'city-greenery';
    const uniforms = { uTime: time }, declarations = 'uniform float uTime;';
    const materials: Record<LandUse, THREE.MeshStandardMaterial> = {
        park: useProceduralSurface(new THREE.MeshStandardMaterial({ roughness: .95 }), 'city-park-v1', PARK, uniforms, declarations),
        lake: useProceduralSurface(new THREE.MeshStandardMaterial({ roughness: .12, metalness: .2, envMapIntensity: .4 }), 'city-lake-v1', LAKE, uniforms, declarations),
        farm: useProceduralSurface(new THREE.MeshStandardMaterial({ roughness: .9 }), 'city-farm-v2', FARM, uniforms, declarations),
    };
    for (const zone of CITY_LAND_ZONES) {
        const { origin, geometry } = zoneMesh(zone);
        const mesh = new THREE.Mesh(geometry, materials[zone.kind]); mesh.name = `${zone.kind}-${zone.shape}`;
        mesh.position.copy(origin); group.add(mesh);
    }

    const transform = new THREE.Object3D(), yaw = new THREE.Quaternion(), color = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
    const place = (mesh: THREE.InstancedMesh, index: number, arc: number, height: number, axial: number, scale: THREE.Vector3Tuple, rotation: number) => {
        habitatPoint(arc, height, axial, transform.position);
        habitatOrientation(arc, transform.quaternion).multiply(yaw.setFromAxisAngle(up, rotation));
        transform.scale.fromArray(scale); transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix);
    };

    // Clumped woodland with open meadows; a few blossom trees in pink.
    const trees: { arc: number; axial: number; size: number; blossom: boolean }[] = [];
    const random = mulberry32(44021), spacing = 21;
    for (const zone of CITY_LAND_ZONES) {
        if (zone.kind !== 'park' || zone.shape !== 'blob' || Math.hypot(zone.arc, zone.axial) > 8000) continue;
        const extentArc = zone.radiusArc * 1.15, extentAxial = zone.radiusAxial * 1.15;
        for (let x = -extentArc; x < extentArc; x += spacing) for (let z = -extentAxial; z < extentAxial; z += spacing) {
            const arc = zone.arc + x + (random() - .5) * spacing * .8, axial = zone.axial + z + (random() - .5) * spacing * .8;
            const grove = mulberry32(Math.floor(arc / 140) * 7919 ^ Math.floor(axial / 140) * 104729)();
            if (random() > grove * 1.3 || landUseAt(arc, axial) !== 'park') continue;
            trees.push({ arc, axial, size: 5 + random() * 5, blossom: random() > .88 });
        }
    }
    const foliage = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .9, flatShading: true }), Math.max(1, trees.length));
    foliage.name = 'park-trees'; foliage.count = trees.length;
    trees.forEach((tree, i) => {
        place(foliage, i, tree.arc, HABITAT_GROUND_Y + tree.size * .9 + 1, tree.axial, [tree.size, tree.size * 1.25, tree.size], random() * 6);
        foliage.setColorAt(i, tree.blossom ? color.setRGB(.95, .55, .7) : color.setRGB(.13 + random() * .1, .3 + random() * .16, .12));
    });
    group.add(foliage);

    // Glass vertical farms stand on the farmland.
    const farmMaterial = useProceduralSurface(new THREE.MeshStandardMaterial({ roughness: .3, metalness: .3 }), 'vertical-farm-v1', VERTICAL_FARM);
    const towers: { arc: number; axial: number; height: number; width: number }[] = [];
    for (const zone of CITY_LAND_ZONES) {
        if (zone.kind !== 'farm') continue;
        const count = zone.shape === 'band' ? 60 : 8;
        for (let i = 0; i < count; i++) {
            const arc = zone.shape === 'band' ? (i + random() * .6) / count * Math.PI * 2 * HABITAT_RADIUS_M
                : zone.shape === 'rect' ? zone.arcMin + (zone.arcMax - zone.arcMin) * random() : zone.arc;
            const axialMin = zone.shape === 'blob' ? zone.axial : zone.axialMin, axialMax = zone.shape === 'blob' ? zone.axial : zone.axialMax;
            const axial = axialMin + (axialMax - axialMin) * (.15 + random() * .7);
            towers.push({ arc: wrapArc(arc), axial, height: 70 + random() * 110, width: 26 + random() * 20 });
        }
    }
    const farms = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), farmMaterial, towers.length); farms.name = 'vertical-farms';
    towers.forEach((tower, i) => place(farms, i, tower.arc, HABITAT_GROUND_Y + tower.height / 2, tower.axial, [tower.width, tower.height, tower.width], random()));
    group.add(farms);
    for (const mesh of [foliage, farms]) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); }
    group.userData.treeCount = trees.length;
    return group;
}
