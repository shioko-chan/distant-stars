import * as THREE from 'three';

/** Hash and value noise shared by the procedural habitat surfaces. */
const NOISE = `
    float surfaceHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    float surfaceNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(surfaceHash(i), surfaceHash(i + vec2(1, 0)), f.x), mix(surfaceHash(i + vec2(0, 1)), surfaceHash(i + vec2(1)), f.x), f.y);
    }
    // Fades features narrower than a pixel to their average instead of letting them shimmer.
    float surfaceDetail(vec2 cells) { return 1.0 - smoothstep(.35, 1.0, max(fwidth(cells.x), fwidth(cells.y))); }
`;

/**
 * Patterns in metres over large surfaces. The snippet reads `vPatternUv` (the geometry uv),
 * `vPatternPosition` (local position) and `vPatternEdge`, and writes `patternColor` and `patternGlow`.
 */
export function useProceduralSurface(material: THREE.MeshStandardMaterial, key: string, pattern: string,
    uniforms: Record<string, THREE.IUniform> = {}, declarations = '') {
    const varyings = `
        varying vec3 vPatternPosition;
        varying vec2 vPatternUv;
        varying float vPatternEdge;
        ${declarations}
    `;
    material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>
                attribute float patternEdge;
                ${varyings}`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>
                vPatternPosition = position; vPatternUv = uv; vPatternEdge = patternEdge;`);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
                ${varyings}
                ${NOISE}`)
            .replace('#include <map_fragment>', `#include <map_fragment>
                vec3 patternColor = vec3(1.0), patternGlow = vec3(0.0);
                { ${pattern} }
                diffuseColor.rgb *= patternColor;`)
            .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
                totalEmissiveRadiance += patternGlow;`);
    };
    material.customProgramCacheKey = () => key;
    return material;
}

/** Geometries without a per-vertex edge attribute still need a value for the shared shader. */
export function withPatternEdge(geometry: THREE.BufferGeometry, edge?: number[]) {
    const count = geometry.getAttribute('position').count;
    geometry.setAttribute('patternEdge', new THREE.Float32BufferAttribute(edge ?? new Array(count).fill(0), 1));
    return geometry;
}
