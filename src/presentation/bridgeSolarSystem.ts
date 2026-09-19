import * as THREE from 'three';
import { ASTRONOMICAL_UNIT_KM, EARTH_BODY, SOLAR_BODIES, SOLAR_KM_PER_UNIT } from '../content/solarSystem';
import { CAMERA_START_POSITION } from './bridgeMotion';
import { createBridgeSky } from './bridgeSky';
import { createSolarGlare } from './solarGlare';
import { EARTH_POSITION, inertialYawFromStation, solarDiameterPixels, solarPositionFromStation } from './stationOrbit';

/** A separate astronomical pass keeps cabin metres out of the solar-system depth range. */
export function createBridgeSolarSystem(loader: THREE.TextureLoader, ownedTextures: Set<THREE.Texture>, isDisposed: () => boolean, onError: (message: string) => void) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, 1, 1, 10_000_000);
    const frame = new THREE.Group();
    frame.position.fromArray(EARTH_POSITION);
    scene.add(frame);
    const earthSystem = new THREE.Group();
    frame.add(earthSystem);
    const earthRadius = EARTH_BODY.radiusKm / SOLAR_KM_PER_UNIT;
    const cloudTime = { value: 0 };
    let earth: THREE.Mesh | undefined, clouds: THREE.Mesh | undefined;
    const loadTexture = async (url: string, color = true) => {
        const texture = await loader.loadAsync(url);
        if (isDisposed()) { texture.dispose(); return; }
        ownedTextures.add(texture);
        if (color) texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    };

    // A single source at the visible Sun gives every planet its own phase and 1/r² lighting.
    const sunlight = new THREE.PointLight('#fff5e8', 2.6 * (ASTRONOMICAL_UNIT_KM / SOLAR_KM_PER_UNIT) ** 2, 0, 2);
    sunlight.position.copy(solarPositionFromStation(SOLAR_BODIES[0], 0)).sub(frame.position);
    frame.add(sunlight);
    const planets = SOLAR_BODIES.map(body => {
        const group = body.id === 'earth' ? earthSystem : new THREE.Group();
        group.name = body.id;
        group.position.copy(solarPositionFromStation(body, 0)).sub(frame.position);
        frame.add(group);
        return { body, group, requested: false };
    });
    const loadBody = async ({ body, group }: typeof planets[number]) => {
        if (body.id === 'sun') {
            const radius = body.radiusKm / SOLAR_KM_PER_UNIT;
            // The observing exposure washes out photospheric detail; no surface map is needed.
            group.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 80, 48),
                new THREE.MeshBasicMaterial({ color: new THREE.Color(24, 23.5, 22.5) })));
            group.add(createSolarGlare(radius, ownedTextures));
            return;
        }
        const texture = await loadTexture(`/textures/solar/${body.texture}.jpg`);
        if (!texture) return;
        const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 1, metalness: 0 });
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(body.radiusKm / SOLAR_KM_PER_UNIT, 80, 48), material);
        group.add(sphere);
        if (body.id === 'earth') {
            earth = sphere;
            sphere.rotation.set(.1, 1.6, .13);
        }
        if (body.id === 'saturn') {
            sphere.rotation.z = THREE.MathUtils.degToRad(26.73);
            // Main B and A rings, including the Cassini division, in kilometres.
            // https://nssdc.gsfc.nasa.gov/planetary/factsheet/satringfact.html
            for (const [inner, outer] of [[91_975, 117_507], [122_340, 136_780]]) {
                const rings = new THREE.Mesh(
                    new THREE.RingGeometry(inner / SOLAR_KM_PER_UNIT, outer / SOLAR_KM_PER_UNIT, 96),
                    new THREE.MeshStandardMaterial({ color: '#c4b498', roughness: 1, side: THREE.DoubleSide }),
                );
                rings.rotation.x = -Math.PI / 2;
                sphere.add(rings);
            }
        }
    };
    // Only the nearby Earth and resolvable Sun block entry. Unresolved planets cost no meshes/textures.
    const mainBodies = planets.filter(({ body }) => body.id === 'sun' || body.id === 'earth').map(planet => {
        planet.requested = true;
        return loadBody(planet);
    });

    const cloudPromise = loadTexture('/textures/solar/earth_clouds.jpg', false).then(texture => {
        if (!texture) return;
        texture.wrapS = THREE.RepeatWrapping;
        const material = new THREE.MeshStandardMaterial({
            color: '#f0f5ff', alphaMap: texture, transparent: true, opacity: .92,
            roughness: 1, metalness: 0, depthWrite: false,
        });
        material.onBeforeCompile = shader => {
            shader.uniforms.cloudTime = cloudTime;
            shader.fragmentShader = 'uniform float cloudTime;\n' + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace('#include <alphamap_fragment>', `
                vec2 cloudUV = vAlphaMapUv;
                float latitudeFade = sin(cloudUV.y * 3.14159265);
                cloudUV.x += .0035 * sin(cloudUV.y * 25.0 + cloudTime * .045) * latitudeFade;
                cloudUV.y += .0025 * sin(cloudUV.x * 37.6991118 + cloudTime * .03) * latitudeFade;
                float density = texture2D(alphaMap, cloudUV).g;
                float wisps = texture2D(alphaMap, cloudUV + vec2(cloudTime * .00012, 0.0)).g;
                diffuseColor.a *= smoothstep(.08, .85, mix(density, wisps, .22));
            `);
        };
        material.customProgramCacheKey = () => 'earth-drifting-clouds-v1';
        clouds = new THREE.Mesh(new THREE.SphereGeometry(earthRadius + 10 / SOLAR_KM_PER_UNIT, 80, 48), material);
        clouds.rotation.set(.1, 1.6, .13);
        earthSystem.add(clouds);
    });
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(earthRadius + 100 / SOLAR_KM_PER_UNIT, 64, 40), new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
        uniforms: { sunDirection: { value: sunlight.position.clone().normalize() } },
        vertexShader: `
            #include <common>
            #include <logdepthbuf_pars_vertex>
            varying vec3 vNormal;
            varying vec3 vSurfaceNormal;
            varying vec3 vView;
            void main() {
                vec4 p = modelViewMatrix * vec4(position, 1.0);
                vNormal = normalize(normalMatrix * normal);
                vSurfaceNormal = normal;
                vView = -p.xyz;
                gl_Position = projectionMatrix * p;
                #include <logdepthbuf_vertex>
            }`,
        fragmentShader: `
            #include <logdepthbuf_pars_fragment>
            uniform vec3 sunDirection;
            varying vec3 vNormal;
            varying vec3 vSurfaceNormal;
            varying vec3 vView;
            void main() {
                #include <logdepthbuf_fragment>
                float edge = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 3.2);
                // Both vectors use the Earth frame, so station rotation preserves illumination.
                float daylight = smoothstep(-0.12, 0.2, dot(normalize(vSurfaceNormal), sunDirection));
                gl_FragColor = vec4(0.12, 0.48, 1.0, edge * daylight * 0.75);
            }`,
    }));
    earthSystem.add(atmosphere);

    const sky = createBridgeSky(scene, loader, ownedTextures, isDisposed);
    const cabinOrigin = new THREE.Vector3(...CAMERA_START_POSITION);
    const bodyPosition = new THREE.Vector3();
    const sunDirection = new THREE.Vector3();
    return {
        scene, camera, sunDirection,
        ready: Promise.all([...mainBodies, cloudPromise, sky.ready]),
        update(cabinCamera: THREE.PerspectiveCamera, seconds: number, delta: number, viewportHeight: number, pixelRatio = 1) {
            camera.position.copy(cabinCamera.position).sub(cabinOrigin).multiplyScalar(1 / (1_000 * SOLAR_KM_PER_UNIT));
            camera.quaternion.copy(cabinCamera.quaternion);
            camera.fov = cabinCamera.fov;
            camera.aspect = cabinCamera.aspect;
            camera.updateProjectionMatrix();
            const yaw = inertialYawFromStation(seconds);
            frame.rotation.y = yaw;
            solarPositionFromStation(SOLAR_BODIES[0], seconds, sunDirection).sub(camera.position).normalize();
            for (const planet of planets) {
                if (planet.body.id === 'sun' || planet.body.id === 'earth') continue;
                const distance = solarPositionFromStation(planet.body, seconds, bodyPosition).distanceTo(camera.position);
                const radius = planet.body.id === 'saturn' ? 136_780 : planet.body.radiusKm;
                planet.group.visible = solarDiameterPixels(radius, distance, camera.fov, viewportHeight) >= 1;
                if (planet.group.visible && !planet.requested) {
                    planet.requested = true;
                    void loadBody(planet).catch(error => onError(`行星贴图加载失败：${error instanceof Error ? error.message : '请重试'}`));
                }
            }
            sky.update(seconds, pixelRatio);
            if (earth) earth.rotation.y += delta * .008;
            if (clouds) clouds.rotation.y += delta * .0105;
            cloudTime.value += delta;
        },
    };
}
