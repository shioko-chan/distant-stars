import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CITY_LOCAL_BOUNDS, CITY_ROOM_CLEARANCE, cityBuildingBounds, createCityLayout, type CityBuilding } from './cityLayout';
import { HABITAT_GROUND_Y, habitatOrientation, habitatPoint } from './habitatFrame';
import { createNeoCity, NEO_CITY_BUILDING_LIMIT, NEO_CITY_DETAIL_DISTANCE, planNeoCity } from './neoCity';
import { createNeoCityFixture, NEO_CITY_FIXTURE_MODELS } from './neoCityFixture';
import { buildingMasses } from './cityMassing';
import kit from '../../public/models/neo-city/manifest.json';

const sources: THREE.Group[] = [], neighborhoods: ReturnType<typeof createNeoCity>[] = [];
const makeCity = (buildings: CityBuilding[]) => {
    const source = createNeoCityFixture(); sources.push(source);
    const city = createNeoCity(source, buildings); neighborhoods.push(city);
    return { source, ...city };
};
const parcel = (overrides: Partial<CityBuilding> = {}): CityBuilding => ({
    arc: 140, axial: 180, width: 64, depth: 56, height: 220, yaw: .21, seed: 71, archetype: 'slab', shade: .9, ...overrides,
});
const aim = (position: THREE.Vector3, target: THREE.Vector3, fov = 52) => {
    const camera = new THREE.PerspectiveCamera(fov, 16 / 9, .05, 150000);
    camera.position.copy(position); camera.lookAt(target); camera.updateMatrixWorld(true); return camera;
};
const instanceMeshes = (group: THREE.Group): THREE.InstancedMesh[] => group.children.filter((child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh);

afterEach(() => {
    for (const city of neighborhoods.splice(0)) for (const mesh of instanceMeshes(city.group)) mesh.dispose();
    const materials = new Set<THREE.Material>();
    for (const source of sources.splice(0)) source.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    });
    materials.forEach(material => material.dispose());
});

describe('Neo City neighborhood', () => {
    it('keeps four actual-kit landmarks visible through the residence windows above foreground buildings', () => {
        const buildings = createCityLayout(CITY_LOCAL_BOUNDS, { density: 'local' });
        const models = kit.buildings.map(model => ({ id: model.id, size: new THREE.Vector3(model.size.width, model.size.height, model.size.depth) }));
        const placements = planNeoCity(buildings, models);
        const transform = new THREE.Object3D(), yaw = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
        const unit = new THREE.Box3(new THREE.Vector3(-.5, -.5, -.5), new THREE.Vector3(.5, .5, .5));
        // Conservative world-space boxes around the original massing: a roof can lie above the
        // sill while its facade is still entirely hidden by a closer tower.
        const obstacles = buildings.flatMap(building => buildingMasses(building).map(mass => {
            const c = Math.cos(building.yaw), s = Math.sin(building.yaw);
            const arc = building.arc + c * mass.x + s * mass.z;
            const axial = building.axial - s * mass.x + c * mass.z;
            habitatPoint(arc, HABITAT_GROUND_Y + mass.bottom + mass.height / 2, axial, transform.position);
            habitatOrientation(arc, transform.quaternion).multiply(yaw.setFromAxisAngle(up, building.yaw));
            transform.scale.set(mass.width, mass.height, mass.depth); transform.updateMatrix();
            return { seed: building.seed, bounds: unit.clone().applyMatrix4(transform.matrix) };
        }));
        const eye = new THREE.Vector3(0, 1.6, .6), ray = new THREE.Ray(), hit = new THREE.Vector3();
        const landmarks = [
            { seed: 1609871622, model: 'lg-b' }, { seed: 3526716711, model: 'lg-c' },
            { seed: 2971378133, model: 'lg-b' }, { seed: 287526601, model: 'lg-c' },
        ];
        for (const landmark of landmarks) {
            const selected = placements.filter(placement => placement.building.seed === landmark.seed);
            expect(selected).toHaveLength(1);
            const { building, model, scale } = selected[0];
            expect(model).toBe(landmark.model);
            const size = models.find(candidate => candidate.id === model)!.size;
            habitatPoint(building.arc, HABITAT_GROUND_Y, building.axial, transform.position);
            habitatOrientation(building.arc, transform.quaternion).multiply(yaw.setFromAxisAngle(up, building.yaw));
            transform.scale.setScalar(scale); transform.updateMatrix();
            const localEye = eye.clone().applyMatrix4(transform.matrix.clone().invert());
            const alongZ = Math.abs(localEye.z) / size.z > Math.abs(localEye.x) / size.x;
            const sign = Math.sign(alongZ ? localEye.z : localEye.x);
            let visible = 0;
            for (const height of [.55, .7, .82, .9]) for (const lateral of [-.32, 0, .32]) {
                const target = (alongZ ? new THREE.Vector3(lateral * size.x, height * size.y, sign * size.z / 2)
                    : new THREE.Vector3(sign * size.x / 2, height * size.y, lateral * size.z)).applyMatrix4(transform.matrix);
                const direction = target.clone().sub(eye), distance = direction.length();
                // First exit from the room must pass the side glazing or either rear pane,
                // with a margin from the floor/ceiling and outside the central rear door.
                const sideExit = 9 / Math.abs(direction.x), rearExit = direction.z > 0 ? (11.4 - eye.z) / direction.z : Infinity;
                const exit = eye.clone().addScaledVector(direction, Math.min(sideExit, rearExit));
                if (exit.y <= .15 || exit.y >= 5.35 || (rearExit <= sideExit && Math.abs(exit.x) <= 1.2)) continue;
                ray.set(eye, direction.divideScalar(distance));
                const blocked = obstacles.some(obstacle => obstacle.seed !== building.seed
                    && ray.intersectBox(obstacle.bounds, hit) !== null && hit.distanceTo(eye) < distance - .5);
                if (!blocked) visible++;
            }
            expect(visible, `Landmark ${model} / ${building.seed} has no readable upper facade`).toBeGreaterThanOrEqual(3);
        }
    });

    it('places the actual kit above the window sill and across both side and rear views', () => {
        const models = kit.buildings.map(model => ({ id: model.id, size: new THREE.Vector3(model.size.width, model.size.height, model.size.depth) }));
        const placements = planNeoCity(createCityLayout(CITY_LOCAL_BOUNDS, { density: 'local' }), models);
        expect(placements).toHaveLength(40);
        expect(new Set(placements.map(placement => placement.model)).size).toBe(8);
        let windowRoofs = 0;
        for (const placement of placements) {
            const model = models.find(model => model.id === placement.model)!;
            const top = habitatPoint(placement.building.arc, HABITAT_GROUND_Y + model.size.y * placement.scale, placement.building.axial);
            if (Math.atan2(top.y - 1.6, Math.hypot(top.x, top.z)) > -.14) windowRoofs++;
        }
        expect(windowRoofs).toBeGreaterThanOrEqual(36);
        const parcels = placements.map(placement => placement.building);
        expect(parcels.filter(b => b.arc < -b.axial * 1.25).length).toBeGreaterThanOrEqual(8);
        expect(parcels.filter(b => b.arc > b.axial * 1.25).length).toBeGreaterThanOrEqual(8);
        expect(parcels.filter(b => b.axial > 350 && Math.abs(b.arc) <= b.axial * .7 && Math.abs(b.arc) >= b.axial * .18).length).toBeGreaterThanOrEqual(16);
    });

    it('replaces a bounded, varied set of real parcels without extending into streets or the residence', () => {
        const buildings = createCityLayout(CITY_LOCAL_BOUNDS, { density: 'local' });
        const originalOrder = buildings.map(building => building.seed);
        const placements = planNeoCity(buildings, NEO_CITY_FIXTURE_MODELS);
        expect(placements).toHaveLength(NEO_CITY_BUILDING_LIMIT);
        expect(new Set(placements.map(placement => placement.model)).size).toBe(8);
        expect(new Set(placements.map(placement => placement.building.seed)).size).toBe(placements.length);
        expect(buildings.map(building => building.seed)).toEqual(originalOrder);
        expect(planNeoCity(buildings, NEO_CITY_FIXTURE_MODELS)).toEqual(placements);
        for (const { building, model, scale } of placements) {
            const size = NEO_CITY_FIXTURE_MODELS.find(candidate => candidate.id === model)!.size;
            expect(scale).toBeGreaterThan(0);
            expect(size.x * scale).toBeLessThanOrEqual(building.width);
            expect(size.z * scale).toBeLessThanOrEqual(building.depth);
            expect(size.y * scale).toBeLessThanOrEqual(building.height);
            const footprint = cityBuildingBounds({ ...building, width: size.x * scale, depth: size.z * scale });
            const envelope = cityBuildingBounds(building);
            expect(footprint.arcMin).toBeGreaterThanOrEqual(envelope.arcMin);
            expect(footprint.arcMax).toBeLessThanOrEqual(envelope.arcMax);
            expect(footprint.axialMin).toBeGreaterThanOrEqual(envelope.axialMin);
            expect(footprint.axialMax).toBeLessThanOrEqual(envelope.axialMax);
            expect(footprint.arcMax <= CITY_ROOM_CLEARANCE.arcMin || footprint.arcMin >= CITY_ROOM_CLEARANCE.arcMax
                || footprint.axialMax <= CITY_ROOM_CLEARANCE.axialMin || footprint.axialMin >= CITY_ROOM_CLEARANCE.axialMax).toBe(true);
        }
        expect(planNeoCity([parcel({ width: 10 }), parcel({ height: 20 }), parcel({ axial: 20_000 })], NEO_CITY_FIXTURE_MODELS)).toEqual([]);
    });

    it('preserves uniform scale, orientation and position across high and medium geometry with hysteresis', () => {
        const building = parcel(), city = makeCity([building]);
        expect(city.placements).toHaveLength(1);
        const placement = city.placements[0], model = NEO_CITY_FIXTURE_MODELS.find(model => model.id === placement.model)!;
        const base = habitatPoint(building.arc, HABITAT_GROUND_Y, building.axial);
        const orientation = habitatOrientation(building.arc).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), building.yaw));
        const center = new THREE.Vector3(0, model.size.y * placement.scale / 2, 0).applyQuaternion(orientation).add(base);
        const at = (distance: number, level: number) => {
            city.update(aim(center.clone().add(new THREE.Vector3(0, 0, distance)), center));
            const visible = instanceMeshes(city.group).filter(mesh => mesh.visible);
            expect(visible).toHaveLength(1);
            expect(visible[0].name).toBe(`neo-${model.id}-${level}-facade`);
            expect(visible[0].count).toBe(1);
            expect(city.group.userData.visibleBuildingCount).toBe(1);
            const matrix = new THREE.Matrix4(); visible[0].getMatrixAt(0, matrix);
            const position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
            matrix.decompose(position, quaternion, scale);
            expect(position.distanceTo(center)).toBeLessThan(.001);
            expect(Math.abs(quaternion.dot(orientation))).toBeCloseTo(1, 6);
            expect(scale.x).toBeCloseTo(placement.scale, 6);
            expect(scale.y).toBeCloseTo(scale.x, 6); expect(scale.z).toBeCloseTo(scale.x, 6);
            return matrix;
        };
        const high = at(NEO_CITY_DETAIL_DISTANCE * .8, 0);
        const medium = at(NEO_CITY_DETAIL_DISTANCE * 1.1, 1);
        expect(medium.elements).toEqual(high.elements);
        at(NEO_CITY_DETAIL_DISTANCE * .95, 1);
        at(NEO_CITY_DETAIL_DISTANCE * .89, 1);
        expect(at(NEO_CITY_DETAIL_DISTANCE * .87, 0).elements).toEqual(high.elements);
    });

    it('culls individual buildings before filling reusable shared batches, including an empty view', () => {
        // Only the smallest model fits these parcels, so both residents share the same GPU batch.
        const buildings = [parcel({ arc: -250, width: 23, depth: 19, height: 70.1 }), parcel({ arc: 250, width: 23, depth: 19, height: 70.1, seed: 72 })];
        const city = makeCity(buildings), meshes = instanceMeshes(city.group);
        expect(city.placements).toHaveLength(2);
        expect(city.placements[0].model).toBe(city.placements[1].model);
        const buffers = meshes.map(mesh => mesh.instanceMatrix.array);
        const centre = (index: number) => {
            const placement = city.placements[index], model = NEO_CITY_FIXTURE_MODELS.find(model => model.id === placement.model)!;
            return new THREE.Vector3(0, model.size.y * placement.scale / 2, 0).applyQuaternion(habitatOrientation(placement.building.arc))
                .add(habitatPoint(placement.building.arc, HABITAT_GROUND_Y, placement.building.axial));
        };
        for (const target of [centre(0), centre(1), centre(0)]) {
            const camera = aim(target.clone().add(new THREE.Vector3(0, 0, 600)), target, 8);
            city.update(camera);
            expect(city.group.userData.visibleBuildingCount).toBe(1);
            expect(meshes.reduce((total, mesh) => total + mesh.count, 0)).toBe(1);
            camera.lookAt(camera.position.clone().add(new THREE.Vector3(0, 0, 1000))); camera.updateMatrixWorld(true);
            city.update(camera);
            expect(city.group.userData.visibleBuildingCount).toBe(0);
            expect(meshes.every(mesh => !mesh.visible && mesh.count === 0)).toBe(true);
        }
        city.group.position.set(1200, 60, -1000); city.group.rotation.set(.2, .7, .1); city.group.updateMatrixWorld(true);
        const transformedTarget = centre(0).applyMatrix4(city.group.matrixWorld);
        city.update(aim(transformedTarget.clone().add(new THREE.Vector3(0, 0, 600)), transformedTarget, 8));
        expect(city.group.userData.visibleBuildingCount).toBe(1);
        expect(meshes.reduce((total, mesh) => total + mesh.count, 0)).toBe(1);
        meshes.forEach((mesh, index) => expect(mesh.instanceMatrix.array).toBe(buffers[index]));
        for (const mesh of meshes) {
            const sourceMeshes: THREE.Mesh[] = [];
            city.source.traverse(child => { if (child instanceof THREE.Mesh) sourceMeshes.push(child); });
            expect(sourceMeshes.some(source => source.geometry === mesh.geometry && source.material === mesh.material)).toBe(true);
        }
    });

    it('rejects missing kit levels and unusable model dimensions', () => {
        const source = createNeoCityFixture(); sources.push(source);
        source.remove(source.getObjectByName('md-c-medium')!);
        expect(() => createNeoCity(source, [parcel()])).toThrow('md-c');
        const flat = createNeoCityFixture(); sources.push(flat);
        flat.getObjectByName('lg-a-core-high')!.scale.y = 0;
        expect(() => createNeoCity(flat, [parcel()])).toThrow('尺寸无效');
    });
});
