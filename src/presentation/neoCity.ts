import * as THREE from 'three';
import type { CityBuilding } from './cityLayout';
import { HABITAT_GROUND_Y, habitatOrientation, habitatPoint } from './habitatFrame';

export const NEO_CITY_DETAIL_DISTANCE = 1200;
export const NEO_CITY_BUILDING_LIMIT = 40;
const up = new THREE.Vector3(0, 1, 0);
// Art-directed parcels checked from the residence: the upper facades have clear sightlines
// through the left, right and rear windows, without removing neighbouring buildings.
const landmarks: Readonly<Record<string, readonly number[]>> = {
    'lg-b': [1609871622, 2971378133],
    'lg-c': [3526716711, 287526601],
};
const landmarkSeeds = new Set(Object.values(landmarks).flat());

interface Model {
    id: string;
    high: THREE.Object3D;
    medium: THREE.Object3D;
    size: THREE.Vector3;
}
export interface NeoCityPlacement {
    building: CityBuilding;
    model: string;
    scale: number;
}

/** Use the original parcel envelopes, so roads, the residence and air-traffic clearance remain valid. */
export function planNeoCity(buildings: readonly CityBuilding[], models: readonly Pick<Model, 'id' | 'size'>[]): NeoCityPlacement[] {
    if (!models.length) return [];
    const candidates = buildings.filter(b => Math.hypot(b.arc, b.axial) < 1800 && b.width > 22 && b.depth > 18 && b.height > 70);
    const placements: NeoCityPlacement[] = [];
    const selected = new Set<number>();
    const top = new THREE.Vector3();
    // Cycle through the kit's distinct forms, choosing a suitable existing parcel for each.
    // The residence is 240 m above ground: simply taking the nearest lots hides them below its windows.
    for (let slot = 0; slot < NEO_CITY_BUILDING_LIMIT; slot++) {
        const model = models[slot % models.length];
        const view = Math.floor(slot / models.length) % 5;
        const landmark = candidates.find(building => building.seed === landmarks[model.id]?.[Math.floor(slot / models.length)]);
        let best: { building: CityBuilding; scale: number; score: number } | undefined;
        for (const building of candidates) {
            if (selected.has(building.seed)) continue;
            if (landmark ? building !== landmark : landmarkSeeds.has(building.seed)) continue;
            // Give both side windows and the rear windows a mixture of kit buildings. Otherwise
            // the cylinder's rising sides win every low-rise placement over the flatter rear view.
            if (!landmark && view === 0 && building.arc >= -building.axial * 1.25) continue;
            if (!landmark && view === 1 && building.arc <= building.axial * 1.25) continue;
            if (!landmark && (view === 2 || view === 3) && (building.axial < 350 || Math.abs(building.arc) > building.axial * .7
                || Math.abs(building.arc) < building.axial * .18)) continue;
            const scale = Math.min(building.width / model.size.x, building.depth / model.size.z, building.height / model.size.y, 2) * .94;
            if (scale < .6) continue;
            const coverage = model.size.x * model.size.z * scale * scale / (building.width * building.depth);
            const heightFit = model.size.y * scale / building.height;
            habitatPoint(building.arc, HABITAT_GROUND_Y + model.size.y * scale, building.axial, top);
            const elevation = Math.atan2(top.y - 1.6, Math.hypot(top.x, top.z));
            const targetElevation = model.size.y >= 120 ? .055 : -.075;
            const belowWindow = Math.max(0, targetElevation - elevation);
            const nearbyCopies = placements.filter(p => p.model === model.id && Math.hypot(p.building.arc - building.arc, p.building.axial - building.axial) < 280).length;
            const score = Math.hypot(building.arc, building.axial) / 1400 + belowWindow * 32
                + (1 - coverage) * .3 + Math.abs(Math.log(heightFit)) * .15 + nearbyCopies * .8;
            if (!best || score < best.score || (score === best.score && building.seed < best.building.seed)) best = { building, scale, score };
        }
        if (!best) continue;
        placements.push({ building: best.building, model: model.id, scale: best.scale });
        selected.add(best.building.seed);
    }
    return placements;
}

/** Shared geometry/material batches keep repeated kit buildings from multiplying draw calls or textures. */
export function createNeoCity(source: THREE.Group, buildings: readonly CityBuilding[]) {
    source.updateMatrixWorld(true);
    const ids = ['lg-a-core', 'lg-a-a', 'lg-a-b', 'lg-b', 'lg-c', 'md-a', 'md-b', 'md-c'];
    const models: Model[] = ids.map(id => {
        const high = source.getObjectByName(`${id}-high`), medium = source.getObjectByName(`${id}-medium`);
        if (!high || !medium) throw new Error(`Neo City 缺少建筑层级：${id}`);
        const size = new THREE.Box3().setFromObject(high).getSize(new THREE.Vector3());
        if (Math.min(size.x, size.y, size.z) <= 0) throw new Error(`Neo City 建筑尺寸无效：${id}`);
        return { id, high, medium, size };
    });
    const placements = planNeoCity(buildings, models);
    const group = new THREE.Group(); group.name = 'neo-city-neighborhood';
    const transform = new THREE.Object3D(), yaw = new THREE.Quaternion();
    const residents = placements.map(placement => {
        const { building, scale } = placement;
        habitatPoint(building.arc, HABITAT_GROUND_Y, building.axial, transform.position);
        habitatOrientation(building.arc, transform.quaternion);
        transform.quaternion.multiply(yaw.setFromAxisAngle(up, building.yaw));
        transform.scale.setScalar(scale); transform.updateMatrix();
        const model = models.find(model => model.id === placement.model)!;
        const centre = new THREE.Vector3(0, model.size.y / 2, 0).applyMatrix4(transform.matrix);
        return { ...placement, matrix: transform.matrix.clone(), sphere: new THREE.Sphere(centre, model.size.length() * scale / 2), level: 0 };
    });
    const textures = new Set<THREE.Texture>();
    const batches: { model: string; level: number; mesh: THREE.InstancedMesh; local: THREE.Matrix4 }[] = [];
    for (const model of models) {
        const count = placements.filter(placement => placement.model === model.id).length;
        if (!count) continue;
        for (const [level, object] of [model.high, model.medium].entries()) {
            object.traverse(child => {
                if (!(child instanceof THREE.Mesh)) return;
                for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
                    if (!(material instanceof THREE.MeshStandardMaterial)) continue;
                    material.envMapIntensity = .45;
                    for (const value of Object.values(material)) if (value instanceof THREE.Texture && !textures.has(value)) {
                        value.anisotropy = 8; textures.add(value);
                    }
                }
                const mesh = new THREE.InstancedMesh(child.geometry, child.material, count);
                mesh.name = `neo-${model.id}-${level}-${child.name}`;
                // Bounds are checked per building before filling these shared instance buffers.
                mesh.frustumCulled = false; mesh.count = 0;
                mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
                group.add(mesh);
                batches.push({ model: model.id, level, mesh, local: child.matrixWorld.clone() });
            });
        }
    }
    const cameraPosition = new THREE.Vector3(), localCamera = new THREE.Vector3(), matrix = new THREE.Matrix4();
    const projection = new THREE.Matrix4(), inverse = new THREE.Matrix4(), frustum = new THREE.Frustum(), worldSphere = new THREE.Sphere();
    const update = (camera: THREE.Camera) => {
        group.updateWorldMatrix(true, false); camera.getWorldPosition(cameraPosition);
        localCamera.copy(cameraPosition).applyMatrix4(inverse.copy(group.matrixWorld).invert());
        frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        for (const batch of batches) batch.mesh.count = 0;
        let visible = 0, detailed = 0;
        for (const resident of residents) {
            // A 12% return margin prevents rapid LOD changes when standing near the boundary.
            const distance = localCamera.distanceTo(resident.sphere.center);
            resident.level = distance < NEO_CITY_DETAIL_DISTANCE * (resident.level === 1 ? .88 : 1) ? 0 : 1;
            if (!frustum.intersectsSphere(worldSphere.copy(resident.sphere).applyMatrix4(group.matrixWorld))) continue;
            visible++; if (resident.level === 0) detailed++;
            for (const batch of batches) {
                if (batch.model !== resident.model || batch.level !== resident.level) continue;
                batch.mesh.setMatrixAt(batch.mesh.count++, matrix.multiplyMatrices(resident.matrix, batch.local));
            }
        }
        for (const batch of batches) {
            batch.mesh.visible = batch.mesh.count > 0;
            batch.mesh.instanceMatrix.needsUpdate = true;
        }
        group.userData.visibleBuildingCount = visible;
        group.userData.detailedBuildingCount = detailed;
    };
    group.userData.buildingCount = placements.length;
    group.userData.modelCount = new Set(placements.map(placement => placement.model)).size;
    group.userData.preallocatedInstanceCount = batches.reduce((count, batch) => count + batch.mesh.instanceMatrix.count, 0);
    return { group, placements, replacedSeeds: new Set(placements.map(placement => placement.building.seed)), update };
}
