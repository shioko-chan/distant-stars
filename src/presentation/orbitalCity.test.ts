import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createOrbitalCity, CITY_NEAR_LOD_METRES } from './orbitalCity';
import { HABITAT_GROUND_Y, HABITAT_RADIUS_M } from './habitatFrame';
import { CITY_LOCAL_BOUNDS, createCityLayout } from './cityLayout';
import { buildingMasses } from './cityMassing';
import { planNeoCity } from './neoCity';
import { createNeoCityFixture, NEO_CITY_FIXTURE_MODELS } from './neoCityFixture';

let city: ReturnType<typeof createOrbitalCity>;
const camera = new THREE.PerspectiveCamera(52, 16 / 9, .05, 150000);
const placeCamera = (position: THREE.Vector3, target: THREE.Vector3) => {
    camera.position.copy(position); camera.lookAt(target); camera.updateMatrixWorld(true);
};
const sector = (arc: number, axial: number) => city.group.getObjectByName(`urban-sector-${arc}-${axial}`) as THREE.LOD;

beforeAll(async () => {
    city = createOrbitalCity({ loadAsync: async () => new THREE.Texture() }, new Set(), () => false, async () => createNeoCityFixture());
    await city.ready;
});
afterAll(() => {
    const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    city.group.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        geometry.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            materials.add(material);
            for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
        }
        if (object instanceof THREE.InstancedMesh) object.dispose();
    });
    geometry.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); textures.forEach(value => value.dispose());
});

describe('continuous orbital city', () => {
    const chunk = (arc: number, axial: number) => city.group.getObjectByName(`urban-massing-${arc}-${axial}`) as THREE.Group;

    it('joins the full circumference and axial chunk boundaries without gaps', () => {
        city.group.updateMatrixWorld(true);
        const vertex = (group: THREE.Group, index: number) => {
            const ground = group.getObjectByName('urban-ground') as THREE.Mesh;
            return new THREE.Vector3().fromBufferAttribute(ground.geometry.getAttribute('position'), index).applyMatrix4(ground.matrixWorld);
        };
        // 48 arc steps and 2 axial steps: 49 vertices per row.
        expect(vertex(chunk(0, 1), 0).distanceTo(vertex(chunk(7, 1), 48))).toBeLessThan(.01);
        expect(vertex(chunk(3, 0), 98).distanceTo(vertex(chunk(3, 1), 0))).toBeLessThan(.01);
        for (const [arc, axial] of [[0, 0], [2, 1], [3, 0], [6, 1]]) {
            for (const index of [0, 24, 48, 73, 146]) {
                const position = vertex(chunk(arc, axial), index);
                expect(Math.hypot(position.x, position.y - HABITAT_RADIUS_M)).toBeCloseTo(HABITAT_RADIUS_M - HABITAT_GROUND_Y, 2);
            }
        }
    });

    it('points buildings toward the rotation axis on the far side as well as beside the room', () => {
        for (const [arc, axial] of [[0, 1], [2, 0], [3, 1], [6, 1]]) {
            const facade = chunk(arc, axial).getObjectByName('facade') as THREE.InstancedMesh;
            const matrix = new THREE.Matrix4(); facade.getMatrixAt(0, matrix); matrix.premultiply(facade.matrixWorld);
            const position = new THREE.Vector3().setFromMatrixPosition(matrix);
            const up = new THREE.Vector3(0, 1, 0).transformDirection(matrix);
            const inward = new THREE.Vector3(-position.x, HABITAT_RADIUS_M - position.y, 0).normalize();
            expect(up.dot(inward)).toBeGreaterThan(.999999);
            if (arc === 0) expect(position.y).toBeGreaterThan(HABITAT_RADIUS_M * 1.9);
        }
    });

    it('selects actual camera-distance LODs with hysteresis instead of flickering at thresholds', () => {
        const lod = sector(15, 4), target = lod.position.clone();
        const at = (distance: number) => {
            placeCamera(target.clone().add(new THREE.Vector3(0, 0, distance)), target);
            city.update(0, camera);
            expect(lod.visible).toBe(true);
            expect(lod.levels.filter(level => level.object.visible)).toHaveLength(1);
            return lod.getCurrentLevel();
        };
        expect(at(CITY_NEAR_LOD_METRES * .8)).toBe(0);
        expect(at(CITY_NEAR_LOD_METRES * 1.1)).toBe(1);
        expect(at(CITY_NEAR_LOD_METRES * .95)).toBe(1);
        expect(at(CITY_NEAR_LOD_METRES * .8)).toBe(0);
        // Beyond that, buildings stay real geometry at any distance: there is no flat stand-in level.
        expect(lod.levels).toHaveLength(2);
        expect(at(40_000)).toBe(1);
        // Every chunk always carries its buildings' massing, whatever the sector's dressing level.
        for (let arc = 0; arc < 8; arc++) for (let axial = 0; axial < 2; axial++)
            expect((chunk(arc, axial).getObjectByName('facade') as THREE.InstancedMesh).count).toBeGreaterThan(1000);
    });

    it('replaces procedural building masses at every local LOD instead of drawing the kit on top', () => {
        const buildings = createCityLayout(CITY_LOCAL_BOUNDS, { density: 'local' });
        const placements = planNeoCity(buildings, NEO_CITY_FIXTURE_MODELS);
        const replaced = new Set(placements.map(placement => placement.building.seed));
        const expectedMasses = buildings.filter(building => !replaced.has(building.seed)).flatMap(buildingMasses).length;
        const neighborhood = city.group.getObjectByName('local-neighborhood-lod') as THREE.LOD;
        const kit = city.group.getObjectByName('neo-city-neighborhood')!;
        expect(placements.length).toBeGreaterThan(0);
        expect(kit.userData.buildingCount).toBe(placements.length);
        expect(city.group.userData.neoCityBuildingCount).toBe(placements.length);
        expect(city.group.userData.localBuildingCount).toBe(buildings.length);
        for (const distance of [800, 5500]) {
            placeCamera(new THREE.Vector3(0, 0, distance), new THREE.Vector3(0, 0, 0));
            city.update(0, camera);
            const level = neighborhood.getCurrentLevel();
            expect(level).toBe(distance < 4500 ? 0 : 1);
            const facade = neighborhood.levels[level].object.getObjectByName('facade') as THREE.InstancedMesh;
            expect(facade.count).toBe(expectedMasses);
            expect(facade.count).toBeLessThan(buildings.flatMap(buildingMasses).length);
        }
    });

    it('keeps both residence views bounded, with the interior behind the Earth window', () => {
        // Count what the renderer would draw: visible objects that pass its frustum test.
        const measure = () => {
            let draws = 0, triangles = 0;
            const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
            city.group.updateMatrixWorld(true);
            city.group.traverseVisible(object => {
                if (!(object instanceof THREE.Mesh)) return;
                if (object.frustumCulled) {
                    const bounds = object instanceof THREE.InstancedMesh ? object.boundingSphere! : (object.geometry.computeBoundingSphere(), object.geometry.boundingSphere!);
                    if (!frustum.intersectsSphere(bounds.clone().applyMatrix4(object.matrixWorld))) return;
                }
                draws++;
                const copies = object instanceof THREE.InstancedMesh ? object.count : 1;
                triangles += copies * (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
            });
            return { draws, triangles };
        };
        const near = sector(15, 2), far = sector(15, 8);
        // The Earth window faces out through the endcap: the city lies behind it.
        placeCamera(new THREE.Vector3(0, 1.6, .6), new THREE.Vector3(0, 2.2, -30));
        city.update(0, camera);
        expect(near.visible).toBe(false); expect(far.visible).toBe(false);
        expect(measure().draws).toBeLessThan(60);
        // The inner windows look along the whole cylinder.
        placeCamera(camera.position, new THREE.Vector3(0, 2.2, 100)); city.update(0, camera);
        expect(near.visible).toBe(true); expect(far.visible).toBe(true);
        const inner = measure();
        expect(inner.draws).toBeLessThan(160);
        // Every building on the visible part of the ring is real geometry: there is no flat stand-in.
        expect(inner.triangles).toBeLessThan(3_000_000);
        expect(city.group.userData.preallocatedInstanceCount).toBeLessThan(320_000);
        let allocatedInstances = 0;
        city.group.traverse(object => { if (object instanceof THREE.InstancedMesh) allocatedInstances += object.instanceMatrix.count; });
        expect(allocatedInstances).toBeLessThan(320_000);
        expect(city.group.userData.lodSectorCount).toBe(321);
        expect(city.group.userData.activeLodCounts[1]).toBeGreaterThan(0);
        expect(city.group.userData.visibleBuildingCount).toBeGreaterThan(3000);
        for (const name of ['advert', 'neon', 'skybridge']) expect(city.group.getObjectByName(name)).toBeDefined();
        for (const name of ['near-endcap-inner', 'far-endcap-inner', 'rail-guideways', 'light-rail-cars', 'park-trees', 'vertical-farms'])
            expect(city.group.getObjectByName(name)).toBeDefined();
    });

    it('freezes traffic at a fixed timestamp without rebuilding GPU resources', () => {
        const ship = city.group.getObjectByName('flying-vehicles') as THREE.InstancedMesh;
        const geometry = ship.geometry, buffer = ship.instanceMatrix.array;
        city.update(17, camera); const snapshot = [...buffer];
        city.update(81, camera); expect([...buffer]).not.toEqual(snapshot);
        city.update(17, camera); expect([...buffer]).toEqual(snapshot);
        expect(ship.instanceMatrix.array).toBe(buffer); expect(ship.geometry).toBe(geometry);
    });
});
