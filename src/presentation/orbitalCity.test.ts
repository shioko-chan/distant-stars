import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createOrbitalCity, CITY_NEAR_LOD_METRES, CITY_FAR_LOD_METRES } from './orbitalCity';
import { HABITAT_GROUND_Y, HABITAT_RADIUS_M } from './habitatFrame';

let city: ReturnType<typeof createOrbitalCity>;
const camera = new THREE.PerspectiveCamera(52, 16 / 9, .05, 150000);
const placeCamera = (position: THREE.Vector3, target: THREE.Vector3) => {
    camera.position.copy(position); camera.lookAt(target); camera.updateMatrixWorld(true);
};
const sector = (arc: number, axial: number) => city.group.getObjectByName(`urban-sector-${arc}-${axial}`) as THREE.LOD;

beforeAll(async () => {
    city = createOrbitalCity({ loadAsync: async () => new THREE.Texture() }, new Set(), () => false);
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
    it('joins the full circumference and axial sector boundaries without gaps', () => {
        const vertex = (lod: THREE.LOD, index: number) => {
            const mesh = lod.levels[2].object as THREE.Mesh;
            return new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'), index).applyMatrix4(lod.matrixWorld);
        };
        expect(vertex(sector(0, 5), 0).distanceTo(vertex(sector(31, 5), 12))).toBeLessThan(.01);
        expect(vertex(sector(15, 4), 26).distanceTo(vertex(sector(15, 5), 0))).toBeLessThan(.01);
        for (const [arc, axial] of [[0, 0], [8, 5], [15, 4], [24, 9]]) {
            const lod = sector(arc, axial);
            for (const index of [0, 6, 12, 26, 38]) {
                const position = vertex(lod, index);
                expect(Math.hypot(position.x, position.y - HABITAT_RADIUS_M)).toBeCloseTo(HABITAT_RADIUS_M - HABITAT_GROUND_Y, 2);
            }
        }
    });

    it('points buildings toward the rotation axis on the far side as well as beside the room', () => {
        for (const [arc, axial] of [[0, 5], [8, 4], [15, 4], [24, 5]]) {
            const lod = sector(arc, axial);
            const facade = lod.levels[0].object.getObjectByName('facade') as THREE.InstancedMesh;
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
        expect(at(CITY_FAR_LOD_METRES * 1.1)).toBe(2);
        expect(at(CITY_FAR_LOD_METRES * .95)).toBe(2);
        expect(at(CITY_FAR_LOD_METRES * .8)).toBe(1);
    });

    it('keeps the apartment view bounded while preserving city geometry behind and beside it', () => {
        placeCamera(new THREE.Vector3(0, 1.6, .6), new THREE.Vector3(0, 2.2, -30));
        city.update(0, camera);
        let draws = 0, triangles = 0;
        city.group.traverseVisible(object => {
            if (!(object instanceof THREE.Mesh)) return;
            draws++;
            const copies = object instanceof THREE.InstancedMesh ? object.count : 1;
            triangles += copies * (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3;
        });
        expect(draws).toBeLessThan(180);
        // Includes sectors retained at higher detail by the previous camera's hysteresis band.
        expect(triangles).toBeLessThan(550000);
        expect(city.group.userData.preallocatedInstanceCount).toBeLessThan(350000);
        expect(city.group.userData.lodSectorCount).toBe(321);
        expect(city.group.userData.activeLodCounts[2]).toBeGreaterThan(0);
        const front = sector(15, 2), rear = sector(15, 8);
        expect(front.visible).toBe(true); expect(rear.visible).toBe(false);
        placeCamera(camera.position, new THREE.Vector3(0, 2.2, 100)); city.update(0, camera);
        expect(front.visible).toBe(false); expect(rear.visible).toBe(true);
        expect(city.group.userData.visibleBuildingCount).toBeGreaterThan(800);
    });

    it('freezes traffic at a fixed timestamp without rebuilding GPU resources', () => {
        const ship = city.group.getObjectByName('orbital-shuttles') as THREE.InstancedMesh;
        const geometry = ship.geometry, buffer = ship.instanceMatrix.array;
        city.update(17, camera); const snapshot = [...buffer];
        city.update(81, camera); expect([...buffer]).not.toEqual(snapshot);
        city.update(17, camera); expect([...buffer]).toEqual(snapshot);
        expect(ship.instanceMatrix.array).toBe(buffer); expect(ship.geometry).toBe(geometry);
    });
});
