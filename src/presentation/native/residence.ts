import { solarScene } from './astronomy';
import { connect, send, setCamera, updateObjects } from './bridge';
import { CAMERA_START_POSITION, sampleBridgeMotion, BRIDGE_MOTION_DURATION, type BridgeMotionPhase } from '../bridgeMotion';
import { isRoomMovementKey, movementFromKeys, findRoomPath, stepRoomPath, ROOM_WALK_SPEED } from '../roomNavigation';
import { moveInRoom, type FloorPoint } from '../roomCollision';
import { createCatWander } from '../catWander';
import { add, scale, ray, type Camera } from './math';
export function createResidence(host: HTMLDivElement, callbacks: {
    onReady: () => void;
    onError: (message: string) => void;
    onPhase: (phase: BridgeMotionPhase) => void;
    onComplete: () => void;
}) {
    let active = true, opened = false, ready = false, started: number | undefined, frame = 0, last = performance.now(), yaw = 0, pitch = .02;
    const camera: Camera = { position: [...CAMERA_START_POSITION], target: [0, 2.2, -30], fov: 52 }, keys = new Set<string>(), wander = createCatWander();
    let path: FloorPoint[] = [], drag: {
        x: number;
        y: number;
        distance: number;
    } | undefined;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const close = connect(event => {
        if (event.type === 'ready' && !opened) {
            opened = true;
            send({ type: 'scene', mode: 'residence', key: 'residence', objects: solarScene(0) });
            setCamera(camera);
        }
        if (event.type === 'scene-ready' && event.mode === 'residence') {
            ready = true;
            send({ type: 'motion', enabled: !reduced.matches });
            callbacks.onReady();
        }
        if (event.type === 'error')
            callbacks.onError(event.message ?? 'Unreal 居所载入失败');
    });
    const unavailable = setTimeout(() => { if (!window.ue?.distantstars)
        callbacks.onError('请从 Unreal 客户端启动此分支。独立浏览器版本位于 web 分支。'); }, 1800);
    const down = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY, distance: 0 }; host.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => { if (!drag || started !== undefined)
        return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.distance += Math.hypot(dx, dy); drag.x = e.clientX; drag.y = e.clientY; yaw -= dx * .003; pitch = Math.max(-1.3, Math.min(1.3, pitch - dy * .003)); };
    const up = (e: PointerEvent) => { if (drag && drag.distance < 5 && started === undefined) {
        const dir = ray(e.clientX, e.clientY, camera, innerWidth, innerHeight);
        if (dir[1] < -.001) {
            const p = add(camera.position, scale(dir, -camera.position[1] / dir[1]));
            path = findRoomPath({ x: camera.position[0], z: camera.position[2] }, { x: p[0], z: p[2] });
        }
    } drag = undefined; if (host.hasPointerCapture(e.pointerId))
        host.releasePointerCapture(e.pointerId); };
    const keydown = (e: KeyboardEvent) => { if (e.code === 'Escape') {
        path = [];
        keys.clear();
        return;
    } if (!active || !isRoomMovementKey(e.code) || /INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement)?.tagName))
        return; e.preventDefault(); keys.add(e.code); path = []; };
    const keyup = (e: KeyboardEvent) => keys.delete(e.code), blur = () => { keys.clear(); drag = undefined; };
    host.addEventListener('pointerdown', down);
    host.addEventListener('pointermove', move);
    host.addEventListener('pointerup', up);
    host.addEventListener('pointercancel', blur);
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', blur);
    let lastSky = -1;
    const tick = (now: number) => {
        const delta = Math.min(.05, (now - last) / 1000);
        last = now;
        if (active && ready) {
            if (!reduced.matches && now - lastSky > 1000) {
                updateObjects(solarScene(now / 1000));
                lastSky = now;
            }
            if (started !== undefined) {
                const elapsed = (now - started) / 1000, sample = sampleBridgeMotion(elapsed);
                camera.position = sample.cameraPosition;
                camera.target = sample.cameraTarget;
                callbacks.onPhase(sample.phase);
                host.style.setProperty('--screen-blend', String(sample.screenBlend));
                send({ type: 'cat', position: sample.catPosition, yaw: sample.catYaw, visible: sample.catVisible, moving: false });
                if (elapsed >= BRIDGE_MOTION_DURATION) {
                    active = false;
                    callbacks.onComplete();
                }
            }
            else {
                let point = { x: camera.position[0], z: camera.position[2] };
                const m = movementFromKeys(keys), norm = Math.hypot(m.forward, m.sideways) || 1;
                if (keys.size)
                    point = moveInRoom(point, { x: (Math.sin(yaw) * m.forward + Math.cos(yaw) * m.sideways) * ROOM_WALK_SPEED * delta / norm, z: (-Math.cos(yaw) * m.forward + Math.sin(yaw) * m.sideways) * ROOM_WALK_SPEED * delta / norm });
                else
                    point = stepRoomPath(point, path, delta);
                camera.position = [point.x, 1.6, point.z];
                camera.target = add(camera.position, [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)]);
                const cat = wander.update(delta, !reduced.matches);
                send({ type: 'cat', position: [cat.x, 0, cat.z], yaw: cat.yaw, visible: true, moving: cat.moving });
            }
            setCamera(camera);
        }
        frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return { start() { if (reduced.matches) {
            active = false;
            callbacks.onComplete();
            return;
        } started = performance.now(); path = []; keys.clear(); }, setActive(value: boolean) { active = value; if (value) {
            started = undefined;
            opened = false;
            ready = false;
            camera.position = [...CAMERA_START_POSITION];
            host.style.setProperty('--screen-blend', '0');
            send({ type: 'hello', version: 1 });
        } }, dispose() { cancelAnimationFrame(frame); clearTimeout(unavailable); close(); host.removeEventListener('pointerdown', down); host.removeEventListener('pointermove', move); host.removeEventListener('pointerup', up); host.removeEventListener('pointercancel', blur); window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', blur); } };
}
