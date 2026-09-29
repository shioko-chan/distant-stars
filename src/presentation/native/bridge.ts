import type { Camera, Vec3 } from './math';
export interface NativeMesh {
    id: string;
    positions: number[];
    indices: number[];
    normals?: number[];
    uv?: number[];
    color?: string;
    texture?: string;
    unlit?: boolean;
    opacity?: number;
}
export interface NativeSphere {
    id: string;
    position: Vec3;
    radius: number;
    color: string;
    texture?: string;
    unlit?: boolean;
}
export interface NativeLine {
    id: string;
    points: Vec3[];
    color: string;
    width: number;
}
export type NativeObject = NativeMesh | NativeSphere | NativeLine;
export type SceneMode = 'residence' | 'galaxy' | 'system' | 'planet';
declare global {
    interface Window {
        ue?: {
            distantstars?: {
                submit(message: string): Promise<void>;
            };
        };
    }
}
export interface NativeEvent {
    type: 'ready' | 'scene-ready' | 'error';
    version?: number;
    mode?: SceneMode;
    message?: string;
}
export function send(message: object) { void window.ue?.distantstars?.submit(JSON.stringify(message)); }
export function listen(callback: (event: NativeEvent) => void) {
    const receive = (event: Event) => callback((event as CustomEvent<NativeEvent>).detail);
    window.addEventListener('distant-stars-native', receive);
    return () => window.removeEventListener('distant-stars-native', receive);
}
export function connect(callback: (event: NativeEvent) => void) {
    const dispose = listen(callback);
    const hello = () => send({ type: 'hello', version: 1 });
    hello();
    const timer = window.setInterval(hello, 500);
    return () => { clearInterval(timer); dispose(); };
}
export function setCamera(camera: Camera) { send({ type: 'camera', ...camera, width: window.innerWidth, height: window.innerHeight }); }
export function updateObjects(objects: NativeObject[], remove: string[] = []) { send({ type: 'objects', objects, remove }); }
