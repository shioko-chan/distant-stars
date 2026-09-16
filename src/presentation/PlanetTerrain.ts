import { solarTexture } from '../content/solar';
import * as THREE from 'three';
import { terrainElevation } from '../simulation/terrain';
import type { SurfacePoint } from '../simulation/types';

export const planetPosition = (n: THREE.Vector3, lift = 0, planetId = "") => n.clone().multiplyScalar(1.8 + terrainElevation(n.toArray() as SurfacePoint, planetId) + lift);
type Tile = { face: number; x: number; y: number; size: number; depth: number; mesh?: THREE.Mesh; children?: Tile[] };

/** Cube-sphere quadtree. Simulation coordinates never depend on these render tiles. */
export class PlanetTerrain {
    readonly group = new THREE.Group();
    private readonly material = new THREE.MeshStandardMaterial({ roughness: .96 });
    private readonly roots: Tile[] = Array.from({ length: 6 }, (_, face) => ({ face, x: -1, y: -1, size: 2, depth: 0 }));
    private texture?: THREE.Texture;
    constructor(private readonly planetId = "") {
        if (solarTexture(planetId)) {
            this.texture = new THREE.TextureLoader().load(solarTexture(planetId)!);
            this.texture.colorSpace = THREE.SRGBColorSpace;
            this.texture.wrapS = THREE.RepeatWrapping;
        }
        // Evaluate surface colors per pixel so shorelines do not change with tile resolution.
        this.material.onBeforeCompile = shader => {
            shader.vertexShader = 'varying vec3 vPlanetDirection;\n' + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPlanetDirection = normalize(position);');
            if (this.texture) shader.uniforms.earthMap = { value: this.texture };
            shader.fragmentShader = (this.texture ? 'uniform sampler2D earthMap;\n' : '') + 'varying vec3 vPlanetDirection;\n' + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', this.texture ? `
                vec3 n = normalize(vPlanetDirection);
                vec2 uv = vec2(atan(-n.z,n.x)/6.28318530718+.5, asin(clamp(n.y,-1.,1.))/3.14159265359+.5);
                diffuseColor.rgb = texture2D(earthMap, uv).rgb;
            ` : `
                vec3 n = normalize(vPlanetDirection);
                float h = sin(n.x * 8.0 + n.z * 3.0) * cos(n.y * 7.0 - n.x * 2.0) * .035 + sin(n.z * 19.0 + n.y * 11.0) * .009;
                vec3 land = mix(vec3(.045,.12,.07), vec3(.19,.16,.10), smoothstep(.012,.028,h));
                vec3 surfaceColor = mix(vec3(.008,.028,.055), land, smoothstep(-.005,-.002,h));
                surfaceColor = mix(surfaceColor, vec3(.46,.58,.61), smoothstep(.88,.95,abs(n.y)));
                float grain = sin(n.x * 32000.0) * sin(n.y * 28000.0) * sin(n.z * 26000.0); diffuseColor.rgb = surfaceColor * (.97 + grain * .045);
            `);
        };
    }
    private normal(face: number, u: number, v: number) {
        return [new THREE.Vector3(1, u, v), new THREE.Vector3(-1, u, v), new THREE.Vector3(u, 1, v), new THREE.Vector3(u, -1, v), new THREE.Vector3(u, v, 1), new THREE.Vector3(u, v, -1)][face].normalize();
    }
    private groundNormal(n: THREE.Vector3) {
        const east = new THREE.Vector3(0, Math.abs(n.y) < .99 ? 1 : 0, Math.abs(n.y) < .99 ? 0 : 1).cross(n).normalize();
        const north = n.clone().cross(east).normalize();
        const tangent = (axis: THREE.Vector3) => planetPosition(n.clone().addScaledVector(axis,.0005).normalize(),0,this.planetId)
            .sub(planetPosition(n.clone().addScaledVector(axis,-.0005).normalize(),0,this.planetId));
        return tangent(east).cross(tangent(north)).normalize();
    }
    private build(tile: Tile) {
        const positions: number[] = [], normals: number[] = [], indices: number[] = [];
        const grid = 8;
        for (let y = 0; y <= grid; y++) for (let x = 0; x <= grid; x++) {
            const n = this.normal(tile.face, tile.x + x / grid * tile.size, tile.y + y / grid * tile.size);
            positions.push(...planetPosition(n, 0, this.planetId).toArray()); normals.push(...this.groundNormal(n).toArray());
        }
        for (let y = 0; y < grid; y++) for (let x = 0; x < grid; x++) {
            const a = y * (grid + 1) + x, b = a + 1, c = a + grid + 1, d = c + 1;
            indices.push(a, b, c, b, d, c);
        }
        // Skirts cover cracks between neighboring tile resolutions.
        const border = [...Array.from({ length: 9 }, (_, i) => i), ...Array.from({ length: 8 }, (_, i) => (i + 1) * 9 + 8), ...Array.from({ length: 8 }, (_, i) => 79 - i), ...Array.from({ length: 7 }, (_, i) => (7 - i) * 9)];
        const offset = positions.length / 3;
        for (const i of border) {
            const p = new THREE.Vector3(...positions.slice(i * 3, i * 3 + 3) as [number, number, number]).multiplyScalar(1 - Math.min(.006, tile.size * .012));
            positions.push(...p.toArray()); normals.push(...normals.slice(i * 3, i * 3 + 3));
        }
        for (let i = 0; i < border.length; i++) { const j = (i + 1) % border.length; indices.push(border[i], border[j], offset + i, border[j], offset + j, offset + i); }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        if ([1, 2, 5].includes(tile.face)) for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
        geometry.setIndex(indices);
        this.material.side = THREE.DoubleSide;
        const mesh = new THREE.Mesh(geometry, this.material);
        this.group.add(mesh); tile.mesh = mesh;
    }
    private release(tile: Tile) {
        if (tile.mesh) { this.group.remove(tile.mesh); tile.mesh.geometry.dispose(); tile.mesh = undefined; }
        tile.children?.forEach(t => this.release(t)); tile.children = undefined;
    }
    update(camera: THREE.PerspectiveCamera) {
        const visit = (tile: Tile) => {
            const n = this.normal(tile.face, tile.x + tile.size / 2, tile.y + tile.size / 2);
            const distance = camera.position.distanceTo(planetPosition(n, 0, this.planetId));
            const threshold = tile.size * (tile.children ? 3.5 : 3);
            if (tile.depth < 2 || (tile.depth < 11 && distance < threshold)) {
                if (tile.mesh) { this.group.remove(tile.mesh); tile.mesh.geometry.dispose(); tile.mesh = undefined; }
                tile.children ??= [0, 1, 2, 3].map(i => ({ face: tile.face, x: tile.x + i % 2 * tile.size / 2, y: tile.y + Math.floor(i / 2) * tile.size / 2, size: tile.size / 2, depth: tile.depth + 1 }));
                tile.children.forEach(visit);
            } else {
                tile.children?.forEach(t => this.release(t)); tile.children = undefined;
                if (!tile.mesh) this.build(tile);
            }
        };
        this.roots.forEach(visit);
    }
    dispose() { this.roots.forEach(t => this.release(t)); this.material.dispose(); this.texture?.dispose(); }
}
