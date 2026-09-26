import * as THREE from 'three';
import { mulberry32 } from '../simulation/rng';

export const WINDOW_BAY = 2.7;
export const FLOOR_HEIGHT = 4.2;
const PHOTO_BAYS = 8;
const LIT_BAYS = 32;
const ROOF_TILE_METRES = 12;

/** Sparse, subdued room lights sit inside the photographic windows rather than replacing them. */
function createRoomLights() {
    const size = 1024, cell = size / LIT_BAYS;
    const data = new Uint8Array(size * size * 4);
    const random = mulberry32(21947);
    const rooms = Array.from({ length: LIT_BAYS * LIT_BAYS }, () => ({
        occupied: random() > .86,
        warm: random() > .16,
        brightness: .18 + random() * .35,
        blinds: random() > .7,
    }));
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const room = rooms[Math.floor(y / cell) * LIT_BAYS + Math.floor(x / cell)];
        const px = x % cell, py = y % cell;
        // The photograph has an opaque spandrel at the bottom and a central mullion.
        const pane = px > 2 && px < 29 && py > 7 && py < 31 && px !== 16;
        const illumination = pane && room.occupied
            ? room.brightness * (.7 + .3 * py / cell) * (room.blinds && py % 4 === 0 ? .4 : 1)
            : 0;
        const tint = room.warm ? [243, 203, 147] : [138, 175, 187];
        const offset = (y * size + x) * 4;
        for (let channel = 0; channel < 3; channel++) data[offset + channel] = tint[channel] * illumination;
        data[offset + 3] = 255;
    }
    const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
}

/** Keep window dimensions fixed when instanced boxes have different dimensions and orientations. */
function useFacadeMetres(material: THREE.MeshStandardMaterial) {
    material.onBeforeCompile = shader => {
        const varyings = `
            varying vec3 vFacadePosition;
            varying vec3 vFacadeNormal;
            varying float vFacadeSeed;
        `;
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>' + varyings)
            .replace('#include <begin_vertex>', `#include <begin_vertex>
                vFacadePosition = position;
                vFacadeNormal = normal;
                vFacadeSeed = 0.0;
                #ifdef USE_INSTANCING
                    vec3 facadeScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
                    vFacadePosition = position * facadeScale;
                    vFacadePosition.y += dot(instanceMatrix[3].xyz, normalize(instanceMatrix[1].xyz));
                    vec2 facadeAnchor = vec2(dot(instanceMatrix[3].xyz, normalize(instanceMatrix[0].xyz)), instanceMatrix[3].z);
                    vec3 facadeHash = fract(facadeAnchor.xyx * .1031);
                    facadeHash += dot(facadeHash, facadeHash.yzx + 33.33);
                    vFacadeSeed = fract((facadeHash.x + facadeHash.y) * facadeHash.z);
                #endif
            `);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>' + varyings)
            .replace('#include <map_fragment>', `
                float facadeWall = 1.0 - step(.5, abs(vFacadeNormal.y));
                vec2 facadeMetres = vec2(abs(vFacadeNormal.x) > .5 ? vFacadePosition.z : vFacadePosition.x, vFacadePosition.y);
                vec2 facadeUv = facadeMetres / vec2(${WINDOW_BAY * PHOTO_BAYS}, ${FLOOR_HEIGHT * PHOTO_BAYS});
                facadeUv.x += floor(vFacadeSeed * ${PHOTO_BAYS}.0) / ${PHOTO_BAYS}.0;
                vec2 roomLightUv = facadeMetres / vec2(${WINDOW_BAY * LIT_BAYS}, ${FLOOR_HEIGHT * LIT_BAYS});
                roomLightUv.x += floor(vFacadeSeed * ${LIT_BAYS}.0) / ${LIT_BAYS}.0;
                vec2 pane = fract(facadeMetres / vec2(${WINDOW_BAY}, ${FLOOR_HEIGHT}));
                float glassPane = smoothstep(.035, .065, pane.x) * (1.0 - smoothstep(.935, .965, pane.x));
                glassPane *= smoothstep(.18, .22, pane.y) * (1.0 - smoothstep(.97, .995, pane.y));
                glassPane *= smoothstep(.008, .019, abs(pane.x - .5));
                ${THREE.ShaderChunk.map_fragment.replaceAll('vMapUv', 'facadeUv')}
                diffuseColor.rgb = mix(vec3(.033, .038, .041), diffuseColor.rgb, facadeWall);
            `)
            .replace('#include <emissivemap_fragment>', `
                ${THREE.ShaderChunk.emissivemap_fragment.replaceAll('vEmissiveMapUv', 'roomLightUv')}
                totalEmissiveRadiance *= facadeWall * glassPane * (.65 + .35 * vFacadeSeed);
            `)
            .replace('#include <roughnessmap_fragment>', `
                float roughnessFactor = mix(.96, mix(.82, .34 + .055 * vFacadeSeed, glassPane), facadeWall);
            `)
            .replace('#include <metalnessmap_fragment>', `
                float metalnessFactor = mix(.18, .02, glassPane) * facadeWall;
            `);
    };
    material.customProgramCacheKey = () => 'orbital-photographic-facade-v1';
}

/** The large structure slabs cover the facade's top: treat their top faces as mineral roofing. */
function useRoofMetres(material: THREE.MeshStandardMaterial) {
    const side = new THREE.Color('#68767d');
    material.onBeforeCompile = shader => {
        const varyings = `
            varying vec3 vStructurePosition;
            varying vec3 vStructureNormal;
            vec2 roofUv() { return vStructurePosition.xz / ${ROOF_TILE_METRES}.0; }
        `;
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>' + varyings)
            .replace('#include <begin_vertex>', `#include <begin_vertex>
                vStructurePosition = position;
                vStructureNormal = normal;
                #ifdef USE_INSTANCING
                    vStructurePosition *= vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
                #endif
            `);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>' + varyings)
            .replace('#include <map_fragment>', `
                float mineralRoof = step(.5, vStructureNormal.y);
                vec3 structureTint = diffuseColor.rgb;
                ${THREE.ShaderChunk.map_fragment.replaceAll('vMapUv', 'roofUv()')}
                diffuseColor.rgb = mix(structureTint * vec3(${side.r}, ${side.g}, ${side.b}), diffuseColor.rgb, mineralRoof);
            `)
            .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(.72, .94, mineralRoof);')
            .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = .22 * (1.0 - mineralRoof);')
            .replace('#include <bumpmap_pars_fragment>', THREE.ShaderChunk.bumpmap_pars_fragment.replaceAll('vBumpMapUv', 'roofUv()'))
            .replace('#include <normal_fragment_maps>', `if (mineralRoof > .5) {
${THREE.ShaderChunk.normal_fragment_maps}
}`);
    };
    material.customProgramCacheKey = () => 'orbital-mineral-roof-v1';
}

export function createCityMaterials(loader: Pick<THREE.TextureLoader, 'loadAsync'>, ownedTextures: Set<THREE.Texture>, isDisposed: () => boolean) {
    const emission = createRoomLights();
    ownedTextures.add(emission);
    const facade = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveMap: emission, emissiveIntensity: .27, metalness: .02, roughness: .7 });
    const structure = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .94, metalness: 0, bumpScale: .008 });
    useFacadeMetres(facade);
    useRoofMetres(structure);
    const load = async (url: string, apply: (texture: THREE.Texture) => void) => {
        const texture = await loader.loadAsync(url);
        if (isDisposed()) { texture.dispose(); return; }
        ownedTextures.add(texture);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.generateMipmaps = true;
        texture.anisotropy = 8;
        apply(texture);
    };
    const ready = Promise.all([
        load('/textures/city/curtain-wall.png', texture => { facade.map = texture; facade.needsUpdate = true; }),
        load('/textures/city/roof-mineral.png', texture => {
            structure.map = texture;
            // A shallow height cue from the mineral grain, never full-strength relief from the photo.
            structure.bumpMap = texture;
            structure.needsUpdate = true;
        }),
    ]).then(() => {});
    return { facade, structure, ready };
}
