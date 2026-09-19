import catGait from '../content/catGait.json';
import { CAT_WALK_STRIDE, createCatWander } from './catWander';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { createBridgeSolarSystem } from './bridgeSolarSystem';
import { addCatFur } from './catFur';
import { mulberry32 } from '../simulation/rng';
import { LOUNGE_Z, BRIDGE_MOTION_DURATION, sampleBridgeMotion, type BridgeMotionPhase } from './bridgeMotion';

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
    let active = true;
    let disposed = false, failed = false, ready = false, lastTime = 0, transition = -1;
    let frame = 0, lastPhase: BridgeMotionPhase | undefined;
    const fail = (message: string) => { if (!disposed) { failed = true; cancelAnimationFrame(frame); callbacks.onError(message); } };
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setClearColor('#02050b');
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = .9;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute('aria-label', '银河中的起居室，长毛猫在房间里散步，窗外是按真实比例呈现的地球和太阳，阳光穿过玻璃照亮家具与地面');
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, 1, .05, 350);
    const neutralRoom = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environment = pmrem.fromScene(neutralRoom, .04);
    scene.environment = environment.texture;
    scene.environmentIntensity = .09;
    neutralRoom.dispose();
    pmrem.dispose();

    const random = mulberry32(81803);
    const ownedTextures = new Set<THREE.Texture>();
    const wood = new THREE.MeshStandardMaterial({ color: '#a99580', roughness: .7, normalScale: new THREE.Vector2(.3, .3) });
    const marble = new THREE.MeshStandardMaterial({ color: '#b4bac4', roughness: 1, metalness: 0, normalScale: new THREE.Vector2(.12, .12) });
    // Retain the stone's roughness variation while giving it a honed finish.
    marble.onBeforeCompile = shader => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = .48 + .25 * roughnessFactor;');
    };
    marble.customProgramCacheKey = () => 'honed-marble-v1';
    const fabric = new THREE.MeshPhysicalMaterial({ color: '#858b99', roughness: 1, normalScale: new THREE.Vector2(.55, .55), sheen: .65, sheenColor: '#b1b4bf', sheenRoughness: .9 });
    const dark = new THREE.MeshStandardMaterial({ color: '#292e32', roughness: .48, metalness: .25 });
    const plaster = new THREE.MeshStandardMaterial({ color: '#444955', roughness: .94 });
    const rug = new THREE.MeshStandardMaterial({ color: '#777d8a', roughness: 1, normalScale: new THREE.Vector2(.7, .7) });
    const warmLight = new THREE.MeshStandardMaterial({ color: '#fff0d1', emissive: '#ffca82', emissiveIntensity: 1.6 });
    let meshParent: THREE.Object3D = scene;
    const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, position: THREE.Vector3Tuple) => {
        const object = new THREE.Mesh(geometry, material);
        object.position.fromArray(position);
        object.castShadow = object.receiveShadow = true;
        meshParent.add(object); return object;
    };
    // BoxGeometry and RoundedBoxGeometry use six face groups in +/- X, Y, Z order.
    // Scale UVs in metres so broad tabletops and narrow legs share a grain size.
    const scaleFurnitureUVs = (geometry: THREE.BoxGeometry, size: THREE.Vector3Tuple) => {
        const uv = geometry.getAttribute('uv');
        const index = geometry.getIndex();
        const faceSizes = [[size[2], size[1]], [size[2], size[1]], [size[0], size[2]], [size[0], size[2]], [size[0], size[1]], [size[0], size[1]]];
        geometry.groups.forEach((group, face) => {
            const vertices = new Set<number>();
            for (let i = group.start; i < group.start + group.count; i++) vertices.add(index ? index.getX(i) : i);
            for (const i of vertices) uv.setXY(i, uv.getX(i) * faceSizes[face][0], uv.getY(i) * faceSizes[face][1]);
        });
        return geometry;
    };
    const box = (size: THREE.Vector3Tuple, position: THREE.Vector3Tuple, material: THREE.Material = wood) =>
        mesh(scaleFurnitureUVs(new THREE.BoxGeometry(...size), size), material, position);
    const soft = (size: THREE.Vector3Tuple, position: THREE.Vector3Tuple, material: THREE.Material = fabric, radius = .12) =>
        mesh(scaleFurnitureUVs(new RoundedBoxGeometry(...size, 4, radius), size), material, position);

    // Three glazed sides meet at slim corner posts; the rear wall has a real door opening.
    box([19, .2, 23], [0, -.14, 0], marble);
    box([19, .2, 23], [0, 7.2, 0], plaster);
    for (const side of [-1, 1]) {
        box([8.4, 7.4, .3], [side * 5.3, 3.5, 11.4], plaster);
    }
    box([2.2, 3.9, .3], [0, 5.25, 11.4], plaster);
    // Closed oak door, recessed into a dark frame, with a restrained warm lintel light.
    box([2.2, 3.3, .12], [0, 1.65, 11.4], dark);
    box([1.98, 3.14, .09], [0, 1.59, 11.3], wood);
    for (const x of [-1.06, 1.06]) box([.08, 3.3, .18], [x, 1.65, 11.27], dark);
    box([2.2, .08, .18], [0, 3.26, 11.27], dark);
    box([2.2, .035, .35], [0, .005, 11.27], dark);
    box([.055, .32, .07], [-.74, 1.45, 11.21], dark);
    box([.28, .045, .09], [-.63, 1.49, 11.15], dark);
    box([1.5, .025, .035], [0, 3.38, 11.22], warmLight);
    const doorLight = new THREE.PointLight('#ffd09a', 4, 4, 2);
    doorLight.position.set(0, 3.3, 10.65);
    scene.add(doorLight);
    const floorJoint = new THREE.MeshStandardMaterial({ color: '#282c33', roughness: .95 });
    // Large 1.2 × 2.4 m stone tiles with quiet, aligned 4 mm joints.
    for (let x = -9.5 + 1.2; x < 9.5; x += 1.2) box([.004, .004, 23], [x, -.038, 0], floorJoint);
    for (let z = -11.5 + 2.4; z < 11.5; z += 2.4) box([19, .004, .004], [0, -.038, z], floorJoint);
    for (const x of [-9, -5.8, 5.8, 9]) box([.09, 7.1, .16], [x, 3.5, -9], dark);
    box([18.2, .12, .2], [0, 7, -9], dark);
    box([18.2, .12, .2], [0, .02, -9], dark);
    // A faint unlit tint keeps cabin lights from appearing as star-like glass highlights.
    const glass = new THREE.MeshBasicMaterial({ color: '#bacddd', transparent: true, opacity: .015, depthWrite: false, side: THREE.DoubleSide });
    const frontGlass = mesh(new THREE.PlaneGeometry(18, 7), glass, [0, 3.5, -9]);
    frontGlass.castShadow = frontGlass.receiveShadow = false;
    for (const side of [-1, 1]) {
        const sideGlass = mesh(new THREE.PlaneGeometry(20.4, 7), glass, [side * 9, 3.5, 1.2]);
        sideGlass.rotation.y = Math.PI / 2;
        sideGlass.castShadow = sideGlass.receiveShadow = false;
        for (const z of [-3.9, 1.2, 6.3, 11.4]) box([.16, 7.1, .09], [side * 9, 3.5, z], dark);
        for (const y of [.02, 7]) box([.2, .12, 20.4], [side * 9, y, 1.2], dark);
    }

    const lounge = new THREE.Group();
    lounge.position.z = LOUNGE_Z;
    scene.add(lounge);
    meshParent = lounge;
    // Covers the full furniture footprint, including the lamp, with a clear border.
    soft([7.4, .025, 4.8], [-.6, -.012, -.8], rug, .01);
    // Furniture dimensions are metres: 2.2 m sofa with a 42 cm seat.
    soft([2.2, .22, .88], [-2, .22, -1.7], fabric, .06);
    soft([2.2, .62, .2], [-2, .57, -2.04], fabric, .06);
    for (const x of [-3.01, -.99]) soft([.18, .45, .9], [x, .415, -1.7], fabric, .06);
    for (const x of [-2.64, -2, -1.36]) {
        soft([.62, .12, .65], [x, .36, -1.64], fabric, .04);
        const cushion = soft([.61, .44, .14], [x, .6, -1.94], fabric, .045); cushion.rotation.x = -.12;
    }
    const pillow = soft([.38, .38, .12], [-2.65, .61, -1.76], new THREE.MeshStandardMaterial({ color: '#a96f4d', roughness: 1 }), .04);
    pillow.rotation.z = .24;
    for (const x of [-2.86, -1.14]) for (const z of [-2, -1.4]) box([.055, .11, .055], [x, .055, z], dark);
    soft([1.1, .06, .55], [-2, .42, -.55], wood, .025);
    for (const x of [-2.43, -1.57]) for (const z of [-.74, -.36]) box([.045, .39, .045], [x, .195, z], dark);
    box([.24, .025, .17], [-2.1, .463, -.55], plaster);
    box([.22, .02, .16], [-2.08, .485, -.56], dark);

    // 1.6 × .75 m desk: tabletop top matches the 75 cm landing height.
    soft([1.6, .06, .75], [1.1, .72, -1.1], wood, .025);
    for (const x of [.4, 1.8]) for (const z of [-1.39, -.81]) box([.055, .69, .055], [x, .345, z], dark);
    soft([.32, .012, .22], [1.57, .756, -1.03], dark, .005);
    const cup = mesh(new THREE.CylinderGeometry(.04, .035, .09, 32), new THREE.MeshStandardMaterial({ color: '#ded6c8', roughness: .4 }), [1.75, .795, -1.28]);
    const coffee = mesh(new THREE.CircleGeometry(.032, 32), new THREE.MeshBasicMaterial({ color: '#38261d' }), [cup.position.x, .841, cup.position.z]); coffee.rotation.x = -Math.PI / 2;
    soft([.5, .08, .48], [1.1, .41, -.15], fabric, .035);
    soft([.5, .46, .09], [1.1, .64, .06], fabric, .035);
    for (const x of [.92, 1.28]) for (const z of [-.32, .02]) box([.035, .37, .035], [x, .185, z]);

    // Warm reading lamp gives the room a domestic scale and lights the sofa.
    mesh(new THREE.CylinderGeometry(.22, .22, .04, 48), dark, [-3.5, .02, -1.9]);
    mesh(new THREE.CylinderGeometry(.015, .015, 1.45, 20), dark, [-3.5, .745, -1.9]);
    mesh(new THREE.CylinderGeometry(.18, .3, .32, 48, 1, true), new THREE.MeshStandardMaterial({ color: '#f1dfbf', emissive: '#ffcf8d', emissiveIntensity: .55, side: THREE.DoubleSide, roughness: 1 }), [-3.5, 1.6, -1.9]);
    const readingLight = new THREE.PointLight('#ffd09a', 8, 6, 1.5); readingLight.position.set(-3.5, 1.5, -1.9); lounge.add(readingLight);
    meshParent = scene;
    box([17.8, .025, .06], [0, 6.95, -8.8], warmLight);
    for (const side of [-1, 1]) {
        box([.06, .025, 20.2], [side * 8.8, 6.95, 1.3], warmLight);
    }

    scene.add(new THREE.HemisphereLight('#9ab8f0', '#302a30', .22));
    const key = new THREE.SpotLight('#bbcfff', 12, 28, Math.PI / 3, .65, 1.4);
    key.position.set(1, 6.1, LOUNGE_Z + 3.5);
    key.target.position.set(.5, 0, LOUNGE_Z - .5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -.0003;
    scene.add(key, key.target);
    const blueFill = new THREE.PointLight('#87acff', 18, 20, 1.6);
    blueFill.position.set(-4.5, 3.6, -6.5);
    const consoleLight = new THREE.PointLight('#81dffd', 16, 7, 1.3);
    consoleLight.position.set(1.42, 1.5, LOUNGE_Z - 1.28);
    scene.add(blueFill, consoleLight);
    const sun = new THREE.DirectionalLight('#fff5e8', 1.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -15;
    sun.shadow.camera.right = sun.shadow.camera.top = 15;
    sun.shadow.camera.near = .1;
    sun.shadow.camera.far = 100;
    sun.shadow.bias = -.0001;
    sun.shadow.normalBias = .015;
    scene.add(sun, sun.target);

    const manager = new THREE.LoadingManager();
    manager.onProgress = (_url, loaded, total) => { if (!disposed) callbacks.onProgress(loaded, total); };
    const loader = new GLTFLoader(manager);
    const textureLoader = new THREE.TextureLoader(manager);
    const furniturePromise = Promise.all([
        { material: wood, name: 'Wood048', tileSize: .8 },
        { material: marble, name: 'Marble006', tileSize: 2.4 },
        { material: fabric, name: 'Fabric045', tileSize: .5 },
        { material: rug, name: 'Carpet011', tileSize: 1 },
    ].map(async ({ material, name, tileSize }) => {
        await Promise.all((['Color', 'NormalGL', 'Roughness'] as const).map(async kind => {
            const texture = await textureLoader.loadAsync(`/textures/furniture/${name}_${kind}.webp`);
            if (disposed) { texture.dispose(); return; }
            ownedTextures.add(texture);
            texture.colorSpace = kind === 'Color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
            texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.setScalar(1 / tileSize);
            texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
            if (kind === 'Color') material.map = texture;
            else if (kind === 'NormalGL') material.normalMap = texture;
            else material.roughnessMap = texture;
            material.needsUpdate = true;
        }));
    }));
    const assets = new Set<THREE.Object3D>();
    const loadModel = async (url: string) => {
        const gltf = await loader.loadAsync(url);
        if (disposed) disposeObjects([gltf.scene]);
        else assets.add(gltf.scene);
        return gltf;
    };
    let orbitSeconds = 0;
    let mixer: THREE.AnimationMixer | undefined;
    let idleAction: THREE.AnimationAction | undefined, walkAction: THREE.AnimationAction | undefined;
    const wander = createCatWander();
    let walking = false;
    const setWalking = (next: boolean) => {
        if (!mixer || !idleAction || !walkAction) return;
        if (walking === next) return;
        walking = next;
        mixer.stopAllAction();
        (walking ? walkAction : idleAction).reset().play();
    };
    const walkPromise = new THREE.FileLoader(manager).loadAsync('/models/cat/walk.animation.json').then(data => THREE.AnimationClip.parse(JSON.parse(data as string)));
    let cat: THREE.Group | undefined;

    const solarSystem = createBridgeSolarSystem(textureLoader, ownedTextures, () => disposed, fail);
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(solarSystem.scene, solarSystem.camera));
    const cabinPass = new RenderPass(scene, camera);
    cabinPass.clear = false;
    cabinPass.clearDepth = true;
    composer.addPass(cabinPass);
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .12, .25, 2.2);
    const output = new OutputPass();
    composer.addPass(bloom);
    composer.addPass(output);

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
    const screenMaterial = new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    meshParent = lounge;
    const screen = mesh(new THREE.PlaneGeometry(.8, .4), screenMaterial, [1.42, 1.23, -1.28]);
    screen.rotation.x = -.26;

    const hologram = mesh(new THREE.RingGeometry(.12, .125, 64), new THREE.MeshBasicMaterial({ color: '#8de2f5', transparent: true, opacity: .6, side: THREE.DoubleSide }), [1.45, .77, -.96]);
    hologram.rotation.x = -Math.PI / 2;
    meshParent = scene;

    void Promise.all([loadModel('/models/cat/cat.glb'), solarSystem.ready, furniturePromise, walkPromise]).then(([catAsset, , , walkClip]) => {
        if (disposed || failed) return;
        const catModel = catAsset.scene;
        const bounds = new THREE.Box3().setFromObject(catModel), center = bounds.getCenter(new THREE.Vector3());
        // Measured in the GLB rest pose: paw floor to dorsal surface at the shoulder.
        // Excludes head and tail, which make the full bounding box taller.
        const modelScale = catGait.modelScale;
        catModel.scale.setScalar(modelScale);
        catModel.position.set(-center.x * modelScale, -bounds.min.y * modelScale, 0);
        catModel.traverse(object => {
            if (object instanceof THREE.Mesh) {
                object.castShadow = object.receiveShadow = true;
                for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
                    if (material instanceof THREE.MeshStandardMaterial && material.name === 'cat_diffuse') {
                        material.roughness = .9; material.metalness = 0;
                    }
                }
            }
        });
        ownedTextures.add(addCatFur(catModel));
        cat = new THREE.Group(); cat.add(catModel); scene.add(cat);
        if (catAsset.animations[0]) {
            mixer = new THREE.AnimationMixer(catModel);
            idleAction = mixer.clipAction(catAsset.animations[0]).play();
            walkAction = mixer.clipAction(walkClip);
        }
        ready = true;
        callbacks.onReady();
    }).catch(error => {
        fail(`起居室资源加载失败：${error instanceof Error ? error.message : '请检查网络后重试'}`);
    });

    const resize = () => {
        if (!active) return;
        const width = Math.max(1, host.clientWidth), height = Math.max(1, host.clientHeight);
        camera.aspect = width / height; camera.updateProjectionMatrix();
        renderer.setSize(width, height); composer.setSize(width, height);
    };
    const observer = new ResizeObserver(resize); observer.observe(host); resize();
    const pointer = new THREE.Vector2();
    const viewOffset = new THREE.Vector2();
    const returnFrom = new THREE.Vector2();
    const lastPointer = new THREE.Vector2();
    let dragId: number | undefined;
    let recenter = -1;
    const walkOffset = new THREE.Vector3(), walkReturnFrom = new THREE.Vector3();
    const walkDirection = new THREE.Vector3(), walkForward = new THREE.Vector3(), walkRight = new THREE.Vector3();
    const movementKeys = new Set<string>();
    const clearMovement = () => movementKeys.clear();
    const keyDown = (event: KeyboardEvent) => {
        if (!['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(event.code)) return;
        if (!active || !ready || transition >= 0 || recenter >= 0 || event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.target instanceof Element && event.target.closest('input, textarea, select, button, a, [contenteditable="true"]')) return;
        event.preventDefault();
        movementKeys.add(event.code);
    };
    const keyUp = (event: KeyboardEvent) => { movementKeys.delete(event.code); };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', clearMovement);
    const canvas = renderer.domElement;
    canvas.tabIndex = 0;
    canvas.style.outline = 'none';
    canvas.style.touchAction = 'none';
    canvas.style.cursor = 'grab';
    const down = (event: PointerEvent) => {
        if (!active || transition >= 0 || recenter >= 0 || event.button !== 0 || dragId !== undefined) return;
        canvas.focus({ preventScroll: true });
        dragId = event.pointerId;
        lastPointer.set(event.clientX, event.clientY);
        canvas.setPointerCapture(event.pointerId);
        canvas.style.cursor = 'grabbing';
    };
    const move = (event: PointerEvent) => {
        if (dragId !== event.pointerId || transition >= 0 || recenter >= 0) return;
        pointer.x -= (event.clientX - lastPointer.x) / Math.max(1, host.clientWidth) * Math.PI;
        pointer.y = THREE.MathUtils.clamp(pointer.y - (event.clientY - lastPointer.y) / Math.max(1, host.clientHeight) * Math.PI * .5, -Math.PI / 3, Math.PI / 3);
        lastPointer.set(event.clientX, event.clientY);
    };
    const up = (event: PointerEvent) => {
        if (event.pointerId !== dragId) return;
        dragId = undefined;
        if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
        canvas.style.cursor = 'grab';
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('lostpointercapture', up);
    const resetFrameTime = () => { lastTime = 0; clearMovement(); };
    document.addEventListener('visibilitychange', resetFrameTime);
    const handleContextLoss = (event: Event) => { event.preventDefault(); fail('图形上下文已中断，请重新进入起居室。'); };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLoss);
    const cameraTarget = new THREE.Vector3();
    const render = (now: number) => {
        if (!active || disposed || failed) return;
        const wallDelta = lastTime ? (now - lastTime) / 1000 : 0;
        const delta = Math.min(wallDelta, .05);
        lastTime = now;
        if (!document.hidden) {
            if (recenter >= 0) {
                recenter = Math.min(.65, recenter + delta);
                const t = recenter / .65;
                viewOffset.copy(returnFrom).multiplyScalar(1 - t * t * (3 - 2 * t));
                walkOffset.copy(walkReturnFrom).multiplyScalar(1 - t * t * (3 - 2 * t));
                if (recenter >= .65) { recenter = -1; transition = 0; pointer.set(0, 0); }
            } else if (transition >= 0) transition += wallDelta;
            const sample = sampleBridgeMotion(Math.max(0, transition));
            camera.position.fromArray(sample.cameraPosition);
            cameraTarget.fromArray(sample.cameraTarget);
            if (transition < 0 && recenter < 0) {
                viewOffset.lerp(pointer, motionPreference.matches ? 1 : 1 - Math.exp(-delta * 12));
            }
            // Back away and reframe both subjects in portrait, rather than cropping the console.
            const portrait = THREE.MathUtils.clamp((1 - camera.aspect) / .55, 0, 1);
            const portraitDistance = portrait * (1 - THREE.MathUtils.smoothstep(Math.max(0, transition), 0, 3.3));
            camera.position.x += portraitDistance * .8;
            camera.position.z += portraitDistance * 2.4;
            cameraTarget.x += portraitDistance * .6;
            camera.fov = sample.cameraFov + portrait * 20;
            camera.lookAt(cameraTarget);
            // Drag to look; WASD walks horizontally in the current viewing direction.
            camera.rotateY(viewOffset.x);
            camera.rotateX(viewOffset.y);
            if (transition < 0 && recenter < 0 && movementKeys.size) {
                camera.getWorldDirection(walkForward);
                walkForward.y = 0;
                walkForward.normalize();
                walkRight.set(-walkForward.z, 0, walkForward.x);
                const forward = Number(movementKeys.has('KeyW')) - Number(movementKeys.has('KeyS'));
                const sideways = Number(movementKeys.has('KeyD')) - Number(movementKeys.has('KeyA'));
                walkDirection.copy(walkForward).multiplyScalar(forward).addScaledVector(walkRight, sideways);
                if (walkDirection.lengthSq() > 0) walkOffset.addScaledVector(walkDirection.normalize(), delta * 3.6);
                // Keep the viewpoint inside the glass and rear wall.
                walkOffset.x = THREE.MathUtils.clamp(camera.position.x + walkOffset.x, -8.5, 8.5) - camera.position.x;
                walkOffset.z = THREE.MathUtils.clamp(camera.position.z + walkOffset.z, -8.5, 10.8) - camera.position.z;
            }
            camera.position.add(walkOffset);
            camera.updateProjectionMatrix();
            if (cat) {
                let animationDelta = delta;
                if (transition < 0) {
                    const roam = wander.update(delta, recenter < 0 && !motionPreference.matches);
                    cat.visible = true;
                    cat.position.set(roam.x, 0, roam.z);
                    cat.rotation.set(0, roam.yaw, 0);
                    setWalking(roam.moving);
                    if (roam.moving && walkAction) {
                        // Advance by actual distance, including partial final steps.
                        const travel = roam.distanceMoved || Math.abs(roam.turnMoved) * .09;
                        animationDelta = travel / CAT_WALK_STRIDE * walkAction.getClip().duration;
                    }
                } else {
                    setWalking(false);
                    cat.visible = sample.catVisible;
                    cat.position.fromArray(sample.catPosition);
                    cat.rotation.set(0, sample.catYaw, 0);
                }
                mixer?.update(motionPreference.matches ? 0 : animationDelta);
            }
            const exteriorDelta = motionPreference.matches ? 0 : delta;
            orbitSeconds += exteriorDelta;
            solarSystem.update(camera, orbitSeconds, exteriorDelta, host.clientHeight, renderer.getPixelRatio());
            sun.position.copy(solarSystem.sunDirection).multiplyScalar(40);
            screenMaterial.opacity = transition < 0 ? 0 : THREE.MathUtils.smoothstep(transition, 3.6, 4.5) * .85;
            consoleLight.intensity = 2 + screenMaterial.opacity * 10;
            hologram.visible = transition >= 3.6;
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
        setActive(next: boolean) {
            if (active === next || disposed) return;
            active = next;
            cancelAnimationFrame(frame);
            clearMovement(); lastTime = 0;
            if (dragId !== undefined && canvas.hasPointerCapture(dragId)) canvas.releasePointerCapture(dragId);
            dragId = undefined;
            if (active && !failed) {
                transition = -1; recenter = -1; lastPhase = undefined;
                pointer.set(0, 0); viewOffset.set(0, 0); walkOffset.set(0, 0, 0);
                canvas.style.cursor = 'grab';
                host.style.setProperty('--screen-blend', '0');
                resize();
                frame = requestAnimationFrame(render);
            }
        },
        start() {
            if (!ready || disposed || failed || transition >= 0 || recenter >= 0) return;
            setWalking(false);
            if (motionPreference.matches) { callbacks.onComplete(); return; }
            // Normalize yaw so returning always takes the shortest path, even after several turns.
            viewOffset.x = THREE.MathUtils.euclideanModulo(viewOffset.x + Math.PI, Math.PI * 2) - Math.PI;
            returnFrom.copy(viewOffset);
            walkReturnFrom.copy(walkOffset);
            clearMovement();
            recenter = 0;
            if (dragId !== undefined && canvas.hasPointerCapture(dragId)) canvas.releasePointerCapture(dragId);
            dragId = undefined;
            canvas.style.cursor = 'default';
        },
        dispose() {
            disposed = true; cancelAnimationFrame(frame); observer.disconnect();
            canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
            canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up);
            canvas.removeEventListener('lostpointercapture', up);
            window.removeEventListener('keydown', keyDown);
            window.removeEventListener('keyup', keyUp);
            window.removeEventListener('blur', clearMovement);
            document.removeEventListener('visibilitychange', resetFrameTime);
            renderer.domElement.removeEventListener('webglcontextlost', handleContextLoss);
            mixer?.stopAllAction();
            if (mixer) mixer.uncacheRoot(mixer.getRoot());
            disposeObjects([scene, solarSystem.scene, ...assets]);
            ownedTextures.forEach(texture => texture.dispose()); environment.dispose();
            key.shadow.dispose();
            sun.shadow.dispose();
            bloom.dispose(); output.dispose(); composer.dispose(); renderer.dispose();
            renderer.domElement.remove();
        },
    };
}
