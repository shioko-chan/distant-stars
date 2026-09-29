import * as THREE from 'three';
import { mulberry32 } from '../simulation/rng';
import { createCityMaterials, WINDOW_BAY, FLOOR_HEIGHT } from './cityMaterials';
import { createCityLayout, createCitySectors, CITY_LOCAL_BOUNDS, type CityBuilding as Building } from './cityLayout';
import { buildingMasses } from './cityMassing';
import { HABITAT_RADIUS_M, HABITAT_GROUND_Y, HABITAT_HALF_WIDTH_M, HABITAT_AXIAL_MIN, habitatPoint, habitatOrientation } from './habitatFrame';
import { advertGeometry, ADVERT_HORIZONTAL_COUNT, ADVERT_VERTICAL_COUNT, createAdvertMaterial, NEON_COLORS } from './cityNeon';
import { createCityTransit, planSkybridges, type Skybridge } from './cityTransit';
import { createCityGreenery } from './cityGreenery';
import { createHabitatShell } from './habitatShell';
import { createNeoCity } from './neoCity';

type Triple = [number, number, number];
interface CityPart { position: Triple; scale: Triple; yaw: number; shade: number; tint?: Triple; advert?: { index: number; vertical: boolean } }
/** 0: close detail, 1: nearby sectors, 2: silhouettes at medium distance. */
type TowerLevel = 0 | 1 | 2;

const SECTOR_COUNT = 32;
const AXIAL_SECTOR_COUNT = 10;
/** Massing chunks group 4 × 5 sectors: few draw calls for the whole ring, still culled by view. */
const CHUNK_ARC_SECTORS = 4, CHUNK_AXIAL_SECTORS = 5;
const URBAN_TILE_METRES = 8192;
export const CITY_NEAR_LOD_METRES = 6000;
const localUp = new THREE.Vector3(0, 1, 0);

/**
 * Roof footprints, courts and streets for distant sectors, as a night city seen from across the habitat:
 * lamp light pools softly in the streets, brightness varies by district, and roofs carry scattered lights.
 */
function createUrbanTextures() {
    const size = 1024, count = size * size;
    const color = new Uint8Array(count * 4), glow = new Float32Array(count * 3);
    const random = mulberry32(391174);
    // A smooth, wrapping field of district brightness: some quarters blaze, others are quiet.
    const coarse = 12, field = Array.from({ length: coarse * coarse }, () => random());
    const district = (x: number, y: number) => {
        const fx = x / size * coarse, fy = y / size * coarse, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
        const at = (i: number, j: number) => field[((j % coarse) * coarse + (i % coarse))];
        const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        return (at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx) * (1 - sy) + (at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx) * sy;
    };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const i = y * size + x, v = random() * 6, lamp = (.2 + 1.3 * district(x, y) ** 2) * (random() > .55 ? 1 : .35);
        color.set([17 + v, 20 + v, 25 + v, 255], i * 4);
        glow.set([24 * lamp, 16 * lamp, 8 * lamp], i * 3);
    }
    // Reuse the parcel grammar at atlas scale: uneven blocks, courts and broad streets. Rail corridors and
    // parks are left out, because this tile repeats across the ring and would repeat them in long stripes.
    const districts = createCityLayout({ arcMin: 0, arcMax: URBAN_TILE_METRES, axialMin: 0, axialMax: URBAN_TILE_METRES }, { density: 'near', reserveLand: false });
    const paint = (cx: number, cy: number, w: number, h: number, yaw: number, rgb: Triple, light: (x: number, y: number) => Triple) => {
        const c = Math.cos(yaw), s = Math.sin(yaw);
        const radius = Math.ceil(Math.hypot(w, h) / 2);
        for (let y = Math.max(0, Math.floor(cy - radius)); y < Math.min(size, cy + radius); y++)
            for (let x = Math.max(0, Math.floor(cx - radius)); x < Math.min(size, cx + radius); x++) {
                const dx = x - cx, dy = y - cy;
                if (Math.abs(c * dx - s * dy) > w / 2 || Math.abs(s * dx + c * dy) > h / 2) continue;
                const i = y * size + x;
                color.set(rgb, i * 4); glow.set(light(x, y), i * 3);
            }
    };
    const roofs: Triple[] = [[62, 68, 74], [50, 60, 72], [70, 66, 60], [44, 56, 60], [58, 58, 66]];
    for (const building of districts) {
        const c = Math.cos(building.yaw), s = Math.sin(building.yaw), scale = size / URBAN_TILE_METRES;
        const rng = mulberry32(building.seed);
        const tone = roofs[building.seed % roofs.length], shade = .75 + rng() * .5;
        const roof: Triple = [tone[0] * shade, tone[1] * shade, tone[2] * shade];
        const neon = NEON_COLORS[building.seed % NEON_COLORS.length], neonRoof = rng() > .93, busy = rng();
        for (const mass of buildingMasses(building)) {
            const x = (building.arc + c * mass.x + s * mass.z) * scale;
            const y = (building.axial - s * mass.x + c * mass.z) * scale;
            const w = mass.width * scale, h = mass.depth * scale;
            paint(x + 2, y + 2, w, h, building.yaw, [11, 14, 18], () => [0, 0, 0]);
            paint(x, y, w, h, building.yaw, roof, () => [1, 1.5, 2]);
            // Skylights and rooftop lamps, warm or cool; a few roofs are washed in neon.
            paint(x, y, Math.max(1, w - 2), Math.max(1, h - 2), building.yaw, [roof[0] * .78, roof[1] * .8, roof[2] * .82], () => {
                if (neonRoof) return [neon[0] * 38, neon[1] * 38, neon[2] * 38];
                const r = random();
                return r > .9 - busy * .12 ? [40, 30, 18] : r > .84 - busy * .1 ? [22, 32, 42] : [1.5, 2, 2.5];
            });
        }
    }
    // Soften the light into halos, so streets read as pooled lamplight rather than crisp traces.
    const blurred = new Float32Array(glow), scratch = new Float32Array(count * 3), radius = 3;
    for (const [from, to, horizontal] of [[glow, scratch, true], [scratch, blurred, false]] as const)
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) for (let k = 0; k < 3; k++) {
            let sum = 0;
            for (let d = -radius; d <= radius; d++) {
                const sx = horizontal ? (x + d + size) % size : x, sy = horizontal ? y : (y + d + size) % size;
                sum += from[(sy * size + sx) * 3 + k];
            }
            to[(y * size + x) * 3 + k] = sum / (radius * 2 + 1);
        }
    const light = new Uint8Array(count * 4);
    for (let i = 0; i < count; i++) for (let k = 0; k < 4; k++)
        light[i * 4 + k] = k === 3 ? 255 : Math.min(255, glow[i * 3 + k] * .45 + blurred[i * 3 + k] * 1.1);
    const texture = (data: Uint8Array) => {
        const value = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
        value.colorSpace = THREE.SRGBColorSpace;
        value.wrapS = value.wrapT = THREE.RepeatWrapping;
        value.minFilter = THREE.LinearMipmapLinearFilter;
        value.magFilter = THREE.LinearFilter;
        value.generateMipmaps = true; value.anisotropy = 8; value.needsUpdate = true;
        return value;
    };
    return { albedo: texture(color), emission: texture(light) };
}

/** Curved inward-facing ground for one sector: streets and courts between its buildings. */
function createSectorSurface(arcMin: number, arcMax: number, axialMin: number, axialMax: number, origin: THREE.Vector3, arcSteps = 12) {
    const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
    const point = new THREE.Vector3();
    const axialSteps = 2;
    for (let z = 0; z <= axialSteps; z++) for (let x = 0; x <= arcSteps; x++) {
        const arc = THREE.MathUtils.lerp(arcMin, arcMax, x / arcSteps);
        const axial = THREE.MathUtils.lerp(axialMin, axialMax, z / axialSteps);
        habitatPoint(arc, HABITAT_GROUND_Y, axial, point).sub(origin);
        positions.push(point.x, point.y, point.z);
        const theta = arc / HABITAT_RADIUS_M;
        normals.push(-Math.sin(theta), Math.cos(theta), 0);
        uvs.push(arc / URBAN_TILE_METRES, axial / URBAN_TILE_METRES);
    }
    for (let z = 0; z < axialSteps; z++) for (let x = 0; x < arcSteps; x++) {
        const a = z * (arcSteps + 1) + x, b = a + 1, c = a + arcSteps + 1, d = c + 1;
        indices.push(a, c, b, b, c, d);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeBoundingSphere();
    return geometry;
}

/** The city is fixed to the rotating habitat; only traffic moves in its co-rotating frame. */
export function createOrbitalCity(loader: Pick<THREE.TextureLoader, 'loadAsync'>, ownedTextures: Set<THREE.Texture>, isDisposed: () => boolean, loadModels: () => Promise<THREE.Group>) {
    const group = new THREE.Group(); group.name = 'orbital-metropolis';
    const time = { value: 0 };
    const { facade, structure, ready: materialsReady } = createCityMaterials(loader, ownedTextures, isDisposed);
    const urbanTextures = createUrbanTextures();
    const dark = new THREE.MeshStandardMaterial({ color: '#1a2c37', roughness: .72, metalness: .24 });
    const glass = new THREE.MeshStandardMaterial({ color: '#577986', roughness: .28, metalness: .46 });
    const greenhouse = new THREE.MeshStandardMaterial({ color: '#acc9d4', roughness: .34, metalness: .15, transparent: true, opacity: .18, depthWrite: false });
    const garden = new THREE.MeshStandardMaterial({ color: '#35564b', roughness: .94 });
    const surface = new THREE.MeshStandardMaterial({ color: '#566772', map: urbanTextures.albedo, emissive: '#ffffff', emissiveMap: urbanTextures.emission, emissiveIntensity: 1.2, roughness: 1, metalness: 0 });
    const box = new THREE.BoxGeometry(1, 1, 1); box.clearGroups();
    // Facades stand on the ground, so their bottom face is never seen: five faces are enough.
    const facadeBox = new THREE.BoxGeometry(1, 1, 1);
    const bottom = facadeBox.groups[3];
    facadeBox.setIndex([...facadeBox.getIndex()!.array].filter((_, i) => i < bottom.start || i >= bottom.start + bottom.count));
    facadeBox.clearGroups();
    const foliage = new THREE.IcosahedronGeometry(1, 1);
    const neon = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const skybridge = new THREE.MeshStandardMaterial({ color: '#a9cfdf', emissive: '#63716f', emissiveIntensity: .45, roughness: .2, metalness: .6 });
    const advert = createAdvertMaterial(time, ownedTextures);
    const materials = { facade, structure, dark, parapet: glass, greenhouse, garden, foliage: garden, neon, skybridge, advert };
    type Kind = keyof typeof materials;
    type Parts = Record<Kind, CityPart[]>;
    const emptyParts = (): Parts => ({ facade: [], structure: [], dark: [], parapet: [], greenhouse: [], garden: [], foliage: [], neon: [], skybridge: [], advert: [] });
    const transform = new THREE.Object3D(), orientation = new THREE.Quaternion(), yaw = new THREE.Quaternion(), color = new THREE.Color();
    const point = new THREE.Vector3();
    let instanceCount = 0;
    const batch = (parent: THREE.Group, name: string, geometry: THREE.BufferGeometry, material: THREE.Material, parts: CityPart[], origin: THREE.Vector3) => {
        if (!parts.length) return;
        const mesh = new THREE.InstancedMesh(geometry, material, parts.length); mesh.name = name;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            habitatPoint(part.position[0], part.position[1], part.position[2], point).sub(origin);
            transform.position.copy(point); transform.scale.fromArray(part.scale);
            habitatOrientation(part.position[0], orientation);
            yaw.setFromAxisAngle(localUp, part.yaw); transform.quaternion.copy(orientation).multiply(yaw); transform.updateMatrix();
            mesh.setMatrixAt(i, transform.matrix);
            if (part.tint) color.setRGB(...part.tint).multiplyScalar(part.shade); else color.setScalar(part.shade);
            mesh.setColorAt(i, color);
        }
        mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); parent.add(mesh); instanceCount += parts.length;
        return mesh;
    };
    const buildParts = (parts: Parts, origin = new THREE.Vector3()) => {
        const result = new THREE.Group();
        for (const kind of Object.keys(parts) as Kind[]) {
            const geometry = kind === 'foliage' ? foliage : kind === 'advert' ? advertGeometry(parts.advert.map(part => part.advert!)) : kind === 'facade' ? facadeBox : box;
            batch(result, kind, geometry, materials[kind], parts[kind], origin);
        }
        return result;
    };
    const add = (parts: Parts, kind: Kind, position: Triple, scale: Triple, rotation = 0, shade = 1, tint?: Triple) => {
        const part: CityPart = { position, scale, yaw: rotation, shade, tint };
        parts[kind].push(part); return part;
    };
    // Mostly cool glass, with a few warm stone and bronze towers among them.
    const palettes: Triple[] = [[.94, .97, 1], [.62, .8, 1.05], [.69, .84, .9], [.55, .92, .95], [1, .83, .64], [.8, .78, 1], [.93, .89, .81]];
    const tower = (parts: Parts, b: Building, level: TowerLevel) => {
        const detail = level === 0;
        const random = mulberry32(b.seed);
        const shade = b.shade;
        const tint = palettes[b.seed % palettes.length];
        const accent: Triple = random() > .7 ? [.35, .55, .58] : [.84, .7, .52];
        const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
        const local = (kind: Kind, lx: number, height: number, lz: number, scale: Triple, value = shade, colour = kind === 'facade' ? tint : undefined, turn = 0) =>
            add(parts, kind, [b.arc + c * lx + s * lz, height, b.axial - s * lx + c * lz], scale, b.yaw + turn, value, colour);
        const masses = buildingMasses(b);
        for (const mass of masses) {
            const { x, z, width: w, depth: d, height: h } = mass;
            const bottom = HABITAT_GROUND_Y + mass.bottom, top = bottom + h, center = bottom + h / 2;
            local('facade', x, center, z, [w, h - .25, d]);
            // Distant towers show their facade's own top as roof; the separate slab is dressing.
            if (level < 2) local('structure', x, top - .15, z, [w, .3, d]);
            if (detail) {
                for (const sx of [-1, 1]) for (const sz of [-1, 1])
                    local('structure', x + sx * (w / 2 - .13), center, z + sz * (d / 2 - .13), [.26, h, .26]);
                // Architectural rhythms vary per building: quiet slabs, occasional horizontal bands,
                // or vertical fins, rather than the same heavy exoskeleton on every tower.
                const rhythm = b.seed % 3;
                if (rhythm === 0) for (let floor = bottom + FLOOR_HEIGHT * 2; floor < top - 1; floor += FLOOR_HEIGHT * (2 + b.seed % 3))
                    local('structure', x, floor, z, [w + .12, .12, d + .12], shade * .82);
                if (rhythm === 1) for (let column = -w / 2 + WINDOW_BAY * 2; column < w / 2 - 1; column += WINDOW_BAY * 3)
                    for (const side of [-1, 1]) local('structure', x + column, center, z + side * d / 2, [.14, h, .45], shade * .8);
                for (const side of [-1, 1]) {
                    local('parapet', x, top + .42, z + side * (d / 2 - .06), [w, .85, .12]);
                    local('parapet', x + side * (w / 2 - .06), top + .42, z, [.12, .85, d]);
                }
                if (w > 14 && d > 14 && random() > .65) {
                    const px = x - w * .32, pz = z + d * .27;
                    local('structure', px, top + .28, pz, [w * .2, .56, d * .25]);
                    local('garden', px, top + .59, pz, [w * .19, .08, d * .24]);
                    local('greenhouse', px, top + 1.35, pz, [w * .23, 1.5, d * .28]);
                    for (const dz of [-.07, .07]) local('foliage', px, top + .96, pz + d * dz, [.58, .47, .65], .72);
                }
            }
            if (detail || (level === 1 && b.height > 220)) {
                const equipment = 1 + b.seed % 3;
                for (let unit = 0; unit < equipment; unit++) {
                    const px = x + (unit - (equipment - 1) / 2) * w * .19;
                    local('dark', px, top + .8, z + d * .19, [Math.min(4.5, w * .12), 1.6, Math.min(6, d * .21)], .7 + random() * .2);
                }
            }
            if (b.seed % 5 === 0) local('neon', x, top - .42, z + d / 2 + .04, [w * .65, .045, .06], 1, accent);
        }
        if (b.archetype === 'needle' && b.seed % 3 === 0)
            local('structure', -b.width * .06, HABITAT_GROUND_Y + b.height + 4, b.depth * .05, [.7, 8, .7]);

        // Night-city dressing draws from its own stream, so the massing and roofs above never change.
        const lights = mulberry32(b.seed ^ 0x2f1a9);
        // A few landmarks keep short, subdued crown accents. Windows and signs carry the skyline;
        // no full-height corner strips or luminous boxes wrap the building or its setbacks.
        const crownAccent = lights() < .16;
        if (b.height > 180 && crownAccent) {
            const crown = masses.reduce((highest, mass) => mass.bottom + mass.height > highest.bottom + highest.height ? mass : highest);
            const top = HABITAT_GROUND_Y + crown.bottom + crown.height;
            const tint: Triple = b.seed % 3 ? [.48, .36, .23] : [.24, .36, .4];
            for (const side of [-1, 1]) local('neon', crown.x, top - .6, crown.z + side * (crown.depth / 2 + .06),
                [crown.width * .55, [.18, .25, .35][level], .12], 1, tint);
        }
        if (b.height > 380) {
            const crown = masses[masses.length - 1], top = HABITAT_GROUND_Y + b.height;
            local('structure', crown.x, top + 15, crown.z, [1.2, 30, 1.2]);
            local('neon', crown.x, top + 31, crown.z, [2.4, 2.4, 2.4], 1, [5, .35, .3]);
        }
        // Screen billboards: landscape screens cycle adverts; tall vertical shop signs stay fixed.
        if (b.height < 45 || lights() > .7 || (level === 2 && b.height < 200)) return;
        const main = masses.reduce((best, mass) => mass.width * mass.height > best.width * best.height ? mass : best);
        for (let n = level === 2 ? 1 : b.height > 300 ? 3 : b.height > 150 ? 2 : 1; n > 0; n--) {
            const face = Math.floor(lights() * 4), alongZ = face < 2, sign = face % 2 ? -1 : 1;
            const faceWidth = alongZ ? main.width : main.depth, vertical = lights() < .4;
            const height = vertical ? Math.min(main.height * .55, 30 + lights() * 40) : 0;
            const width = vertical ? height / 8 : Math.min(faceWidth * .9, 24 + lights() * 40);
            const tall = vertical ? height : width / 2;
            if (width > faceWidth - 1 || tall > main.height - 8) continue;
            const lateral = vertical ? (lights() > .5 ? 1 : -1) * (faceWidth / 2 - width / 2 - 1) : (lights() - .5) * (faceWidth - width) * .6;
            // Screens hang high on the tower, where they read over the surrounding roofs.
            const y = HABITAT_GROUND_Y + main.bottom + main.height - tall / 2 - 4 - lights() * Math.min(main.height * .45, main.height - tall - 8);
            const out = (alongZ ? main.depth : main.width) / 2 + .5;
            const turn = alongZ ? (sign > 0 ? 0 : Math.PI) : sign * Math.PI / 2;
            const brightness = .72 + lights() * .28;
            const part = alongZ ? local('advert', main.x + lateral, y, main.z + sign * out, [width, tall, 1], brightness, undefined, turn)
                : local('advert', main.x + sign * out, y, main.z + lateral, [width, tall, 1], brightness, undefined, turn);
            part.advert = { index: Math.floor(lights() * (vertical ? ADVERT_VERTICAL_COUNT : ADVERT_HORIZONTAL_COUNT)), vertical };
        }
    };
    const bridges = (parts: Parts, list: readonly Skybridge[]) => {
        for (const bridge of list) {
            const height = HABITAT_GROUND_Y + bridge.height;
            add(parts, 'skybridge', [bridge.arc, height, bridge.axial], [bridge.length, 4.5, 7], bridge.yaw);
            add(parts, 'neon', [bridge.arc, height - 2.35, bridge.axial], [bridge.length, .18, 7.1], bridge.yaw, 1, [.42, .34, .24]);
        }
    };
    // Only levels a camera actually selects are instanced; the residence sees a small part of the ring up close.
    const lazy = (build: () => THREE.Object3D) => {
        const holder = new THREE.Group();
        holder.userData.build = () => { delete holder.userData.build; holder.add(build()); };
        return holder;
    };
    const lods: { object: THREE.LOD; sphere: THREE.Sphere; counts: [number, number] }[] = [];
    const register = (lod: THREE.LOD, radius: number, counts: [number, number]) => {
        lod.autoUpdate = false; group.add(lod);
        lods.push({ object: lod, sphere: new THREE.Sphere(lod.position.clone(), radius), counts });
    };

    // One parcel layout supplies all LODs; changing detail never moves a building.
    const localBuildings = createCityLayout(CITY_LOCAL_BOUNDS, { density: 'local' });
    let neoCity: ReturnType<typeof createNeoCity> | undefined;
    let transit: ReturnType<typeof createCityTransit> | undefined;
    const modelsReady = loadModels().then(source => {
        if (isDisposed()) return;
        neoCity = createNeoCity(source, localBuildings);
        const proceduralBuildings = localBuildings.filter(building => !neoCity!.replacedSeeds.has(building.seed));
        const localDetailed = emptyParts();
        for (const building of proceduralBuildings) tower(localDetailed, building, Math.hypot(building.arc, building.axial) < 900 ? 0 : 1);
        bridges(localDetailed, planSkybridges(localBuildings, neoCity.replacedSeeds));
        const neighborhood = new THREE.LOD(); neighborhood.name = 'local-neighborhood-lod';
        neighborhood.addLevel(buildParts(localDetailed), 0);
        neighborhood.addLevel(lazy(() => {
            const parts = emptyParts();
            for (const building of proceduralBuildings) tower(parts, building, 2);
            return buildParts(parts);
        }), 4500, .12);
        const localExtent = Math.hypot(CITY_LOCAL_BOUNDS.arcMax, CITY_LOCAL_BOUNDS.axialMax - CITY_LOCAL_BOUNDS.axialMin);
        register(neighborhood, localExtent, [proceduralBuildings.length, proceduralBuildings.length]);
        transit = createCityTransit(localBuildings, neoCity.replacedSeeds);
        group.add(neoCity.group, transit.group);
        group.userData.neoCityBuildingCount = neoCity.placements.length;
        group.userData.lodSectorCount = lods.length;
        group.updateMatrixWorld(true);
    });
    const ready = Promise.all([materialsReady, modelsReady]);

    // Curved patches close around the complete ring; the parcel generator supplies unequal districts.
    const circumference = Math.PI * 2 * HABITAT_RADIUS_M;
    const arcSpan = circumference / SECTOR_COUNT, axialSpan = HABITAT_HALF_WIDTH_M * 2 / AXIAL_SECTOR_COUNT;
    const citySectors = createCitySectors(SECTOR_COUNT, AXIAL_SECTOR_COUNT);
    let districtBuildingCount = 0;
    for (let sector = 0; sector < SECTOR_COUNT; sector++) for (let axialSector = 0; axialSector < AXIAL_SECTOR_COUNT; axialSector++) {
        const arcMin = -circumference / 2 + sector * arcSpan, arcMax = arcMin + arcSpan;
        const axialMin = HABITAT_AXIAL_MIN + axialSector * axialSpan, axialMax = axialMin + axialSpan;
        const centerArc = (arcMin + arcMax) / 2, centerAxial = (axialMin + axialMax) / 2;
        const center = habitatPoint(centerArc, HABITAT_GROUND_Y, centerAxial);
        const buildings = citySectors[sector * AXIAL_SECTOR_COUNT + axialSector];
        districtBuildingCount += buildings.length;
        // Every building is always drawn as real geometry by its massing chunk. Up close a sector adds
        // dressing on top of those same boxes: bridges, rooftop plant, corner neon and more screens.
        const dressing = lazy(() => {
            const parts = emptyParts();
            for (const b of buildings) tower(parts, b, 1);
            parts.facade.length = 0;
            bridges(parts, planSkybridges(buildings));
            return buildParts(parts, center);
        });
        const lod = new THREE.LOD(); lod.name = `urban-sector-${sector}-${axialSector}`; lod.position.copy(center);
        lod.addLevel(dressing, 0); lod.addLevel(new THREE.Group(), CITY_NEAR_LOD_METRES, .12);
        // Centres belong to this sector, but footprints can cross its edges. Include their
        // largest half-diagonal so culling never clips a building at a rendering seam.
        const groundRadius = HABITAT_RADIUS_M - HABITAT_GROUND_Y;
        const tallest = Math.max(0, ...buildings.map(b => b.height)) + 10;
        const radialExtent = (height: number) => Math.sqrt(height * height
            + 2 * groundRadius * (groundRadius - height) * (1 - Math.cos(arcSpan / (2 * HABITAT_RADIUS_M))));
        const footprintRadius = Math.max(0, ...buildings.map(b => Math.hypot(b.width, b.depth) / 2));
        const boundsRadius = Math.hypot(Math.max(radialExtent(0), radialExtent(tallest)), axialSpan / 2) + footprintRadius + 10;
        register(lod, boundsRadius, [buildings.length, buildings.length]);
    }

    for (let chunkArc = 0; chunkArc < SECTOR_COUNT / CHUNK_ARC_SECTORS; chunkArc++)
        for (let chunkAxial = 0; chunkAxial < AXIAL_SECTOR_COUNT / CHUNK_AXIAL_SECTORS; chunkAxial++) {
            const arcMin = -circumference / 2 + chunkArc * CHUNK_ARC_SECTORS * arcSpan, arcMax = arcMin + CHUNK_ARC_SECTORS * arcSpan;
            const axialMin = HABITAT_AXIAL_MIN + chunkAxial * CHUNK_AXIAL_SECTORS * axialSpan, axialMax = axialMin + CHUNK_AXIAL_SECTORS * axialSpan;
            const origin = habitatPoint((arcMin + arcMax) / 2, HABITAT_GROUND_Y, (axialMin + axialMax) / 2);
            const parts = emptyParts();
            for (let i = 0; i < CHUNK_ARC_SECTORS; i++) for (let j = 0; j < CHUNK_AXIAL_SECTORS; j++)
                for (const b of citySectors[(chunkArc * CHUNK_ARC_SECTORS + i) * AXIAL_SECTOR_COUNT + chunkAxial * CHUNK_AXIAL_SECTORS + j]) tower(parts, b, 2);
            const chunk = buildParts(parts, origin); chunk.name = `urban-massing-${chunkArc}-${chunkAxial}`; chunk.position.copy(origin);
            const ground = new THREE.Mesh(createSectorSurface(arcMin, arcMax, axialMin, axialMax, origin, 12 * CHUNK_ARC_SECTORS), surface);
            ground.name = 'urban-ground'; chunk.add(ground); group.add(chunk);
        }

    const shell = createHabitatShell(time), greenery = createCityGreenery(time);
    group.add(shell.group, greenery);

    const frustum = new THREE.Frustum(), projection = new THREE.Matrix4(), sphere = new THREE.Sphere();
    const activeLevels = [0, 0];
    group.userData.buildingCount = localBuildings.length + districtBuildingCount;
    group.userData.localBuildingCount = localBuildings.length;
    group.userData.treeCount = greenery.userData.treeCount;
    group.userData.lodSectorCount = lods.length;
    group.userData.activeLodCounts = activeLevels;
    group.userData.windowBayMetres = WINDOW_BAY; group.userData.floorHeightMetres = FLOOR_HEIGHT;
    group.userData.circumferenceMetres = circumference; group.userData.axialLengthMetres = HABITAT_HALF_WIDTH_M * 2;
    group.updateMatrixWorld(true);
    const update = (seconds: number, camera: THREE.Camera) => {
        time.value = seconds; transit?.update(seconds); shell.update(seconds);
        camera.updateWorldMatrix(true, false); group.updateWorldMatrix(true, false);
        projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(projection);
        activeLevels.fill(0); let visibleBuildings = 0;
        for (const entry of lods) {
            const lod = entry.object;
            sphere.copy(entry.sphere).applyMatrix4(group.matrixWorld);
            lod.visible = frustum.intersectsSphere(sphere);
            if (!lod.visible) continue;
            lod.updateWorldMatrix(false, false); lod.update(camera);
            const level = lod.getCurrentLevel(); activeLevels[level]++; visibleBuildings += entry.counts[level];
            lod.levels[level].object.userData.build?.();
        }
        neoCity?.update(camera);
        group.userData.visibleBuildingCount = visibleBuildings + (neoCity?.group.userData.visibleBuildingCount ?? 0);
        group.userData.preallocatedInstanceCount = instanceCount + (transit?.instanceCount ?? 0) + (neoCity?.group.userData.preallocatedInstanceCount ?? 0);
    };
    return { group, update, ready };
}
