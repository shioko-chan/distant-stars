import { EARTH, districtPoint, terrainSample } from '../simulation/terrain';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ZONES } from '../content/catalog';
import { distanceToPath, surfaceProfile, normalize, pathLength, PLAN_LIMIT, separation, surfaceCost, validateSurface } from '../simulation/surface';
import type { Action, SurfaceDraft, SurfacePoint, WorldState, Zone } from '../simulation/types';
import { PlanetTerrain, planetPosition as surfacePosition } from './PlanetTerrain';

type Tool = 'inspect' | 'road' | 'zone';
interface Props { world: WorldState; time: number; distance: number; credits: number; act: (a: Action) => void; }
function clear(group: THREE.Group) {
    group.traverse(o => { const mesh = o as THREE.Mesh; mesh.geometry?.dispose(); if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(m => m.dispose()); });
    group.clear();
}
function ribbon(draft: SurfaceDraft, color: string, opacity: number, planetId: string) {
    const planetPosition = (n: THREE.Vector3, lift = 0) => surfacePosition(n, lift, planetId);
    const points: THREE.Vector3[] = [];
    for (let i = 1; i < draft.points.length; i++) {
        const a = new THREE.Vector3(...draft.points[i - 1]), b = new THREE.Vector3(...draft.points[i]);
        const count = Math.max(1, Math.ceil(a.distanceTo(b) / .0008));
        for (let j = 0; j < count; j++) points.push(a.clone().lerp(b, j / count).normalize());
    }
    points.push(new THREE.Vector3(...draft.points.at(-1)!));
    const vertices: number[] = [], indices: number[] = [];
    points.forEach((n, i) => {
        const tangent = points[Math.min(i + 1, points.length - 1)].clone().sub(points[Math.max(0, i - 1)]);
        const side = n.clone().cross(tangent).normalize().multiplyScalar(draft.width / 2);
        vertices.push(...planetPosition(n.clone().add(side).normalize(), .00003).toArray(), ...planetPosition(n.clone().sub(side).normalize(), .00003).toArray());
        if (i) indices.push(i * 2 - 2, i * 2 - 1, i * 2, i * 2 - 1, i * 2 + 1, i * 2);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices);
    return new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, opacity, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
}

export function PlanetView({ world, time, distance, credits, act }: Props) {
    const planetPosition = (n: THREE.Vector3, lift = 0) => surfacePosition(n, lift, world.planetId);
    const host = useRef<HTMLDivElement>(null);
    const [tool, setTool] = useState<Tool>('inspect');
    const [zone, setZone] = useState<Zone>('housing');
    const [width, setWidth] = useState(.00015);
    const [drafts, setDrafts] = useState<SurfaceDraft[]>([]);
    const [stroke, setStroke] = useState<SurfaceDraft>();
    const [selected, setSelected] = useState<string>();
    const [message, setMessage] = useState('双击陆地靠近；滚轮连续缩放。选择道路或分区工具，在地表拖动绘制。');
    const [altitude, setAltitude] = useState(10000);
    const runtime = useRef<{ zoom: (near: boolean) => void; focus: (point: SurfacePoint) => void; } | undefined>(undefined);
    const current = useRef({ tool, zone, width, world, drafts }); current.current = { tool, zone, width, world, drafts };
    const drawing = useRef<SurfaceDraft | undefined>(undefined);
    const visual = useRef<{ scene: THREE.Scene; plans: THREE.Group; draft: THREE.Group } | undefined>(undefined);

    useEffect(() => {
        const root = host.current!, scene = new THREE.Scene(); scene.background = new THREE.Color('#060e17');
        const camera = new THREE.PerspectiveCamera(42, 1, .00005, 100); camera.position.set(5, 3, 5);
        const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); root.appendChild(renderer.domElement);
        const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.enablePan = false; controls.maxDistance = 10;
        controls.enableZoom = false; controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;
        scene.add(new THREE.AmbientLight('#d0e4ef', 2)); const sun = new THREE.DirectionalLight('#fff1cc', 2.5); sun.position.set(5, 4, 6); scene.add(sun);
        const terrain = new PlanetTerrain(world.planetId); scene.add(terrain.group); terrain.update(camera);
        const plans = new THREE.Group(), draft = new THREE.Group(); scene.add(plans, draft); visual.current = { scene, plans, draft };
        const ray = new THREE.Raycaster();
        const pick = (event: PointerEvent | MouseEvent) => {
            const rect = renderer.domElement.getBoundingClientRect();
            ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1), camera);
            const hit = ray.intersectObjects(terrain.group.children)[0];
            return hit ? hit.point.normalize().toArray() as SurfacePoint : undefined;
        };
        let zoomTarget: THREE.Vector3 | undefined;
        let pointerStart = { x: 0, y: 0 };
        const focus = (point: SurfacePoint) => { const n = new THREE.Vector3(...point); zoomTarget = planetPosition(n).addScaledVector(n, .006); };
        runtime.current = { zoom: near => { const n = camera.position.clone().normalize(); zoomTarget = near ? planetPosition(n).addScaledVector(n, .006) : n.multiplyScalar(6); }, focus };
        const down = (event: PointerEvent) => {
            zoomTarget = undefined;
            pointerStart = { x: event.clientX, y: event.clientY };
            if (event.button !== 0 || current.current.tool === 'inspect') return;
            const point = pick(event); if (!point) return;
            if (camera.position.length() - planetPosition(new THREE.Vector3(...point)).length() > .45) { setMessage('请先双击陆地或点击「靠近地表」，再绘制规划。'); return; }
            drawing.current = { kind: current.current.tool, zone: current.current.zone, width: current.current.tool === 'road' ? .00003 : current.current.width, points: [point] };
            renderer.domElement.setPointerCapture(event.pointerId);
        };
        const move = (event: PointerEvent) => {
            const d = drawing.current; if (!d) return;
            const point = pick(event); if (!point || d.points.length >= 128 || separation(point, d.points.at(-1)!) < .00003) return;
            // Road endpoints snap to existing roads; both tools retain geographic coordinates.
            if (d.kind === 'road') {
                const candidates = [...current.current.world.surface, ...current.current.drafts].filter(p => p.kind === 'road').flatMap(p => p.points);
                const nearest = candidates.find(p => separation(point, p) < .00008);
                d.points.push(nearest ?? point);
            } else d.points.push(point);
            setStroke({ ...d, points: [...d.points] });
        };
        const up = (event: PointerEvent) => {
            const d = drawing.current;
            if (d) {
                drawing.current = undefined; setStroke(undefined);
                if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
                const invalid = validateSurface([d], world.planetId);
                if (invalid) setMessage(invalid);
                else { setDrafts(old => old.length < 24 ? [...old, d] : old); setMessage('草稿已绘制。可继续绘制、撤销，或批准全部草稿。'); }
            } else if (event.button === 0 && current.current.tool === 'inspect' && Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) < 5) {
                const point = pick(event); if (!point) return;
                const project = current.current.world.surface.find(p => distanceToPath(point, p.points) < Math.max(.001, p.width));
                setSelected(project?.id);
                setMessage(project ? `${project.kind === 'road' ? '道路' : ZONES[project.zone].name} · ${project.status}` : terrainSample(point, world.planetId).water ? '海域：当前陆地规划工具无法施工。' : (() => { const t = terrainSample(point, world.planetId); return `海拔 ${Math.round(t.height)} m · 区域坡度 ${t.slope.toFixed(1)}° · 农业适宜度 ${Math.round(t.fertility*100)}% · 矿产潜力 ${Math.round(t.minerals*100)}%`; })());
            }
        };
        const cancel = () => { drawing.current = undefined; setStroke(undefined); };
        const dblclick = (event: MouseEvent) => { if (current.current.tool !== 'inspect') return; const point = pick(event); if (point) focus(point); };
        const wheel = (event: WheelEvent) => {
            event.preventDefault();
            const position = zoomTarget ?? camera.position;
            const n = position.clone().normalize(), ground = planetPosition(n).length();
            const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1);
            const height = Math.max(.0006, Math.min(8, (position.length() - ground) * Math.exp(Math.max(-1, Math.min(1, delta * .0015)))));
            zoomTarget = n.multiplyScalar(ground + height);
        };
        const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { cancel(); setTool('inspect'); } };
        renderer.domElement.addEventListener('pointerdown', down); renderer.domElement.addEventListener('pointermove', move); renderer.domElement.addEventListener('pointerup', up); renderer.domElement.addEventListener('pointercancel', cancel); renderer.domElement.addEventListener('dblclick', dblclick); renderer.domElement.addEventListener('wheel', wheel, { passive: false }); window.addEventListener('keydown', key);
        const resize = () => { camera.aspect = root.clientWidth / Math.max(1, root.clientHeight); camera.updateProjectionMatrix(); renderer.setSize(root.clientWidth, root.clientHeight); };
        const observer = new ResizeObserver(resize); observer.observe(root); resize();
        let frame = 0, count = 0;
        const render = () => {
            controls.mouseButtons.LEFT = current.current.tool === 'inspect' ? THREE.MOUSE.ROTATE : null;
            const n = camera.position.clone().normalize(), ground = planetPosition(n).length(); controls.minDistance = ground + .0006;
            controls.rotateSpeed = Math.max(.006, Math.min(.65, (camera.position.length() - ground) * .55));
            if (zoomTarget) { camera.position.lerp(zoomTarget, .13); if (camera.position.distanceTo(zoomTarget) < .00001) zoomTarget = undefined; }
            controls.update();
            const floor = planetPosition(camera.position.clone().normalize()).length() + .0006;
            if (camera.position.length() < floor) camera.position.setLength(floor);
            camera.near = Math.max(.00002, Math.min(.1, (camera.position.length() - ground) * .1));
            camera.updateProjectionMatrix();
            if (count++ % 12 === 0) { terrain.update(camera); setAltitude(Math.round(Math.max(0, camera.position.length() - ground) / 1.8 * world.radiusKm)); }
            plans.children.forEach(o => { if (o.userData.globalMarker) o.visible = camera.position.length() - ground > .15; });
            renderer.render(scene, camera); frame = requestAnimationFrame(render);
        }; render();
        return () => {
            cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('keydown', key);
            renderer.domElement.removeEventListener('pointerdown', down); renderer.domElement.removeEventListener('pointermove', move); renderer.domElement.removeEventListener('pointerup', up); renderer.domElement.removeEventListener('pointercancel', cancel); renderer.domElement.removeEventListener('dblclick', dblclick); renderer.domElement.removeEventListener('wheel', wheel);
            terrain.dispose(); clear(plans); clear(draft); controls.dispose(); renderer.dispose(); root.removeChild(renderer.domElement); visual.current = undefined; runtime.current = undefined;
        };
    }, [world.planetId]);

    const surfaceKey = world.surface.map(p => `${p.id}:${Math.floor(p.progress / 5)}`).join('|');
    useEffect(() => {
        const v = visual.current; if (!v) return; clear(v.plans);
        for (const p of world.surface) {
            const color = p.kind === 'road' ? (p.progress < 50 ? '#9a8864' : '#323942') : ZONES[p.zone].color;
            v.plans.add(ribbon(p, color, p.kind === 'road' ? 1 : .35, world.planetId));
            if (p.kind === 'road' && p.progress >= 50) v.plans.add(ribbon({ ...p, width: p.width * .08 }, '#dfc687', .85, world.planetId));
            if (p.kind === 'zone' && p.zone !== 'reserve' && p.progress > 0) {
                const count = Math.min(64, Math.ceil(pathLength(p) / .00004)), built = Math.floor(count * p.progress / 100);
                const geometry = new THREE.BoxGeometry(1, 1, 1), material = new THREE.MeshStandardMaterial({ color, roughness: .7 });
                const buildings = new THREE.InstancedMesh(geometry, material, built); const dummy = new THREE.Object3D();
                for (let i = 0; i < built; i++) {
                    const fraction = (i + .5) / count * (p.points.length - 1), index = Math.min(p.points.length - 2, Math.floor(fraction));
                    const n = new THREE.Vector3(...p.points[index]).lerp(new THREE.Vector3(...p.points[index + 1]), fraction - index).normalize();
                    const tangent = new THREE.Vector3(...p.points[index + 1]).sub(new THREE.Vector3(...p.points[index]));
                    n.add(n.clone().cross(tangent).normalize().multiplyScalar((i % 3 - 1) * p.width * .25)).normalize();
                    const height = .00003 + .00005 * p.progress / 100 * (1 + i % 4);
                    dummy.position.copy(planetPosition(n, height / 2 + .000035)); dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n); dummy.scale.set(.000025, height, .000025); dummy.updateMatrix(); buildings.setMatrixAt(i, dummy.matrix);
                }
                v.plans.add(buildings);
            }
            // Small global marker remains visible when individual buildings become subpixel.
            const marker = new THREE.Mesh(new THREE.SphereGeometry(.003, 8, 6), new THREE.MeshBasicMaterial({ color })); marker.position.copy(planetPosition(new THREE.Vector3(...p.points[0]), .002)); marker.userData.globalMarker = true; v.plans.add(marker);
        }
        // Existing regional settlements remain visible as clusters, not editable grid tiles.
        for (const d of world.districts) {
            const n = new THREE.Vector3(...districtPoint(d.id, world.planetId));
            if (terrainSample(n.toArray() as SurfacePoint, world.planetId).water) continue;
            const marker = new THREE.Mesh(new THREE.SphereGeometry(.006 + d.density * .002, 8, 6), new THREE.MeshStandardMaterial({ color: ZONES[d.zone].color, emissive: ZONES[d.zone].color, emissiveIntensity: .4 })); marker.position.copy(planetPosition(n, .005)); marker.userData.globalMarker = true; v.plans.add(marker);
        }
    }, [surfaceKey, world.planetId]);
    useEffect(() => {
        const v = visual.current; if (!v) return; clear(v.draft);
        for (const p of [...drafts, ...(stroke ? [stroke] : [])]) if (p.points.length >= 2) v.draft.add(ribbon(p, validateSurface([p], world.planetId) ? '#e96b62' : '#e7d389', .75, world.planetId));
    }, [drafts, stroke, world.planetId]);

    const cost = drafts.reduce((n, p) => n + surfaceCost(p, world.planetId, world.radiusKm), 0);
    const project = world.surface.find(p => p.id === selected);
    const approve = () => {
        act({ type: 'directive', directive: { targetId: world.planetId, kind: 'surface', value: 'build', surface: drafts, budget: cost, priority: 2, deadline: time + distance + 30, risk: .5, authorization: 'strict', after: 'maintain' } });
        setDrafts([]); setTool('inspect'); setMessage(distance ? '规划已发出。实际接收与施工结果以返回报告为准。' : '规划已提交。推进时间后可查看道路施工与分区发展。');
    };
    return <>
        <div ref={host} className={`planet-canvas ${tool !== 'inspect' ? 'drawing-surface' : ''}`} aria-label="可连续缩放的星球地表，双击陆地靠近，拖动绘制规划"/>
        <div className="surface-tools">
            <div className="surface-tool-row"><button className={tool === 'inspect' ? 'active' : ''} onClick={() => setTool('inspect')}>选择 / 观察</button><button className={tool === 'road' ? 'active' : ''} onClick={() => setTool('road')}>铺设道路</button><button className={tool === 'zone' ? 'active' : ''} onClick={() => setTool('zone')}>分区笔刷</button></div>
            {tool === 'zone' && <div className="surface-tool-row"><select aria-label="地表分区功能" value={zone} onChange={e => setZone(e.target.value as Zone)}>{Object.entries(ZONES).map(([id, z]) => <option value={id} key={id}>{z.name}</option>)}</select><label>笔刷 <select aria-label="分区笔刷宽度" value={width} onChange={e => setWidth(Number(e.target.value))}><option value={.00005}>{Math.round(.00005*world.radiusKm*1000)} m</option><option value={.00015}>{(.00015*world.radiusKm).toFixed(1)} km</option><option value={.0005}>{(.0005*world.radiusKm).toFixed(1)} km</option></select></label></div>}
            <div className="surface-tool-row"><button onClick={() => runtime.current?.zoom(true)}>靠近地表</button><button onClick={() => runtime.current?.zoom(false)}>全球视角</button><small>{altitude > 1200 ? '全球' : altitude > 150 ? '区域' : '局部'} · 高度约 {altitude.toLocaleString()} km</small></div>
            <p>{tool === 'inspect' ? '左键旋转 · 双击定位 · 滚轮缩放' : '左键按住绘制 · 右键旋转 · 滚轮缩放 · Esc 退出工具'}</p>
        </div>
        <section className="surface-draft-panel" aria-label="地表规划草稿">
            <p role="status">{message}</p>
            {world.planetId === EARTH && <small>真实海陆与高程 · 赤道约 20 km/采样 · 高程不夸张<br/><a href="/textures/solar/sources.html" target="_blank" rel="noreferrer">影像与地形来源 ↗</a></small>}
            {drafts.length > 0 && <p>最大区域坡度 {Math.max(...drafts.map(p=>surfaceProfile(p,world.planetId).slope)).toFixed(1)}° · 坡度增加造价和工期</p>}
            {drafts.length > 0 && <><div className="row"><b>{drafts.length} 项草稿</b><span>{cost.toLocaleString()} Cr</span></div><small>道路先施工，非保护分区需连接道路；命令约 {distance.toFixed(1)} 年后抵达。</small><div className="surface-tool-row"><button onClick={() => setDrafts(old => old.slice(0, -1))}>撤销一笔</button><button onClick={() => setDrafts([])}>清空草稿</button><button disabled={cost > credits || world.independent || world.surface.length + drafts.length > PLAN_LIMIT} onClick={approve}>批准建设</button></div>{cost > credits && <p className="warning">中央预算不足</p>}</>}
            {project && <><h4>{project.kind === 'road' ? '道路' : ZONES[project.zone].name} · {project.progress.toFixed(0)}%</h4><progress max={100} value={project.progress}/><small>{project.status} · 预算 {project.cost} Cr</small></>}
            {world.surface.length > 0 && <select aria-label="定位地表工程" value={selected ?? ''} onChange={e => { const p = world.surface.find(p => p.id === e.target.value); setSelected(p?.id); if (p) runtime.current?.focus(p.points[Math.floor(p.points.length / 2)]); }}><option value="">定位已批准工程…</option>{world.surface.map((p, i) => <option value={p.id} key={p.id}>{i + 1} · {p.kind === 'road' ? '道路' : ZONES[p.zone].name} · {p.progress.toFixed(0)}%</option>)}</select>}
        </section>
    </>;
}
