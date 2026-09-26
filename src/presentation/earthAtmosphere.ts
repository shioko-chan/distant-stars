import * as THREE from 'three';
import { SOLAR_KM_PER_UNIT } from '../content/solarSystem';

/** Thin spherical, single-Rayleigh-scattering approximation; all distances share the solar pass's units. */
export function createEarthAtmosphere(earthRadius: number, sunDirection: THREE.Vector3) {
    const outerRadius = earthRadius + 80 / SOLAR_KM_PER_UNIT;
    const material = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, premultipliedAlpha: true,
        uniforms: {
            planetRadius: { value: earthRadius },
            outerRadius: { value: outerRadius },
            scaleHeight: { value: 8 / SOLAR_KM_PER_UNIT },
            // Rayleigh extinction per kilometre, converted to inverse scene units.
            scattering: { value: new THREE.Vector3(.0058, .0135, .0331).multiplyScalar(SOLAR_KM_PER_UNIT) },
            sunDirection: { value: sunDirection.clone().normalize() },
            eyePosition: { value: new THREE.Vector3() },
        },
        vertexShader: `
            #include <common>
            #include <logdepthbuf_pars_vertex>
            varying vec3 vPosition;
            void main() {
                vPosition = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                #include <logdepthbuf_vertex>
            }
        `,
        fragmentShader: `
            #include <logdepthbuf_pars_fragment>
            uniform float planetRadius, outerRadius, scaleHeight;
            uniform vec3 scattering, sunDirection, eyePosition;
            varying vec3 vPosition;
            vec2 sphereInterval(vec3 origin, vec3 direction, float radius) {
                float b = dot(origin, direction);
                float discriminant = b * b - dot(origin, origin) + radius * radius;
                if (discriminant < 0.0) return vec2(1.0, -1.0);
                float root = sqrt(discriminant);
                return vec2(-b - root, -b + root);
            }
            float densityAt(vec3 p) {
                float altitude = max(length(p) - planetRadius, 0.0);
                // The upper 16 km gently close the numerical shell, with no visible hard edge.
                float fade = 1.0 - smoothstep(outerRadius - 2.0 * scaleHeight, outerRadius, length(p));
                return exp(-altitude / scaleHeight) * fade;
            }
            float sunlightDepth(vec3 p) {
                vec2 ground = sphereInterval(p, sunDirection, planetRadius);
                if (ground.y > 0.0 && ground.x > 0.0) return -1.0;
                float stepLength = max(sphereInterval(p, sunDirection, outerRadius).y, 0.0) / 4.0;
                float depth = 0.0;
                for (int j = 0; j < 4; j++) {
                    depth += densityAt(p + sunDirection * (float(j) + .5) * stepLength) * stepLength;
                }
                return depth;
            }
            void main() {
                #include <logdepthbuf_fragment>
                vec3 ray = normalize(vPosition - eyePosition);
                vec2 shell = sphereInterval(eyePosition, ray, outerRadius);
                float start = max(shell.x, 0.0);
                float end = shell.y;
                vec2 ground = sphereInterval(eyePosition, ray, planetRadius);
                if (ground.x > start && ground.y > ground.x) end = min(end, ground.x);
                if (end <= start) discard;
                float stepLength = (end - start) / 12.0;
                float viewDepth = 0.0;
                vec3 light = vec3(0.0);
                for (int i = 0; i < 12; i++) {
                    vec3 p = eyePosition + ray * (start + (float(i) + .5) * stepLength);
                    float segmentDepth = densityAt(p) * stepLength;
                    float sunDepth = sunlightDepth(p);
                    if (sunDepth >= 0.0) {
                        vec3 transmission = exp(-scattering * (viewDepth + .5 * segmentDepth + sunDepth));
                        light += transmission * segmentDepth;
                    }
                    viewDepth += segmentDepth;
                }
                float cosine = dot(ray, sunDirection);
                float phase = 3.0 * (1.0 + cosine * cosine) / (16.0 * 3.14159265);
                vec3 radiance = light * scattering * phase * 8.0;
                // Premultiplied linear radiance; mean extinction approximates background attenuation.
                // No Mie/multiple scattering, ozone absorption or cloud-volume integration.
                float opacity = 1.0 - dot(exp(-scattering * viewDepth), vec3(.2126, .7152, .0722));
                gl_FragColor = vec4(radiance, clamp(opacity, 0.0, 1.0));
            }
        `,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(outerRadius, 192, 128), material);
    mesh.name = 'earth-atmosphere';
    mesh.renderOrder = 3;
    const worldToLocal = new THREE.Matrix4();
    mesh.onBeforeRender = (_renderer, _scene, camera) => {
        worldToLocal.copy(mesh.matrixWorld).invert();
        material.uniforms.eyePosition.value.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(worldToLocal);
    };
    return mesh;
}
