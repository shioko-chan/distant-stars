import * as THREE from 'three';
import { mulberry32 } from '../simulation/rng';
import { createCityMaterials, WINDOW_BAY, FLOOR_HEIGHT } from './cityMaterials';
import { createCityLayout, createCitySectors, CITY_LOCAL_BOUNDS, type CityBuilding as Building } from './cityLayout';
import { buildingMasses } from './cityMassing';
import { HABITAT_RADIUS_M, HABITAT_GROUND_Y, HABITAT_HALF_WIDTH_M, habitatPoint, habitatOrientation } from './habitatFrame';

type Triple = [number, number, number];
interface CityPart { position: Triple; scale: Triple; yaw: number; shade: number; tint?: Triple }

const SECTOR_COUNT = 32;
const AXIAL_SECTOR_COUNT = 10;
const URBAN_TILE_METRES = 8192;
export const CITY_NEAR_LOD_METRES = 6000;
export const CITY_FAR_LOD_METRES = 16000;
const localUp = new THREE.Vector3(0, 1, 0);

/** Roof footprints, service courts, transport streets and occupied districts for distant sectors. */
function createUrbanTextures() {
    const size = 1024;
    const color = new Uint8Array(size * size * 4);
    const light = new Uint8Array(size * size * 4);
    const random = mulberry32(391174);
    for (let i = 0; i < size * size; i++) {
        const variation = random() * 5;
        color.set([24 + variation, 33 + variation, 40 + variation, 255], i * 4);
        light.set([3, 7, 11, 255], i * 4);
    }
    // Reuse the parcel grammar at atlas scale: uneven blocks, courts and broad streets.
    // The atlas only supplies roofs below the far geometry's resolvable skyline.
    const districts = createCityLayout({ arcMin: 0, arcMax: URBAN_TILE_METRES, axialMin: 0, axialMax: URBAN_TILE_METRES }, { density: 'near' });
    const paint = (cx: number, cy: number, w: number, h: number, yaw: number, rgb: Triple, glow: Triple) => {
        const c = Math.cos(yaw), s = Math.sin(yaw);
        const radius = Math.ceil(Math.hypot(w, h) / 2);
        for (let y = Math.max(0, Math.floor(cy - radius)); y < Math.min(size, cy + radius); y++)
            for (let x = Math.max(0, Math.floor(cx - radius)); x < Math.min(size, cx + radius); x++) {
                const dx = x - cx, dy = y - cy;
                if (Math.abs(c * dx - s * dy) > w / 2 || Math.abs(s * dx + c * dy) > h / 2) continue;
                const i = (y * size + x) * 4;
                color.set(rgb, i); light.set(glow, i);
            }
    };
    for (const building of districts) {
        const c = Math.cos(building.yaw), s = Math.sin(building.yaw), scale = size / URBAN_TILE_METRES;
        const rng = mulberry32(building.seed);
        const shade = 50 + rng() * 38;
        for (const mass of buildingMasses(building)) {
            const x = (building.arc + c * mass.x + s * mass.z) * scale;
            const y = (building.axial - s * mass.x + c * mass.z) * scale;
            const w = mass.width * scale, h = mass.depth * scale;
            paint(x + 2, y + 2, w, h, building.yaw, [13, 21, 27], [0, 0, 0]);
            paint(x, y, w, h, building.yaw, [shade, shade * 1.03, shade * 1.04], [2, 4, 5]);
            paint(x, y, Math.max(1, w - 2), Math.max(1, h - 2), building.yaw, [shade * .73, shade * .78, shade * .8], rng() > .72 ? [18, 14, 8] : [1, 2, 3]);
            if (w > 7 && h > 7) paint(x + w * .1, y - h * .1, w * .16, h * .23, building.yaw, [37, 43, 44], [0, 0, 0]);
        }
    }
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

/** Curved inward-facing sector, optionally including a few skyline masses in its single draw. */
function createSectorSurface(arcMin: number, arcMax: number, axialMin: number, axialMax: number, origin: THREE.Vector3, relief: Building[] = []) {
    const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
    const point = new THREE.Vector3(), normal = new THREE.Vector3(), orientation = new THREE.Quaternion();
    const arcSteps = 12, axialSteps = 2;
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
    if (relief.length) {
        const cube = new THREE.BoxGeometry(1, 1, 1);
        const p = cube.getAttribute('position'), n = cube.getAttribute('normal'), sourceIndex = cube.getIndex()!;
        const center = new THREE.Vector3();
        for (const building of relief) {
            const c = Math.cos(building.yaw), s = Math.sin(building.yaw);
            for (const mass of buildingMasses(building)) {
                const first = positions.length / 3;
                const arc = building.arc + c * mass.x + s * mass.z;
                const axial = building.axial - s * mass.x + c * mass.z;
                habitatPoint(arc, HABITAT_GROUND_Y + mass.bottom + mass.height / 2, axial, center).sub(origin);
                habitatOrientation(arc, orientation);
                orientation.multiply(new THREE.Quaternion().setFromAxisAngle(localUp, building.yaw));
                for (let i = 0; i < p.count; i++) {
                    point.set(p.getX(i) * mass.width, p.getY(i) * mass.height, p.getZ(i) * mass.depth).applyQuaternion(orientation).add(center);
                    normal.fromBufferAttribute(n, i).applyQuaternion(orientation);
                    positions.push(point.x, point.y, point.z); normals.push(normal.x, normal.y, normal.z);
                    uvs.push((arc + p.getX(i) * mass.width) / URBAN_TILE_METRES,
                        (axial + (Math.abs(n.getY(i)) > .5 ? p.getZ(i) * mass.depth : p.getY(i) * mass.height)) / URBAN_TILE_METRES);
                }
                for (let i = 0; i < sourceIndex.count; i++) indices.push(first + sourceIndex.getX(i));
            }
        }
        cube.dispose();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeBoundingSphere();
    return geometry;
}

/** The city is fixed to the rotating habitat; only traffic moves in its co-rotating frame. */
export function createOrbitalCity(loader: Pick<THREE.TextureLoader, 'loadAsync'>, ownedTextures: Set<THREE.Texture>, isDisposed: () => boolean) {
    const group = new THREE.Group(); group.name = 'orbital-metropolis';
    const { facade, structure, ready } = createCityMaterials(loader, ownedTextures, isDisposed);
    const urbanTextures = createUrbanTextures();
    const metal = new THREE.MeshStandardMaterial({ color: '#68767d', roughness: .64, metalness: .32 });
    const dark = new THREE.MeshStandardMaterial({ color: '#1a2c37', roughness: .72, metalness: .24 });
    const glass = new THREE.MeshStandardMaterial({ color: '#577986', roughness: .28, metalness: .46 });
    const greenhouse = new THREE.MeshStandardMaterial({ color: '#acc9d4', roughness: .34, metalness: .15, transparent: true, opacity: .18, depthWrite: false });
    const garden = new THREE.MeshStandardMaterial({ color: '#35564b', roughness: .94 });
    const warm = new THREE.MeshBasicMaterial({ color: new THREE.Color('#edc795').multiplyScalar(.95) });
    const cool = new THREE.MeshBasicMaterial({ color: new THREE.Color('#77b9c8').multiplyScalar(.75) });
    const surface = new THREE.MeshStandardMaterial({ color: '#566772', map: urbanTextures.albedo, emissive: '#ffffff', emissiveMap: urbanTextures.emission, emissiveIntensity: 1.2, roughness: 1, metalness: 0 });
    const box = new THREE.BoxGeometry(1, 1, 1); box.clearGroups();
    const foliage = new THREE.IcosahedronGeometry(1, 1);
    const materials = { facade, structure, dark, parapet: glass, greenhouse, garden, foliage: garden, warm, cool };
    type Kind = keyof typeof materials;
    type Parts = Record<Kind, CityPart[]>;
    const emptyParts = (): Parts => ({ facade: [], structure: [], dark: [], parapet: [], greenhouse: [], garden: [], foliage: [], warm: [], cool: [] });
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
        for (const kind of Object.keys(parts) as Kind[]) batch(result, kind, kind === 'foliage' ? foliage : box, materials[kind], parts[kind], origin);
        return result;
    };
    const add = (parts: Parts, kind: Kind, position: Triple, scale: Triple, rotation = 0, shade = 1, tint?: Triple) =>
        parts[kind].push({ position, scale, yaw: rotation, shade, tint });
    const palettes: Triple[] = [[.94, .97, 1], [1, .83, .64], [.69, .84, .9], [.93, .89, .81], [.77, .9, .8]];
    const tower = (parts: Parts, b: Building, detail: boolean) => {
        const random = mulberry32(b.seed);
        const shade = b.shade;
        const tint = palettes[b.seed % palettes.length];
        const accent: Kind = random() > .7 ? 'cool' : 'warm';
        const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
        const local = (kind: Kind, lx: number, height: number, lz: number, scale: Triple, value = shade) =>
            add(parts, kind, [b.arc + c * lx + s * lz, height, b.axial - s * lx + c * lz], scale, b.yaw, value, kind === 'facade' ? tint : undefined);
        for (const mass of buildingMasses(b)) {
            const { x, z, width: w, depth: d, height: h } = mass;
            const bottom = HABITAT_GROUND_Y + mass.bottom, top = bottom + h, center = bottom + h / 2;
            local('facade', x, center, z, [w, h - .25, d]);
            local('structure', x, top - .15, z, [w, .3, d]);
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
            if (detail || b.height > 160) {
                const equipment = 1 + b.seed % 3;
                for (let unit = 0; unit < equipment; unit++) {
                    const px = x + (unit - (equipment - 1) / 2) * w * .19;
                    local('dark', px, top + .8, z + d * .19, [Math.min(4.5, w * .12), 1.6, Math.min(6, d * .21)], .7 + random() * .2);
                }
            }
            if (b.seed % 5 === 0) local(accent, x, top - .42, z + d / 2 + .04, [w * .65, .045, .06], .6);
        }
        if (b.archetype === 'needle' && b.seed % 3 === 0)
            local('structure', -b.width * .06, HABITAT_GROUND_Y + b.height + 4, b.depth * .05, [.7, 8, .7]);
    };
    const lods: { object: THREE.LOD; sphere: THREE.Sphere; counts: [number, number, number] }[] = [];
    const register = (lod: THREE.LOD, radius: number, counts: [number, number, number]) => {
        lod.autoUpdate = false; group.add(lod);
        lods.push({ object: lod, sphere: new THREE.Sphere(lod.position.clone(), radius), counts });
    };

    // One parcel layout supplies all LODs; changing detail never moves a building.
    const localBuildings = createCityLayout(CITY_LOCAL_BOUNDS, { density: 'local' });
    const localDetailed = emptyParts(), localSimple = emptyParts();
    for (const building of localBuildings) {
        tower(localDetailed, building, Math.hypot(building.arc, building.axial) < 650);
        tower(localSimple, building, false);
    }
    const neighborhood = new THREE.LOD(); neighborhood.name = 'local-neighborhood-lod';
    neighborhood.addLevel(buildParts(localDetailed), 0);
    neighborhood.addLevel(buildParts(localSimple), 4500, .12);
    neighborhood.addLevel(new THREE.Group(), 8500, .12);
    register(neighborhood, 3400, [localBuildings.length, localBuildings.length, 0]);

    // Curved patches close around the complete ring; the parcel generator supplies unequal districts.
    const circumference = Math.PI * 2 * HABITAT_RADIUS_M;
    const arcSpan = circumference / SECTOR_COUNT, axialSpan = HABITAT_HALF_WIDTH_M * 2 / AXIAL_SECTOR_COUNT;
    const citySectors = createCitySectors(SECTOR_COUNT, AXIAL_SECTOR_COUNT);
    let districtBuildingCount = 0;
    for (let sector = 0; sector < SECTOR_COUNT; sector++) for (let axialSector = 0; axialSector < AXIAL_SECTOR_COUNT; axialSector++) {
        const arcMin = -circumference / 2 + sector * arcSpan, arcMax = arcMin + arcSpan;
        const axialMin = -HABITAT_HALF_WIDTH_M + axialSector * axialSpan, axialMax = axialMin + axialSpan;
        const centerArc = (arcMin + arcMax) / 2, centerAxial = (axialMin + axialMax) / 2;
        const center = habitatPoint(centerArc, HABITAT_GROUND_Y, centerAxial);
        const buildings = citySectors[sector * AXIAL_SECTOR_COUNT + axialSector];
        districtBuildingCount += buildings.length;
        const highParts = emptyParts(), midParts = emptyParts();
        // Preserve the district skyline and silhouettes at medium distance; texture supplies
        // only the smallest roofs once their individual outlines are no longer readable.
        const midBuildings = buildings.filter(b => b.height > 100 || b.seed % 4 === 0);
        const relief = buildings.filter(b => b.height > 240);
        for (const b of buildings) tower(highParts, b, false);
        for (const b of midBuildings) tower(midParts, b, false);
        const terrainGeometry = createSectorSurface(arcMin, arcMax, axialMin, axialMax, center);
        const high = buildParts(highParts, center), mid = buildParts(midParts, center);
        high.add(new THREE.Mesh(terrainGeometry, surface)); mid.add(new THREE.Mesh(terrainGeometry, surface));
        const far = new THREE.Mesh(createSectorSurface(arcMin, arcMax, axialMin, axialMax, center, relief), surface);
        far.name = 'curved-urban-impostor';
        const lod = new THREE.LOD(); lod.name = `urban-sector-${sector}-${axialSector}`; lod.position.copy(center);
        lod.addLevel(high, 0); lod.addLevel(mid, CITY_NEAR_LOD_METRES, .12); lod.addLevel(far, CITY_FAR_LOD_METRES, .12);
        // Centres belong to this sector, but footprints can cross its edges. Include their
        // largest half-diagonal so culling never clips a building at a rendering seam.
        const groundRadius = HABITAT_RADIUS_M - HABITAT_GROUND_Y;
        const tallest = Math.max(0, ...buildings.map(b => b.height)) + 10;
        const radialExtent = (height: number) => Math.sqrt(height * height
            + 2 * groundRadius * (groundRadius - height) * (1 - Math.cos(arcSpan / (2 * HABITAT_RADIUS_M))));
        const footprintRadius = Math.max(0, ...buildings.map(b => Math.hypot(b.width, b.depth) / 2));
        const boundsRadius = Math.hypot(Math.max(radialExtent(0), radialExtent(tallest)), axialSpan / 2) + footprintRadius + 10;
        register(lod, boundsRadius, [buildings.length, midBuildings.length, relief.length]);
    }

    // Circumferential service trusses belong to the habitat wall and repeat along its axis.
    const serviceGeometry = new THREE.TorusGeometry(HABITAT_RADIUS_M - HABITAT_GROUND_Y - 50, 35, 6, 192);
    const serviceLightGeometry = new THREE.TorusGeometry(HABITAT_RADIUS_M - HABITAT_GROUND_Y - 89, 6, 5, 192);
    for (const fraction of [-.82, -.28, .39, .86]) {
        const axial = fraction * HABITAT_HALF_WIDTH_M;
        const frame = new THREE.Mesh(serviceGeometry, metal); frame.name = 'circumferential-service-truss'; frame.position.set(0, HABITAT_RADIUS_M, axial); group.add(frame);
        const route = new THREE.Mesh(serviceLightGeometry, cool); route.name = 'circumferential-transit-route'; route.position.copy(frame.position); group.add(route);
    }

    const trafficCount = 72, random = mulberry32(887141);
    const traffic = Array.from({ length: trafficCount }, (_, i) => ({
        phase: random(), speed: .0012 + random() * .002, direction: i % 2 ? 1 : -1,
        arc: (i % 4 - 1.5) * 226 + (random() - .5) * 90,
        height: HABITAT_GROUND_Y + 640 + random() * 80, size: .9 + random() * 1.3,
    }));
    const craft = new THREE.InstancedMesh(box, dark, trafficCount), engines = new THREE.InstancedMesh(box, warm, trafficCount);
    craft.name = 'orbital-shuttles'; engines.name = 'shuttle-running-lights';
    for (const mesh of [craft, engines]) { mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; group.add(mesh); }
    const updateTraffic = (seconds: number) => {
        for (let i = 0; i < traffic.length; i++) {
            const ship = traffic[i], progress = ((seconds * ship.speed + ship.phase) % 1 + 1) % 1;
            const axial = (progress - .5) * 7500 * ship.direction;
            habitatPoint(ship.arc, ship.height, axial, point); transform.position.copy(point);
            habitatOrientation(ship.arc, transform.quaternion); transform.scale.set(ship.size, ship.size * .45, ship.size * 3.2); transform.updateMatrix(); craft.setMatrixAt(i, transform.matrix);
            habitatPoint(ship.arc, ship.height, axial - ship.direction * ship.size * 1.7, point); transform.position.copy(point);
            transform.scale.set(ship.size * .64, ship.size * .15, ship.size * .3); transform.updateMatrix(); engines.setMatrixAt(i, transform.matrix);
        }
        craft.instanceMatrix.needsUpdate = engines.instanceMatrix.needsUpdate = true;
    };
    const frustum = new THREE.Frustum(), projection = new THREE.Matrix4(), sphere = new THREE.Sphere();
    const activeLevels = [0, 0, 0];
    group.userData.buildingCount = localBuildings.length + districtBuildingCount;
    group.userData.localBuildingCount = localBuildings.length;
    group.userData.preallocatedInstanceCount = instanceCount + trafficCount * 2;
    group.userData.lodSectorCount = lods.length;
    group.userData.activeLodCounts = activeLevels;
    group.userData.windowBayMetres = WINDOW_BAY; group.userData.floorHeightMetres = FLOOR_HEIGHT;
    group.userData.circumferenceMetres = circumference; group.userData.axialLengthMetres = HABITAT_HALF_WIDTH_M * 2;
    group.updateMatrixWorld(true);
    updateTraffic(0);
    const update = (seconds: number, camera: THREE.Camera) => {
        updateTraffic(seconds);
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
        }
        group.userData.visibleBuildingCount = visibleBuildings;
    };
    return { group, update, ready };
}
