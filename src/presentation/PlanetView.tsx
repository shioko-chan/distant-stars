import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ZONES } from '../content/catalog';
import type { WorldState } from '../simulation/types';
interface Props {
    world: WorldState;
    selected: number;
    onSelect: (id: number) => void;
    layer: 'terrain' | 'planning' | 'pollution';
}
function elevation(n: THREE.Vector3) { return Math.sin(n.x * 8 + n.z * 3) * Math.cos(n.y * 7 - n.x * 2) * .035 + Math.sin(n.z * 19 + n.y * 11) * .009; }
function surface(n: THREE.Vector3) { return n.clone().multiplyScalar(1.8 + elevation(n)); }
function normal(region: number, dx = 0, dy = 0) { const lat = -Math.PI / 3 + Math.floor(region / 4) * Math.PI / 3 + dy, lon = (region % 4) * Math.PI / 2 + dx; return new THREE.Vector3(Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)); }
export function PlanetView({ world, selected, onSelect, layer }: Props) {
    const host = useRef<HTMLDivElement>(null), callback = useRef(onSelect);
    callback.current = onSelect;
    const view = useRef<{
        update: (w: WorldState, s: number, l: Props['layer']) => void;
    } | undefined>(undefined);
    useEffect(() => {
        const root = host.current!, scene = new THREE.Scene();
        scene.background = new THREE.Color('#060e17');
        const camera = new THREE.PerspectiveCamera(42, 1, .05, 100);
        camera.position.set(5, 3, 5);
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        root.appendChild(renderer.domElement);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.minDistance = 2.3;
        controls.maxDistance = 10;
        scene.add(new THREE.AmbientLight('#b5d4ed', 2));
        const sun = new THREE.DirectionalLight('#fff3d0', 3);
        sun.position.set(5, 4, 6);
        scene.add(sun);
        const geometry = new THREE.SphereGeometry(1.8, 96, 64), position = geometry.getAttribute('position'), colors = [];
        for (let i = 0; i < position.count; i++) {
            const n = new THREE.Vector3().fromBufferAttribute(position, i).normalize(), p = surface(n);
            position.setXYZ(i, p.x, p.y, p.z);
            const h = elevation(n);
            const color = new THREE.Color(Math.abs(n.y) > .85 ? '#b9d7db' : h < -.005 ? '#163b59' : h > .02 ? '#777361' : '#3b7565');
            colors.push(color.r, color.g, color.b);
        }
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geometry.computeVertexNormals();
        const globe = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95 }));
        scene.add(globe);
        const overlays = new THREE.Group();
        scene.add(overlays);
        const parcelLayer = new THREE.Group();
        const clear = () => { overlays.traverse(obj => { const m = obj as THREE.Mesh; m.geometry?.dispose(); if (m.material)
            (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => x.dispose()); }); overlays.clear(); };
        const update = (w: WorldState, s: number, l: Props['layer']) => {
            clear();
            parcelLayer.clear();
            overlays.add(parcelLayer);
            for (const d of w.districts) {
                const n = normal(d.id), point = surface(n);
                const color = l === 'pollution' ? new THREE.Color().setHSL((1 - d.pollution / 100) * .33, .6, .45) : new THREE.Color(ZONES[d.zone].color);
                if (d.id === s)
                    for (let cell = 0; cell < 64; cell++) {
                        const x = cell % 8, y = Math.floor(cell / 8), vertices: number[] = [];
                        for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 0], [1, 1], [0, 1]]) {
                            const pt = surface(normal(d.id, -Math.PI / 4 + (x + u) * Math.PI / 16, -Math.PI / 6 + (y + v) * Math.PI / 24)).multiplyScalar(1.003);
                            vertices.push(pt.x, pt.y, pt.z);
                        }
                        const patch = new THREE.BufferGeometry();
                        patch.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
                        parcelLayer.add(new THREE.Mesh(patch, new THREE.MeshBasicMaterial({ color: ZONES[d.parcels[cell]].color, transparent: true, opacity: .28, side: THREE.DoubleSide, depthWrite: false })));
                    }
                const marker = new THREE.Mesh(new THREE.CircleGeometry(d.id === s ? .18 : .12, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: l === 'terrain' ? .25 : .7, side: THREE.DoubleSide }));
                marker.position.copy(point.clone().addScaledVector(n, .01));
                marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
                overlays.add(marker);
                if (d.id === s) {
                    const ring = new THREE.Mesh(new THREE.RingGeometry(.19, .205, 32), new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide }));
                    ring.position.copy(marker.position);
                    ring.quaternion.copy(marker.quaternion);
                    overlays.add(ring);
                }
                const count = d.zone === 'reserve' ? 0 : Math.floor(d.density * 5 + d.progress / 20);
                for (let b = 0; b < count; b++) {
                    const bn = normal(d.id, (b % 5 - 2) * .034, Math.floor(b / 5) * .032), height = .025 + d.progress * .0005 + (d.zone === 'housing' ? .045 : 0);
                    let shape: THREE.BufferGeometry;
                    if (d.zone === 'science')
                        shape = new THREE.ConeGeometry(.015, height, 6);
                    else if (d.zone === 'farm')
                        shape = new THREE.SphereGeometry(.026, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2);
                    else if (d.zone === 'industry')
                        shape = new THREE.CylinderGeometry(.018, .02, height, 8);
                    else
                        shape = new THREE.BoxGeometry(.028, height, .028);
                    const building = new THREE.Mesh(shape, new THREE.MeshStandardMaterial({ color, roughness: .5, emissive: color, emissiveIntensity: .2 }));
                    building.position.copy(surface(bn).addScaledVector(bn, height / 2));
                    building.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), bn);
                    overlays.add(building);
                }
                if (d.ruins > 1) {
                    const relic = new THREE.Mesh(new THREE.BoxGeometry(.035, .014, .065), new THREE.MeshStandardMaterial({ color: '#6e6662' }));
                    relic.position.copy(surface(normal(d.id, .16)).addScaledVector(n, .014));
                    relic.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
                    overlays.add(relic);
                }
                if (d.hub) {
                    const points = Array.from({ length: 25 }, (_, i) => surface(normal(d.id, (i / 24) * Math.PI / 2)).multiplyScalar(1.003));
                    overlays.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: '#b4c6ba', transparent: true, opacity: .65 })));
                }
            }
        };
        view.current = { update };
        update(world, selected, layer);
        const ray = new THREE.Raycaster();
        let down = { x: 0, y: 0 };
        const pointerDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
        const pick = (e: PointerEvent) => { if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5)
            return; const r = root.getBoundingClientRect(); ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), camera); const hit = ray.intersectObject(globe)[0]; if (hit) {
            const n = hit.point.normalize(), lat = Math.asin(n.y), lon = (Math.atan2(n.z, n.x) + Math.PI * 2) % (Math.PI * 2);
            callback.current(Math.min(2, Math.max(0, Math.round((lat + Math.PI / 3) / (Math.PI / 3)))) * 4 + Math.round(lon / (Math.PI / 2)) % 4);
        } };
        root.addEventListener('pointerdown', pointerDown);
        root.addEventListener('pointerup', pick);
        const resize = () => { camera.aspect = root.clientWidth / Math.max(1, root.clientHeight); camera.updateProjectionMatrix(); renderer.setSize(root.clientWidth, root.clientHeight); };
        const observer = new ResizeObserver(resize);
        observer.observe(root);
        resize();
        let frame = 0;
        const render = () => { controls.update(); parcelLayer.visible = camera.position.length() < 4.5; renderer.render(scene, camera); frame = requestAnimationFrame(render); };
        render();
        return () => { cancelAnimationFrame(frame); observer.disconnect(); root.removeEventListener('pointerdown', pointerDown); root.removeEventListener('pointerup', pick); clear(); geometry.dispose(); (globe.material as THREE.Material).dispose(); controls.dispose(); renderer.dispose(); root.removeChild(renderer.domElement); view.current = undefined; };
    }, [world.systemId]);
    const surfaceKey = world.districts.map(d => [d.id, d.zone, d.parcels.join(','), Math.floor(d.progress / 20), Math.floor(d.density * 5), Math.floor(d.pollution / 5), d.hub, Math.floor(d.ruins)].join(':')).join('|');
    useEffect(() => { view.current?.update(world, selected, layer); }, [surfaceKey, selected, layer]);
    return <div ref={host} className="planet-canvas" aria-label="星球规划视图，拖动旋转、滚轮缩放、点击选择区域"/>;
}
