import { solarTexture } from '../../content/solar';
import { geographicUV, terrainElevation } from '../../simulation/terrain';
import { add, cross, length, mix, scale, sub, surfacePosition, unit, type Vec3 } from './math';
import { updateObjects, type NativeLine, type NativeMesh } from './bridge';
import type { SurfaceDraft } from '../../simulation/types';
export function ring(id: string, center: Vec3, radius: number, color: string, width = .008): NativeLine {
    return { id, color, width, points: Array.from({ length: 129 }, (_, i) => add(center, [Math.cos(i * Math.PI / 64) * radius, 0, Math.sin(i * Math.PI / 64) * radius])) };
}
export function ribbon(id: string, draft: SurfaceDraft, color: string, planetId: string, opacity = 1): NativeMesh {
    const points: Vec3[] = [];
    for (let i = 1; i < draft.points.length; i++) {
        const a = draft.points[i - 1], b = draft.points[i], count = Math.max(1, Math.ceil(length(sub(a, b)) / .0008));
        for (let j = 0; j < count; j++)
            points.push(unit(mix(a, b, j / count)));
    }
    points.push(draft.points.at(-1)!);
    const positions: number[] = [], normals: number[] = [], indices: number[] = [];
    points.forEach((n, i) => {
        const tangent = sub(points[Math.min(i + 1, points.length - 1)], points[Math.max(0, i - 1)]), side = scale(unit(cross(n, tangent)), draft.width / 2);
        positions.push(...surfacePosition(unit(add(n, side)), .00003, planetId), ...surfacePosition(unit(sub(n, side)), .00003, planetId));
        normals.push(...n, ...n);
        if (i)
            indices.push(i * 2 - 2, i * 2 - 1, i * 2, i * 2 - 1, i * 2 + 1, i * 2);
    });
    return { id, positions, normals, indices, color, opacity, unlit: true };
}
export function buildingCluster(id: string, draft: SurfaceDraft, progress: number, planetId: string): NativeMesh {
    const count = Math.min(180, Math.max(3, Math.ceil(draft.points.slice(1).reduce((sum, p, i) => sum + length(sub(p, draft.points[i])), 0) * 40000)));
    const positions: number[] = [], normals: number[] = [], indices: number[] = [];
    for (let i = 0; i < Math.floor(count * progress / 100); i++) {
        const fraction = (i + .5) / count * (draft.points.length - 1), index = Math.min(draft.points.length - 2, Math.floor(fraction));
        let n = unit(mix(draft.points[index], draft.points[index + 1], fraction - index));
        const tangent = sub(draft.points[index + 1], draft.points[index]), side = unit(cross(n, tangent));
        n = unit(add(n, scale(side, (i % 3 - 1) * draft.width * .25)));
        const east = scale(side, .0000125), north = scale(unit(cross(n, side)), .0000125), height = .00003 + .00005 * progress / 100 * (1 + i % 4), base = surfacePosition(n, .000035, planetId), offset = positions.length / 3;
        for (const z of [0, height])
            for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
                positions.push(...add(add(base, scale(n, z)), add(scale(east, a), scale(north, b))));
                normals.push(...n);
            }
        for (const [a, b, c, d] of [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7], [4, 5, 6, 7]])
            indices.push(offset + a, offset + b, offset + c, offset + a, offset + c, offset + d);
    }
    return { id, positions, normals, indices, color: '#b6c1c4' };
}
type Tile = {
    face: number;
    x: number;
    y: number;
    size: number;
    depth: number;
    children?: Tile[];
    id?: string;
};
const direction = (face: number, u: number, v: number): Vec3 => unit(([[1, u, v], [-1, u, v], [u, 1, v], [u, -1, v], [u, v, 1], [u, v, -1]] as Vec3[])[face]);
/** The geographic height field is shared with simulation; Unreal owns all GPU meshes and materials. */
export class NativeTerrain {
    private roots: Tile[] = Array.from({ length: 6 }, (_, face) => ({ face, x: -1, y: -1, size: 2, depth: 0 }));
    private created: NativeMesh[] = [];
    private removed: string[] = [];
    constructor(private planetId: string) { }
    private release(tile: Tile) { if (tile.id) {
        this.removed.push(tile.id);
        tile.id = undefined;
    } tile.children?.forEach(t => this.release(t)); tile.children = undefined; }
    private build(tile: Tile) {
        const positions: number[] = [], normals: number[] = [], uv: number[] = [], indices: number[] = [];
        for (let y = 0; y <= 8; y++)
            for (let x = 0; x <= 8; x++) {
                const n = direction(tile.face, tile.x + x / 8 * tile.size, tile.y + y / 8 * tile.size);
                const east = unit(cross(Math.abs(n[1]) < .99 ? [0, 1, 0] : [0, 0, 1], n)), north = unit(cross(n, east));
                const tangent = (axis: Vec3) => sub(surfacePosition(unit(add(n, scale(axis, .0005))), 0, this.planetId), surfacePosition(unit(sub(n, scale(axis, .0005))), 0, this.planetId));
                positions.push(...surfacePosition(n, 0, this.planetId));
                normals.push(...unit(cross(tangent(east), tangent(north))));
                uv.push(...geographicUV(n));
            }
        // Unwrap each tile across the date line, so the texture seam never smears across a continent.
        const us = uv.filter((_, i) => i % 2 === 0);
        if (Math.max(...us) - Math.min(...us) > .5)
            for (let i = 0; i < uv.length; i += 2)
                if (uv[i] < .5)
                    uv[i] += 1;
        for (let y = 0; y < 8; y++)
            for (let x = 0; x < 8; x++) {
                const a = y * 9 + x, b = a + 1, c = a + 9, d = c + 1;
                indices.push(a, b, c, b, d, c);
            }
        const border = [...Array.from({ length: 9 }, (_, i) => i), ...Array.from({ length: 8 }, (_, i) => (i + 1) * 9 + 8), ...Array.from({ length: 8 }, (_, i) => 79 - i), ...Array.from({ length: 7 }, (_, i) => (7 - i) * 9)];
        const offset = positions.length / 3;
        for (const i of border) {
            positions.push(...scale(positions.slice(i * 3, i * 3 + 3) as Vec3, 1 - Math.min(.006, tile.size * .012)));
            normals.push(...normals.slice(i * 3, i * 3 + 3));
            uv.push(...uv.slice(i * 2, i * 2 + 2));
        }
        for (let i = 0; i < border.length; i++) {
            const j = (i + 1) % border.length;
            indices.push(border[i], border[j], offset + i, border[j], offset + j, offset + i);
        }
        if ([1, 2, 5].includes(tile.face))
            for (let i = 0; i < indices.length; i += 3)
                [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
        tile.id = `tile:${tile.face}:${tile.depth}:${tile.x}:${tile.y}`;
        this.created.push({ id: tile.id, positions, normals, indices, uv, texture: solarTexture(this.planetId), color: solarTexture(this.planetId) ? '#ffffff' : terrainElevation(direction(tile.face, tile.x + tile.size / 2, tile.y + tile.size / 2), this.planetId) < -.003 ? '#163d59' : '#51754e' });
    }
    update(camera: Vec3) {
        const visit = (tile: Tile) => {
            const n = direction(tile.face, tile.x + tile.size / 2, tile.y + tile.size / 2), distance = length(sub(camera, surfacePosition(n, 0, this.planetId)));
            if (tile.depth < 2 || (tile.depth < 11 && distance < tile.size * (tile.children ? 3.5 : 3))) {
                if (tile.id) {
                    this.removed.push(tile.id);
                    tile.id = undefined;
                }
                tile.children ??= [0, 1, 2, 3].map(i => ({ face: tile.face, x: tile.x + i % 2 * tile.size / 2, y: tile.y + Math.floor(i / 2) * tile.size / 2, size: tile.size / 2, depth: tile.depth + 1 }));
                tile.children.forEach(visit);
            }
            else {
                tile.children?.forEach(t => this.release(t));
                tile.children = undefined;
                if (!tile.id)
                    this.build(tile);
            }
        };
        this.roots.forEach(visit);
        // Bound bridge payloads and game-thread work per message.
        for (let i = 0; i < this.created.length; i += 16)
            updateObjects(this.created.slice(i, i + 16));
        if (this.removed.length)
            updateObjects([], this.removed);
        this.created = [];
        this.removed = [];
    }
    dispose() { this.roots.forEach(t => this.release(t)); if (this.removed.length)
        updateObjects([], this.removed); }
}
