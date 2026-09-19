import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { mulberry32 } from '../simulation/rng';
import { BRIDGE_MOTION_DURATION, sampleBridgeMotion, type BridgeMotionPhase } from './bridgeMotion';

interface SceneCallbacks {
    onReady: () => void;
    onError: (message: string) => void;
    onProgress: (loaded: number, total: number) => void;
    onPhase: (phase: BridgeMotionPhase) => void;
    onComplete: () => void;
}

function disposeObjects(objects: Iterable<THREE.Object3D>) {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const textures = new Set<THREE.Texture>();
    const images = new Set<ImageBitmap>();
    const skeletons = new Set<THREE.Skeleton>();
    for (const root of objects) root.traverse(object => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line || object instanceof THREE.Sprite)) return;
        geometries.add(object.geometry);
        (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => {
            materials.add(material);
            Object.values(material).forEach(value => { if (value instanceof THREE.Texture) textures.add(value); });
        });
        if (object instanceof THREE.SkinnedMesh) skeletons.add(object.skeleton);
    });
    skeletons.forEach(skeleton => skeleton.dispose());
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    textures.forEach(texture => {
        texture.dispose();
        if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) images.add(texture.image);
    });
    // Cloned props can share decoded images; closed bitmaps already have zero dimensions.
    images.forEach(image => { if (image.width > 0 && image.height > 0) image.close(); });
}

/** Owns the welcome scene only. The authoritative simulation remains in App. */
export function createBridgeScene(host: HTMLDivElement, callbacks: SceneCallbacks) {
    let disposed = false, failed = false, ready = false, elapsed = 0, lastTime = 0, transition = -1;
    let frame = 0, lastPhase: BridgeMotionPhase | undefined;
    const fail = (message: string) => { if (!disposed) { failed = true; cancelAnimationFrame(frame); callbacks.onError(message); } };
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor('#02050b');
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute('aria-label', '三维观景舰桥，黑猫站在落地舷窗前，右侧为中控台');
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, 1, .05, 350);
    const neutralRoom = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(neutralRoom, .04);
    scene.environment = environment.texture;
    scene.environmentIntensity = .35;
    neutralRoom.dispose();
    pmrem.dispose();
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .24, .5, 1.3);
    const output = new OutputPass();
    composer.addPass(bloom);
    composer.addPass(output);

    const hull = new THREE.MeshStandardMaterial({ color: '#899ca7', metalness: .68, roughness: .38 });
    const dark = new THREE.MeshStandardMaterial({ color: '#16232e', metalness: .7, roughness: .4 });
    const floorMaterial = new THREE.MeshStandardMaterial({ color: '#354650', metalness: .62, roughness: .28 });
    const light = new THREE.MeshStandardMaterial({ color: '#adeaff', emissive: '#76d3fb', emissiveIntensity: 3.6 });
    const warmLight = new THREE.MeshStandardMaterial({ color: '#ffe3ad', emissive: '#ffd18c', emissiveIntensity: 3 });
    const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, position: THREE.Vector3Tuple) => {
        const object = new THREE.Mesh(geometry, material);
        object.position.fromArray(position);
        object.castShadow = object.receiveShadow = material === hull || material === dark || material === floorMaterial;
        scene.add(object);
        return object;
    };
    const box = (size: THREE.Vector3Tuple, position: THREE.Vector3Tuple, material: THREE.Material = hull) => mesh(new THREE.BoxGeometry(...size), material, position);
    const beam = (from: THREE.Vector3Tuple, to: THREE.Vector3Tuple, width: number, depth: number, material = hull) => {
        const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
        const object = box([width, a.distanceTo(b), depth], a.clone().add(b).multiplyScalar(.5).toArray(), material);
        object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
        return object;
    };

    // A wide, architectural window: all props are on the interior side of the glass.
    box([19, .28, 23], [0, -.2, 0], floorMaterial);
    box([19, .38, 23], [0, 7.2, 0], dark);
    for (const side of [-1, 1]) {
        box([.6, 7.4, 23], [side * 9.3, 3.5, 0], dark);
        box([.05, .018, 17], [side * 1.75, -.048, .1], light);
        box([.045, .03, 17], [side * 6.7, -.04, .1], warmLight);
        box([.09, .045, 20], [side * 5, 6.94, 0], light);
        for (const z of [-7, -2, 3, 8]) {
            beam([side * 8.9, .1, z], [side * 7.4, 6.9, z], .24, .32, hull);
            beam([side * 8.69, .35, z], [side * 7.26, 6.7, z], .035, .045, light);
        }
    }
    for (let z = -9; z < 10; z += 1.7) {
        box([3.35, .032, 1.64], [0, -.038, z], dark);
        box([18, .016, .018], [0, -.04, z], dark);
        box([.16, .016, .2], [-1.4, -.016, z + .5], light);
        box([.16, .016, .2], [1.4, -.016, z + .5], light);
    }
    const rim: THREE.Vector3Tuple[] = [[-8.2, .05, -9], [-9, 1, -9], [-9, 5.7, -9], [-7.4, 7, -9], [7.4, 7, -9], [9, 5.7, -9], [9, 1, -9], [8.2, .05, -9]];
    for (let i = 0; i < rim.length; i++) {
        const a = rim[i], b = rim[(i + 1) % rim.length];
        beam(a, b, .5, .75, hull);
        beam([a[0], a[1], -8.57], [b[0], b[1], -8.57], .04, .04, light);
    }
    for (const side of [-1, 1]) {
        beam([side * 5.8, .18, -8.9], [side * 6.6, 6.92, -8.9], .2, .38, dark);
        beam([side * 5.7, .18, -8.68], [side * 6.5, 6.92, -8.68], .018, .025, light);
    }
    const glass = new THREE.MeshPhysicalMaterial({ color: '#9fc5de', metalness: .05, roughness: .06, transparent: true, opacity: .035, depthWrite: false, side: THREE.DoubleSide });
    mesh(new THREE.PlaneGeometry(17.6, 6.6), glass, [0, 3.5, -8.94]);
    box([18, .28, .65], [0, .02, -8.6], dark);

    scene.add(new THREE.HemisphereLight('#cee4ff', '#4b6671', 1.15));
    const key = new THREE.SpotLight('#e9f4ff', 70, 28, Math.PI / 3, .65, 1.4);
    key.position.set(1, 6.1, 3.5);
    key.target.position.set(.5, 0, -.5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -.0003;
    scene.add(key, key.target);
    const blueFill = new THREE.PointLight('#65baff', 46, 20, 1.6);
    blueFill.position.set(-4.5, 3.6, -6.5);
    const consoleLight = new THREE.PointLight('#81dffd', 16, 7, 1.3);
    consoleLight.position.set(2.3, 2.7, -2.3);
    scene.add(blueFill, consoleLight);
    const sun = new THREE.DirectionalLight('#ffe2b4', 2.6);
    sun.position.set(-18, 14, -7);
    sun.layers.set(1);
    camera.layers.enable(1);
    scene.add(sun);

    const random = mulberry32(81803), starPoints = new Float32Array(2200 * 3);
    for (let i = 0; i < starPoints.length; i += 3) {
        starPoints[i] = (random() - .5) * 250;
        starPoints[i + 1] = (random() - .5) * 150;
        starPoints[i + 2] = -25 - random() * 155;
    }
    const starsGeometry = new THREE.BufferGeometry();
    starsGeometry.setAttribute('position', new THREE.BufferAttribute(starPoints, 3));
    scene.add(new THREE.Points(starsGeometry, new THREE.PointsMaterial({ color: '#d3e5fc', size: .12, transparent: true, opacity: .85 })));

    const manager = new THREE.LoadingManager();
    manager.onProgress = (_url, loaded, total) => { if (!disposed) callbacks.onProgress(loaded, total); };
    const loader = new GLTFLoader(manager);
    const textureLoader = new THREE.TextureLoader(manager);
    const assets = new Set<THREE.Object3D>();
    const ownedTextures = new Set<THREE.Texture>();
    const loadModel = async (url: string) => {
        const gltf = await loader.loadAsync(url);
        if (disposed) disposeObjects([gltf.scene]);
        else assets.add(gltf.scene);
        return gltf;
    };
    let earth: THREE.Mesh | undefined, mixer: THREE.AnimationMixer | undefined;
    let cat: THREE.Group | undefined;
    const legBones: { bone: THREE.Bone; rest: THREE.Quaternion; direction: number }[] = [];
    const texturePromise = textureLoader.loadAsync('/textures/solar/earth_daymap.jpg').then(texture => {
        if (disposed) { texture.dispose(); return; }
        ownedTextures.add(texture);
        texture.colorSpace = THREE.SRGBColorSpace;
        earth = mesh(new THREE.SphereGeometry(11.5, 80, 48), new THREE.MeshStandardMaterial({ map: texture, roughness: .95, metalness: 0 }), [-13.4, -4.4, -39]);
        earth.layers.set(1);
        earth.rotation.set(.1, 1.6, .13);
        const atmosphere = mesh(new THREE.SphereGeometry(11.72, 64, 40), new THREE.ShaderMaterial({
            transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
            vertexShader: 'varying vec3 vNormal; varying vec3 vView; void main() { vec4 p = modelViewMatrix * vec4(position, 1.0); vNormal = normalize(normalMatrix * normal); vView = -p.xyz; gl_Position = projectionMatrix * p; }',
            fragmentShader: 'varying vec3 vNormal; varying vec3 vView; void main() { float edge = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 3.2); gl_FragColor = vec4(0.12, 0.48, 1.0, edge * 0.75); }',
        }), [-13.4, -4.4, -39]);
        atmosphere.castShadow = false;
    });

    const screenCanvas = document.createElement('canvas');
    screenCanvas.width = 1024; screenCanvas.height = 512;
    const ctx = screenCanvas.getContext('2d')!;
    ctx.fillStyle = '#041522'; ctx.fillRect(0, 0, 1024, 512);
    ctx.strokeStyle = '#255668'; ctx.lineWidth = 2;
    for (const r of [55, 95, 140]) { ctx.beginPath(); ctx.ellipse(330, 275, r * 1.4, r, -.24, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = '#c5e8e7'; ctx.font = '20px monospace'; ctx.fillText('DISTANT STARS  /  COMMAND', 40, 55);
    ctx.fillStyle = '#5da1b5'; ctx.font = '13px monospace'; ctx.fillText('NAVIGATION ARRAY     01', 40, 83);
    ctx.fillStyle = '#e4cf92'; ctx.beginPath(); ctx.arc(330, 275, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#9adbeb';
    for (const [x, y] of [[205, 230], [431, 301], [381, 166], [166, 377], [555, 324]]) { ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); }
    ctx.font = '15px monospace'; ctx.fillText('SOL', 352, 280);
    for (let i = 0; i < 6; i++) { ctx.fillStyle = '#163642'; ctx.fillRect(695, 135 + i * 43, 240, 7); ctx.fillStyle = '#7fc4d1'; ctx.fillRect(695, 135 + i * 43, 75 + random() * 160, 7); }
    ctx.fillStyle = '#7cb7c0'; ctx.font = '13px monospace'; ctx.fillText('LINK ESTABLISHED', 695, 105); ctx.fillText('2180   /   OBSERVATION DECK', 45, 473);
    const screenTexture = new THREE.CanvasTexture(screenCanvas); screenTexture.colorSpace = THREE.SRGBColorSpace; ownedTextures.add(screenTexture);
    const screenMaterial = new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false });
    const screen = mesh(new THREE.PlaneGeometry(1.44, .72), screenMaterial, [2.76, 1.91, -2.48]);
    screen.rotation.x = -.26;
    const screenFrame = box([1.54, .82, .055], [2.76, 1.91, -2.51], dark); screenFrame.rotation.x = -.26;
    const hologram = mesh(new THREE.RingGeometry(.24, .25, 64), new THREE.MeshBasicMaterial({ color: '#8de2f5', transparent: true, opacity: .6, side: THREE.DoubleSide }), [2.3, 1.23, -1.7]);
    hologram.rotation.x = -Math.PI / 2;

    const place = (gltf: GLTF, position: THREE.Vector3Tuple, scale: number, rotation = 0) => {
        const object = gltf.scene.clone(true);
        object.position.fromArray(position); object.scale.setScalar(scale); object.rotation.y = rotation;
        object.traverse(child => {
            if (!(child instanceof THREE.Mesh)) return;
            child.castShadow = child.receiveShadow = true;
        });
        scene.add(object);
        return object;
    };
    void Promise.all([
        loadModel('/models/cat/cat.glb'),
        loadModel('/models/bridge/table-inset.glb'),
        loadModel('/models/bridge/computer-wide.glb'),
        loadModel('/models/bridge/computer-system.glb'),
        loadModel('/models/bridge/chair-armrest-headrest.glb'),
        loadModel('/models/bridge/wall-detail.glb'),
        loadModel('/models/bridge/door-double-closed.glb'),
        texturePromise,
    ]).then(([catAsset, table, computer, station, chair, wall, door]) => {
        if (disposed || failed) return;
        const furnishedMaterials = new Set<THREE.MeshStandardMaterial>();
        for (const asset of [table, computer, station, chair, wall, door]) asset.scene.traverse(object => {
            if (object instanceof THREE.Mesh) for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
                if (material instanceof THREE.MeshStandardMaterial && !furnishedMaterials.has(material)) {
                    material.color.set('#8195a0'); material.metalness = .52; material.roughness = .4;
                    furnishedMaterials.add(material);
                }
            }
        });
        place(table, [2.3, .9, -2.5], 3);
        place(computer, [2.8, 1.065, -2.8], 1.6);
        place(station, [-4.4, 0, -4.6], 2.6, .32);
        place(station, [6.3, 0, -4.9], 2.6, -.35);
        place(chair, [-4.8, 0, -2.2], 2.1, Math.PI + .32);
        place(chair, [6.6, 0, -2.6], 2.1, Math.PI - .35);
        for (const z of [-6, -1, 4]) {
            place(wall, [-8.84, .35, z], 4.5, Math.PI / 2);
            place(wall, [8.84, .35, z], 4.5, -Math.PI / 2);
        }
        place(door, [-8.8, 0, 7], 5, Math.PI / 2);
        const catModel = catAsset.scene;
        const bounds = new THREE.Box3().setFromObject(catModel), center = bounds.getCenter(new THREE.Vector3());
        const modelScale = .78 / bounds.getSize(new THREE.Vector3()).y;
        catModel.scale.setScalar(modelScale);
        catModel.position.set(-center.x * modelScale, -bounds.min.y * modelScale, 0);
        catModel.traverse(object => {
            if (object instanceof THREE.Mesh) {
                object.castShadow = object.receiveShadow = true;
                for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
                    if (material instanceof THREE.MeshStandardMaterial && material.name === 'cat_diffuse') {
                        material.color.set('#242a34'); material.roughness = .86; material.metalness = 0;
                    }
                }
            }
            if (object instanceof THREE.Bone && /(?:FrontLeg_Hip|HindLeg_Hip)/.test(object.name)) {
                legBones.push({ bone: object, rest: object.quaternion.clone(), direction: object.name.includes('Front') ? 1 : -1 });
            }
        });
        cat = new THREE.Group(); cat.add(catModel); scene.add(cat);
        if (catAsset.animations[0]) {
            mixer = new THREE.AnimationMixer(catModel);
            mixer.clipAction(catAsset.animations[0]).play();
        }
        ready = true;
        callbacks.onReady();
    }).catch(error => {
        fail(`舰桥资源加载失败：${error instanceof Error ? error.message : '请检查网络后重试'}`);
    });

    const resize = () => {
        const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
        camera.aspect = width / height; camera.updateProjectionMatrix();
        renderer.setSize(width, height); composer.setSize(width, height);
    };
    const observer = new ResizeObserver(resize); observer.observe(host); resize();
    const pointer = new THREE.Vector2();
    const move = (event: PointerEvent) => { pointer.set((event.clientX / host.clientWidth - .5) * 2, (event.clientY / host.clientHeight - .5) * 2); };
    host.addEventListener('pointermove', move);
    const resetPointer = () => pointer.set(0, 0); host.addEventListener('pointerleave', resetPointer);
    const resetFrameTime = () => { lastTime = 0; };
    document.addEventListener('visibilitychange', resetFrameTime);
    const handleContextLoss = (event: Event) => { event.preventDefault(); fail('图形上下文已中断，请重新接入舰桥。'); };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLoss);
    const cameraTarget = new THREE.Vector3(), poseRotation = new THREE.Quaternion();
    const render = (now: number) => {
        if (disposed || failed) return;
        const wallDelta = lastTime ? (now - lastTime) / 1000 : 0;
        const delta = Math.min(wallDelta, .05);
        lastTime = now;
        if (!document.hidden) {
            elapsed += delta;
            if (transition >= 0) transition += wallDelta;
            const sample = sampleBridgeMotion(Math.max(0, transition));
            camera.position.fromArray(sample.cameraPosition);
            cameraTarget.fromArray(sample.cameraTarget);
            if (transition < 0 && !motionPreference.matches) {
                camera.position.x += pointer.x * .15;
                camera.position.y += Math.sin(elapsed * .3) * .025 - pointer.y * .06;
            }
            // Back away and reframe both subjects in portrait, rather than cropping the console.
            const portrait = THREE.MathUtils.clamp((1 - camera.aspect) / .55, 0, 1);
            camera.position.x += portrait * .8;
            camera.position.z += portrait * 2.4;
            cameraTarget.x += portrait * .6;
            camera.fov = sample.cameraFov + portrait * 20;
            camera.lookAt(cameraTarget); camera.updateProjectionMatrix();
            if (cat) {
                cat.position.fromArray(sample.catPosition);
                cat.rotation.set(sample.catPitch, sample.catYaw, 0);
                cat.scale.fromArray(sample.catScale);
                if (transition < 0 || transition > 1.6) {
                    mixer?.update(motionPreference.matches ? 0 : delta);
                } else {
                    mixer?.setTime(0);
                    const tuck = sample.phase === 'jumping' ? Math.sin((transition - .45) / .9 * Math.PI) : 0;
                    legBones.forEach(({ bone, rest, direction }) => { poseRotation.setFromAxisAngle(new THREE.Vector3(1, 0, 0), tuck * .45 * direction); bone.quaternion.copy(rest).multiply(poseRotation); });
                }
            }
            if (earth && !motionPreference.matches) earth.rotation.y += delta * .008;
            hologram.rotation.z += motionPreference.matches ? 0 : delta * .12;
            host.style.setProperty('--screen-blend', String(sample.screenBlend));
            if (transition >= 0 && lastPhase !== sample.phase) { lastPhase = sample.phase; callbacks.onPhase(sample.phase); }
            composer.render();
            if (transition >= BRIDGE_MOTION_DURATION) { transition = -1; callbacks.onComplete(); return; }
        }
        frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return {
        start() {
            if (!ready || disposed || failed || transition >= 0) return;
            if (motionPreference.matches) { callbacks.onComplete(); return; }
            transition = 0;
        },
        dispose() {
            disposed = true; cancelAnimationFrame(frame); observer.disconnect();
            host.removeEventListener('pointermove', move); host.removeEventListener('pointerleave', resetPointer);
            document.removeEventListener('visibilitychange', resetFrameTime);
            renderer.domElement.removeEventListener('webglcontextlost', handleContextLoss);
            mixer?.stopAllAction();
            if (mixer) mixer.uncacheRoot(mixer.getRoot());
            disposeObjects([scene, ...assets]);
            ownedTextures.forEach(texture => texture.dispose()); environment.dispose();
            key.shadow.dispose();
            bloom.dispose(); output.dispose(); composer.dispose(); renderer.dispose();
            renderer.domElement.remove();
        },
    };
}
