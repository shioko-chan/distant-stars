import * as THREE from 'three';
import catalogue from '../content/skyStars.json';
import { inertialYawFromStation } from './stationOrbit';

const SKY_RADIUS = 8_000_000;
const initialLookup = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -Math.PI / 2, -.32));
const orbitAxis = new THREE.Vector3(0, 1, 0);

/** The same lookup rotation drives the diffuse panorama and the independent star directions. */
export function skyLookupFromStation(seconds: number, target = new THREE.Quaternion()) {
    return target.setFromAxisAngle(orbitAxis, -inertialYawFromStation(seconds)).premultiply(initialLookup);
}

export function createBridgeSky(scene: THREE.Scene, loader: THREE.TextureLoader, ownedTextures: Set<THREE.Texture>, isDisposed: () => boolean) {
    const positions: number[] = [], colors: number[] = [], magnitudes: number[] = [];
    const blue = new THREE.Color('#c9dcff'), white = new THREE.Color('#fff8ef'), amber = new THREE.Color('#ffd3a4');
    const color = new THREE.Color();
    for (const [, x, y, z, magnitude, bv] of catalogue.stars) {
        positions.push(x! * SKY_RADIUS, y! * SKY_RADIUS, z! * SKY_RADIUS);
        magnitudes.push(magnitude!);
        // B-V controls a restrained visual tint, not a claim of calibrated spectral rendering.
        const index = bv ?? .4;
        if (index < .4) color.copy(blue).lerp(white, THREE.MathUtils.clamp((index + .3) / .7, 0, 1));
        else color.copy(white).lerp(amber, THREE.MathUtils.clamp((index - .4) / 1.3, 0, 1));
        colors.push(color.r, color.g, color.b);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('magnitude', new THREE.Float32BufferAttribute(magnitudes, 1));
    const material = new THREE.ShaderMaterial({
        uniforms: { pixelRatio: { value: 1 } },
        vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `
            #include <common>
            #include <logdepthbuf_pars_vertex>
            uniform float pixelRatio;
            attribute float magnitude;
            varying vec3 starColor;
            varying float strength;
            void main() {
                starColor = color;
                strength = 1.1 * pow(10.0, -0.18 * (magnitude - 2.0));
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = (3.4 + max(0.0, 3.0 - magnitude) * 0.55) * pixelRatio;
                #include <logdepthbuf_vertex>
            }`,
        fragmentShader: `
            #include <logdepthbuf_pars_fragment>
            varying vec3 starColor;
            varying float strength;
            void main() {
                float r = length(gl_PointCoord - 0.5) * 2.0;
                if (r > 1.0) discard;
                #include <logdepthbuf_fragment>
                float core = exp(-r * r * 8.0);
                float halo = exp(-r * r * 5.0) * 0.035;
                gl_FragColor = vec4(starColor * strength * (core + halo), 1.0);
            }`,
    });
    const stars = new THREE.Points(geometry, material);
    stars.name = 'catalogue-stars';
    stars.frustumCulled = false;
    scene.add(stars);
    const lookup = new THREE.Quaternion();
    const ready = loader.loadAsync('/textures/sky/milky-way-diffuse-8k.webp').then(texture => {
        if (isDisposed()) { texture.dispose(); return; }
        ownedTextures.add(texture);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.background = texture;
        scene.backgroundIntensity = .5;
    });
    return {
        ready,
        update(seconds: number, pixelRatio: number) {
            skyLookupFromStation(seconds, lookup);
            // Three r173 negates the background's Euler components for texture lookup.
            scene.backgroundRotation.setFromQuaternion(lookup);
            scene.backgroundRotation.set(-scene.backgroundRotation.x, -scene.backgroundRotation.y, -scene.backgroundRotation.z);
            stars.quaternion.copy(lookup).invert();
            material.uniforms.pixelRatio.value = pixelRatio;
        },
    };
}
