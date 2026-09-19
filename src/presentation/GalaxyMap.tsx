import { systemForPlanet } from '../simulation/locations';
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { PlayerView } from "../simulation/types";
import { getShipProgress } from "../simulation/queries";
import { outgoingSignals } from './navigation';
import { mulberry32 } from '../simulation/rng';
interface Props {
    state: PlayerView;
    selectedId: string;
    onSelect: (id: string) => void;
    selectedShipId?: string;
    onSelectShip: (id: string) => void;
}
const spectralColors = { G: 0xffdf99, K: 0xffa85c, M: 0xff7159, F: 0xdcecff };
export function GalaxyMap({ state, selectedId, onSelect, selectedShipId, onSelectShip }: Props) {
    const hostRef = useRef<HTMLDivElement>(null);
    const labels = useRef(new Map<string, HTMLButtonElement>());
    const starLabels = useRef(new Map<string, HTMLButtonElement>());
    const callbackRef = useRef(onSelect);
    const stateRef = useRef(state);
    const selectedShipRef = useRef(selectedShipId);
    selectedShipRef.current = selectedShipId;
    const cameraState = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | undefined>(undefined);
    callbackRef.current = onSelect;
    stateRef.current = state;
    const missionKey = state.ships.map((ship) => `${ship.id}:${ship.status}`).join("|");
    const colonyKey = Object.keys(state.worlds).join("|");
    const mapKey = `${state.seed}:${state.systems.length}`;
    const orderKey = outgoingSignals(state).map(order => `${order.id}:${order.issuedAt}:${order.arrivesAt}`).join('|');
    useEffect(() => {
        const host = hostRef.current!;
        const scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x040c15, 0.007);
        const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 240);
        if(cameraState.current) camera.position.copy(cameraState.current.position);
        else camera.position.set(0, 8, 13);
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        renderer.setClearColor(0x040a12, 1);
        host.appendChild(renderer.domElement);
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.06;
        controls.maxDistance = 85;
        controls.minDistance = 3;
        if(cameraState.current) controls.target.copy(cameraState.current.target);
        else controls.target.set(0, 0, 0);
        // Stable background stars keep their positions when the target changes.
        const rng = mulberry32(71039);
        const glowCanvas = document.createElement('canvas');
        glowCanvas.width = glowCanvas.height = 64;
        const context = glowCanvas.getContext('2d')!;
        const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(.08, '#ffffff');
        gradient.addColorStop(.22, '#ffffff88');
        gradient.addColorStop(.5, '#ffffff22');
        gradient.addColorStop(1, '#ffffff00');
        context.fillStyle = gradient;
        context.fillRect(0, 0, 64, 64);
        const glowTexture = new THREE.CanvasTexture(glowCanvas);
        const random = new Float32Array(4200 * 3);
        for (let i = 0; i < random.length; i += 3) {
            const r = 65 + rng() * 40;
            const a = rng() * Math.PI * 2;
            random[i] = Math.cos(a) * r;
            random[i + 1] = (rng() - 0.5) * 95;
            random[i + 2] = Math.sin(a) * r;
        }
        const background = new THREE.BufferGeometry();
        background.setAttribute("position", new THREE.BufferAttribute(random, 3));
        scene.add(new THREE.Points(background, new THREE.PointsMaterial({ color: 0xb3c9e2, size: 0.4, map: glowTexture, transparent: true, opacity: 0.9, depthWrite: false, fog: false })));
        // Sparse range rings replace the flat Cartesian grid with a navigation projection.
        for (const radius of [5, 10, 15, 20]) {
            const points = Array.from({ length: 129 }, (_, index) => {
                const angle = index / 128 * Math.PI * 2;
                return new THREE.Vector3(Math.cos(angle) * radius, -.55, Math.sin(angle) * radius);
            });
            const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x56828c, transparent: true, opacity: .16 }));
            scene.add(ring);
        }
        const pickables: THREE.Mesh[] = [];
        state.systems.forEach((system) => {
            const size = system.id === "sol" ? 0.26 : 0.13 + (system.spectral === "F" ? 0.05 : 0);
            const star = new THREE.Mesh(new THREE.SphereGeometry(size, 16, 12), new THREE.MeshBasicMaterial({ color: spectralColors[system.spectral] }));
            star.position.set(system.x, system.y, system.z);
            star.userData.id = system.id;
            pickables.push(star);
            scene.add(star);
            const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture, color: spectralColors[system.spectral], transparent: true, opacity: .8, blending: THREE.AdditiveBlending, depthWrite: false }));
            glow.scale.setScalar(size * 12);
            glow.position.copy(star.position);
            scene.add(glow);
            if (system.bodies.some(b=>state.intel[b.id].level === "colonized")) {
                const ring = new THREE.Mesh(new THREE.RingGeometry(size * 1.8, size * 2.1, 28), new THREE.MeshBasicMaterial({ color: 0x78d5c0, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
                ring.position.copy(star.position);
                ring.lookAt(camera.position);
                scene.add(ring);
            }
        });
        const shipMarkers = new Map<string, {
            marker: THREE.Mesh;
            origin: THREE.Vector3;
            target: THREE.Vector3;
            route: THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial>;
        }>();
        state.ships.filter((ship) => ship.status === "outbound" || ship.status === "building").forEach((ship) => {
            const origin = systemForPlanet(state.systems,ship.originId)!;
            const target = systemForPlanet(state.systems,ship.targetId)!;
            const progress = getShipProgress(state, ship);
            const points = [new THREE.Vector3(origin.x, origin.y, origin.z), new THREE.Vector3(target.x, target.y, target.z)];
            const route=new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineDashedMaterial({ color: ship.kind === "probe" ? 0x6faebc : 0xd9b66d, transparent: true, opacity: 0.45, dashSize: 0.18, gapSize: 0.12 }));
            route.computeLineDistances();scene.add(route);
            const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.12), new THREE.MeshBasicMaterial({ color: ship.kind === "probe" ? 0x84d9e8 : 0xffd481 }));
            marker.position.lerpVectors(points[0], points[1], progress);
            scene.add(marker);
            shipMarkers.set(ship.id, { marker, origin: points[0], target: points[1], route });
        });
        const selected = state.systems.find((s) => s.id === selectedId);
        // Only outgoing orders already known to the player are visualized.
        const signals = outgoingSignals(state).flatMap(order => {
            const origin = state.systems.find(s => s.id === order.sourceId) ?? systemForPlanet(state.systems, order.sourceId);
            const target = systemForPlanet(state.systems, order.targetId);
            if (!origin || !target || origin.id === target.id) return [];
            const start = new THREE.Vector3(origin.x, origin.y, origin.z);
            const end = new THREE.Vector3(target.x, target.y, target.z);
            const path = new THREE.Line(new THREE.BufferGeometry().setFromPoints([start, end]), new THREE.LineBasicMaterial({ color: 0xc7ac76, transparent: true, opacity: .22 }));
            const pulse = new THREE.Mesh(new THREE.RingGeometry(.11, .18, 24), new THREE.MeshBasicMaterial({ color: 0xf2d297, side: THREE.DoubleSide }));
            scene.add(path, pulse);
            return [{ order, start, end, pulse, path }];
        });
        if (selected) {
            const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.39, 36), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
            ring.position.set(selected.x, selected.y, selected.z);
            ring.lookAt(camera.position);
            scene.add(ring);
        }
        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        let down={x:0,y:0};
        const handleDown=(event:PointerEvent)=>{down={x:event.clientX,y:event.clientY};};
        const handlePointer = (event: PointerEvent) => { if(Math.hypot(event.clientX-down.x,event.clientY-down.y)>5)return;const rect = renderer.domElement.getBoundingClientRect(); pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1; pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1; raycaster.setFromCamera(pointer, camera); const hit = raycaster.intersectObjects(pickables)[0]; if (hit)
            callbackRef.current(hit.object.userData.id); };
        renderer.domElement.addEventListener("pointerdown",handleDown);
        renderer.domElement.addEventListener("pointerup", handlePointer);
        const resize = () => { const { clientWidth, clientHeight } = host; camera.aspect = clientWidth / clientHeight; camera.updateProjectionMatrix(); renderer.setSize(clientWidth, clientHeight); };
        const observer = new ResizeObserver(resize);
        observer.observe(host);
        resize();
        let frame = 0;
        const projected = new THREE.Vector3();
        const labelSystems = [...state.systems].sort((a, b) => {
            const priority = (id: string) => id === selectedId ? 0 : id === 'sol' ? 1 : 2;
            return priority(a.id) - priority(b.id);
        });
        const render = () => { controls.update();
            const occupied: { x: number; y: number; width: number; height: number }[] = [];
            labelSystems.forEach(system => {
                const label = starLabels.current.get(system.id);
                if (!label) return;
                projected.set(system.x, system.y, system.z).project(camera);
                const x = (projected.x + 1) * host.clientWidth / 2;
                const y = (1 - projected.y) * host.clientHeight / 2;
                const width = Math.max(90, system.name.length * 11 + 14);
                const height = system.id === selectedId || system.id === 'sol' ? 46 : 30;
                const overlaps = (rect: typeof occupied[number]) => occupied.some(other => rect.x < other.x + other.width && rect.x + rect.width > other.x && rect.y < other.y + other.height && rect.y + rect.height > other.y);
                let rect = { x: x + 12, y: y - height / 2, width, height };
                let left = false;
                if (overlaps(rect) || rect.x + width > host.clientWidth - 35) {
                    rect = { ...rect, x: x - width - 12 };
                    left = true;
                }
                const visible = projected.z > -1 && projected.z < 1 && rect.x > 30 && rect.x + width < host.clientWidth - 30 && rect.y > 30 && rect.y + height < host.clientHeight - 30 && !overlaps(rect);
                if (visible) occupied.push(rect);
                label.style.visibility = visible ? 'visible' : 'hidden';
                // Off-screen targets remain reachable through the target selector.
                label.tabIndex = visible ? 0 : -1;
                label.style.transform = left ? 'translate(calc(-100% - 12px), -50%)' : 'translate(12px, -50%)';
                label.style.left = x + 'px';
                label.style.top = y + 'px';
            });
            signals.forEach(({ order, start, end, pulse, path }) => {
                const time = stateRef.current.time;
                pulse.visible = path.visible = time < order.arrivesAt;
                const progress = Math.max(0, Math.min(1, (time - order.issuedAt) / Math.max(.0001, order.arrivesAt - order.issuedAt)));
                pulse.position.lerpVectors(start, end, progress);
            });
            shipMarkers.forEach((entry, id) => { const ship = stateRef.current.ships.find((candidate) => candidate.id === id); if (ship)
            entry.marker.position.lerpVectors(entry.origin, entry.target, getShipProgress(stateRef.current, ship));
            const label = labels.current.get(id);
            entry.route.material.opacity = selectedShipRef.current === id ? 1 : .35;
            entry.marker.scale.setScalar(selectedShipRef.current === id ? 1.6 : 1);
            if (label) {
                projected.copy(entry.marker.position).project(camera);
                label.style.visibility = projected.z > -1 && projected.z < 1 && Math.abs(projected.x) < 1 && Math.abs(projected.y) < 1 ? 'visible' : 'hidden';
                label.style.left = (projected.x + 1) * host.clientWidth / 2 + 'px';
                label.style.top = (1 - projected.y) * host.clientHeight / 2 + 'px';
            }
        }); scene.children.forEach((object) => { if (object instanceof THREE.Mesh && object.geometry.type === "RingGeometry")
            object.lookAt(camera.position); }); renderer.render(scene, camera); frame = requestAnimationFrame(render); };
        render();
        return () => { cameraState.current={position:camera.position.clone(),target:controls.target.clone()};cancelAnimationFrame(frame); observer.disconnect(); renderer.domElement.removeEventListener("pointerdown",handleDown);renderer.domElement.removeEventListener("pointerup", handlePointer); controls.dispose(); scene.traverse((object) => { const mesh = object as THREE.Mesh; mesh.geometry?.dispose(); const materials = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []; materials.forEach((material) => material.dispose()); }); glowTexture.dispose(); renderer.dispose(); host.removeChild(renderer.domElement); };
    }, [mapKey, missionKey, colonyKey, selectedId, orderKey]);
    return <div className="galaxy-map" ref={hostRef} aria-label="可旋转的银河战略地图">
        <div className="star-labels">{state.systems.map(system => <button key={system.id} ref={element => { if (element) starLabels.current.set(system.id, element); else starLabels.current.delete(system.id); }} className={selectedId === system.id ? 'active' : ''} aria-pressed={selectedId === system.id} aria-label={'观测' + system.name} onClick={() => onSelect(system.id)}>{system.name}{(selectedId === system.id || system.id === 'sol') && <small>{system.id === 'sol' ? 'SOL / 母星' : system.distance.toFixed(2) + ' LY'}</small>}</button>)}</div>
        <div className="ship-labels">{state.ships.filter(ship => ship.status === 'outbound' || ship.status === 'building').map(ship => <button key={ship.id} ref={element => { if (element) labels.current.set(ship.id, element); else labels.current.delete(ship.id); }} className={selectedShipId === ship.id ? 'active' : ''} aria-pressed={selectedShipId === ship.id} onClick={() => onSelectShip(ship.id)} aria-label={'查看航行计划 ' + ship.name}>◇ <span>{ship.name}</span></button>)}</div>
    </div>;
}
