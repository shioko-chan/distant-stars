import { useEffect, useRef, useState } from 'react';
import { connect, send, setCamera, type NativeObject, type SceneMode } from './bridge';
import { add, length, scale, sub, unit, surfacePosition, type Camera, type Vec3 } from './math';
export function useViewport(mode: SceneMode, key: string, initial: Camera, objects: NativeObject[], planetId?: string) {
    const host = useRef<HTMLDivElement>(null), camera = useRef<Camera>(initial), objectRef = useRef(objects);
    objectRef.current = objects;
    const [revision, setRevision] = useState(0), [error, setError] = useState(''), [ready, setReady] = useState(false);
    const change = () => { setCamera(camera.current); setRevision(v => v + 1); };
    const focus = (point: Vec3, near = true) => { camera.current.position = scale(unit(point), near ? length(surfacePosition(unit(point), 0, planetId)) + .006 : 6); camera.current.target = [0, 0, 0]; change(); };
    const zoom = (delta: number) => {
        const c = camera.current, n = unit(sub(c.position, c.target)), d = length(sub(c.position, c.target));
        const ground = mode === 'planet' ? length(surfacePosition(n, 0, planetId)) : 0;
        const min = mode === 'planet' ? .0006 : mode === 'galaxy' ? 3 : 1.5, max = mode === 'planet' ? 8 : 85;
        c.position = add(c.target, scale(n, ground + Math.max(min, Math.min(max, (d - ground) * Math.exp(Math.max(-1, Math.min(1, delta * .0015)))))));
        change();
    };
    useEffect(() => {
        camera.current = { ...initial, position: [...initial.position], target: [...initial.target] };
        setReady(false);
        let opened = false;
        const close = connect(event => {
            if (event.type === 'error') {
                setError(event.message ?? 'Unreal 场景载入失败');
                return;
            }
            if (event.type === 'ready' && !opened) {
                opened = true;
                send({ type: 'scene', mode, key, planetId, objects: objectRef.current });
                change();
            }
            if (event.type === 'scene-ready' && event.mode === mode) {
                setReady(true);
                setError('');
                change();
            }
        });
        const resize = () => change();
        window.addEventListener('resize', resize);
        const unavailable = setTimeout(() => { if (!window.ue?.distantstars)
            setError('请从 Unreal 客户端启动此分支。独立浏览器版本位于 web 分支。'); }, 1800);
        return () => { close(); clearTimeout(unavailable); window.removeEventListener('resize', resize); };
    }, [mode, key]);
    useEffect(() => { if (ready)
        send({ type: 'replace-objects', objects }); }, [objects, ready]);
    const drag = useRef<{
        x: number;
        y: number;
        button: number;
        distance: number;
    } | undefined>(undefined);
    const orbit = (dx: number, dy: number) => {
        const c = camera.current, offset = sub(c.position, c.target), r = length(offset), height = r - (mode === 'planet' ? length(surfacePosition(unit(offset), 0, planetId)) : 0);
        const speed = mode === 'planet' ? Math.max(.006, Math.min(.65, height * .55)) : 1;
        const theta = Math.atan2(offset[0], offset[2]) - dx * .005 * speed, phi = Math.max(.001, Math.min(Math.PI - .001, Math.acos(offset[1] / r) - dy * .005 * speed));
        const direction: Vec3 = [Math.sin(phi) * Math.sin(theta), Math.cos(phi), Math.sin(phi) * Math.cos(theta)];
        const safeRadius = mode === 'planet' ? Math.max(r, length(surfacePosition(direction, 0, planetId)) + .0006) : r;
        c.position = add(c.target, scale(direction, safeRadius));
        change();
    };
    useEffect(() => { const element = host.current; if (!element)
        return; const wheel = (e: WheelEvent) => { e.preventDefault(); zoom(e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1)); }; element.addEventListener('wheel', wheel, { passive: false }); return () => element.removeEventListener('wheel', wheel); }, [mode, key]);
    return { host, camera, revision, error, ready, change, focus, zoom, drag, orbit };
}
