import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PlanetTerrain, planetPosition } from './PlanetTerrain';

describe('planet terrain LOD', () => {
    it('refines near the surface with outward triangles and bounded leaf count', () => {
        const terrain = new PlanetTerrain(), camera = new THREE.PerspectiveCamera();
        camera.position.set(5, 3, 5); terrain.update(camera);
        const globalCount = terrain.group.children.length;
        expect(globalCount).toBe(96);
        for (const obj of terrain.group.children) {
            const geometry = (obj as THREE.Mesh).geometry;
            const positions = geometry.getAttribute('position'), indices = geometry.index!;
            const a = new THREE.Vector3().fromBufferAttribute(positions, indices.getX(0));
            const b = new THREE.Vector3().fromBufferAttribute(positions, indices.getX(1));
            const c = new THREE.Vector3().fromBufferAttribute(positions, indices.getX(2));
            expect(b.sub(a).cross(c.sub(a)).dot(a)).toBeGreaterThan(0);
        }
        const n = new THREE.Vector3(.3, .2, 1).normalize();
        camera.position.copy(planetPosition(n).addScaledVector(n, .006)); terrain.update(camera);
        expect(terrain.group.children.length).toBeGreaterThan(globalCount);
        expect(terrain.group.children.length).toBeLessThan(3000);
        camera.position.set(5, 3, 5); terrain.update(camera);
        expect(terrain.group.children.length).toBe(globalCount);
        terrain.dispose(); expect(terrain.group.children).toHaveLength(0);
    });
});
