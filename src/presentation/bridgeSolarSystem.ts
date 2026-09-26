import { MOON_RADIUS_KM, moonPositionFromEarth } from './moonOrbit';
import * as THREE from 'three';
import { ASTRONOMICAL_UNIT_KM, EARTH_BODY, SOLAR_BODIES, SOLAR_KM_PER_UNIT } from '../content/solarSystem';
import { CAMERA_START_POSITION } from './bridgeMotion';
import { createBridgeSky } from './bridgeSky';
import { createSolarGlare } from './solarGlare';
import { createEarthAtmosphere } from './earthAtmosphere';
import { EARTH_POSITION, EARTH_SIDEREAL_DAY_SECONDS, earthPositionFromStation, inertialOrientationFromStation, solarDiameterPixels, solarPositionFromStation } from './stationOrbit';

/** A separate astronomical pass keeps cabin metres out of the solar-system depth range. */
export function createBridgeSolarSystem(loader: THREE.TextureLoader, ownedTextures: Set<THREE.Texture>, isDisposed: () => boolean, onError: (message: string) => void) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, 1, 1, 10_000_000);
    const frame = new THREE.Group();
    frame.position.fromArray(EARTH_POSITION);
    scene.add(frame);
    const earthSystem = new THREE.Group();
    frame.add(earthSystem);
    const moon = new THREE.Group();
    moon.name = 'moon';
    frame.add(moon);
    moonPositionFromEarth(0, moon.position);
    const earthRadius = EARTH_BODY.radiusKm / SOLAR_KM_PER_UNIT;
    let earth: THREE.Mesh | undefined, clouds: THREE.Mesh | undefined;
    const cloudMap = { value: null as THREE.Texture | null };
    const cloudOffset = { value: 0 };
    // A restrained artistic exposure lift keeps the crescent's cloud bands readable.
    // Anchor it in the Earth frame: turning the player's head must not relight the planet.
    const observationDirection = new THREE.Vector3(.9, .25, .55).normalize();
    const observationDirectionWorld = { value: observationDirection.clone() };
    const observationFill = (strength: number) => `
        vec3 fillDirection = transformDirection(observationDirectionWorld, viewMatrix);
        float facing = max(dot(nonPerturbedNormal, fillDirection), 0.0);
        totalEmissiveRadiance += diffuseColor.rgb * (0.005 + ${strength} * pow(facing, 1.5));
    `;
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
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(body.radiusKm / SOLAR_KM_PER_UNIT, body.id === 'earth' ? 192 : 80, body.id === 'earth' ? 128 : 48), material);
        group.add(sphere);
        if (body.id === 'earth') {
            earth = sphere;
            texture.anisotropy = 8;
            material.onBeforeCompile = shader => {
                shader.uniforms.cloudShadowMap = cloudMap;
                shader.uniforms.cloudOffset = cloudOffset;
                shader.uniforms.observationDirectionWorld = observationDirectionWorld;
                shader.fragmentShader = 'uniform sampler2D cloudShadowMap; uniform float cloudOffset; uniform vec3 observationDirectionWorld;\n' + shader.fragmentShader;
                shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
                    #include <map_fragment>
                    float cloudShadow = texture2D(cloudShadowMap, vMapUv + vec2(cloudOffset + 0.0003, 0.0002)).g;
                    diffuseColor.rgb *= 1.0 - 0.18 * smoothstep(0.08, 0.7, cloudShadow);
                `);
                shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', observationFill(.18));
            };
            material.customProgramCacheKey = () => 'earth-fixed-exposure-cloud-shadow-v3';
            sphere.rotation.set(.1, -1.2, .13);
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

    const moonPromise = loadTexture('/textures/solar/moon_4k.webp').then(texture => {
        if (!texture) return;
        texture.anisotropy = 4;
        const sphere = new THREE.Mesh(
            new THREE.SphereGeometry(MOON_RADIUS_KM / SOLAR_KM_PER_UNIT, 96, 64),
            new THREE.MeshStandardMaterial({ map: texture, roughness: 1, metalness: 0 }),
        );
        // Map central longitude toward Earth; rotation follows the orbital frame.
        sphere.rotation.y = -Math.PI / 2;
        moon.add(sphere);
    });

    const cloudPromise = loadTexture('/textures/solar/earth_clouds.jpg', false).then(texture => {
        if (!texture) return;
        cloudMap.value = texture;
        texture.wrapS = THREE.RepeatWrapping;
        texture.anisotropy = 8;
        const material = new THREE.MeshStandardMaterial({
            color: '#ffffff', alphaMap: texture, bumpMap: texture, bumpScale: .0015,
            transparent: true, opacity: 1, roughness: 1, metalness: 0, depthWrite: false,
        });
        material.onBeforeCompile = shader => {
            shader.uniforms.observationDirectionWorld = observationDirectionWorld;
            shader.fragmentShader = 'uniform vec3 observationDirectionWorld;\n' + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace('#include <alphamap_fragment>', `
                vec2 cloudUV = vAlphaMapUv;
                float density = texture2D(alphaMap, cloudUV).g;
                // Optical-depth falloff retains the fine wisps and gives storm cores real opacity.
                float opticalDepth = 2.8 * pow(density, 1.2);
                diffuseColor.a *= 1.0 - exp(-opticalDepth);
                float sunwardDensity = texture2D(alphaMap, cloudUV + vec2(0.0003, 0.0002)).g;
                diffuseColor.rgb *= 1.0 - 0.14 * smoothstep(0.05, 0.4, sunwardDensity - density);
            `);
            shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', observationFill(.32));
        };
        material.customProgramCacheKey = () => 'earth-cloud-optical-depth-v3';
        clouds = new THREE.Mesh(new THREE.SphereGeometry(earthRadius + 8 / SOLAR_KM_PER_UNIT, 192, 128), material);
        clouds.name = 'earth-tropospheric-clouds';
        clouds.rotation.set(.1, -1.2, .13);
        clouds.renderOrder = 1;
        earthSystem.add(clouds);
    });
    earthSystem.add(createEarthAtmosphere(earthRadius, sunlight.position.clone().normalize()));

    const sky = createBridgeSky(scene, loader, ownedTextures, isDisposed);
    const cabinOrigin = new THREE.Vector3(...CAMERA_START_POSITION);
    const bodyPosition = new THREE.Vector3();
    const sunDirection = new THREE.Vector3();
    return {
        scene, camera, sunDirection,
        ready: Promise.all([...mainBodies, moonPromise, cloudPromise, sky.ready]),
        update(cabinCamera: THREE.PerspectiveCamera, seconds: number, delta: number, viewportHeight: number, pixelRatio = 1) {
            camera.position.copy(cabinCamera.position).sub(cabinOrigin).multiplyScalar(1 / (1_000 * SOLAR_KM_PER_UNIT));
            camera.quaternion.copy(cabinCamera.quaternion);
            camera.fov = cabinCamera.fov;
            camera.aspect = cabinCamera.aspect;
            camera.updateProjectionMatrix();
            earthPositionFromStation(seconds, frame.position);
            inertialOrientationFromStation(seconds, frame.quaternion);
            observationDirectionWorld.value.copy(observationDirection).applyQuaternion(frame.quaternion);
            moonPositionFromEarth(seconds, moon.position);
            moon.rotation.y = Math.atan2(-moon.position.x, -moon.position.z);
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
            const earthRotation = 2 * Math.PI / EARTH_SIDEREAL_DAY_SECONDS;
            if (earth) earth.rotation.y += delta * earthRotation;
            if (clouds) clouds.rotation.y += delta * earthRotation * 1.015;
            if (earth && clouds) cloudOffset.value = (clouds.rotation.y - earth.rotation.y) / (Math.PI * 2);
        },
    };
}
