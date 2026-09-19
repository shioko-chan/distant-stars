import { useEffect, useRef, useState } from 'react';
import { MUSIC_TRACKS } from '../content/music';
import type { MusicRenderRequest, MusicRenderResult } from '../workers/music.worker';

export interface ThemeMusicControl {
    enabled: boolean;
    playing: boolean;
    rendering: boolean;
    error: boolean;
    trackIndex: number;
    toggle: () => void;
    select: (index: number) => void;
    next: () => void;
}

/** Keep one soundtrack session mounted in App across the deck and command station. */
export function useThemeMusic(): ThemeMusicControl {
    const controls = useRef<{ toggle: () => void; select: (index: number) => void; next: () => void } | null>(null);
    const [enabled, setEnabled] = useState(true);
    const [playing, setPlaying] = useState(false);
    const [rendering, setRendering] = useState(false);
    const [error, setError] = useState(false);
    const [trackIndex, setTrackIndex] = useState(0);

    useEffect(() => {
        let disposed = false;
        let wanted = true;
        let index = 0;
        let context: AudioContext | null = null;
        let renderWorker: Worker | null = null;
        let active: { source: AudioBufferSourceNode; volume: GainNode } | null = null;

        const cancelRender = () => {
            renderWorker?.terminate();
            renderWorker = null;
            if (!disposed) setRendering(false);
        };
        const stop = () => {
            cancelRender();
            if (!active || !context) return;
            const { source, volume } = active;
            active = null;
            // Manual changes must not fire the playlist's natural-end handler.
            source.onended = () => { source.disconnect(); volume.disconnect(); };
            if (context.state === 'running') {
                volume.gain.setTargetAtTime(0, context.currentTime, .015);
                source.stop(context.currentTime + .08);
            } else {
                source.stop();
                source.disconnect();
                volume.disconnect();
            }
        };
        const fail = () => {
            stop();
            if (!disposed) setError(true);
        };
        const start = () => {
            if (!wanted || disposed) return;
            try {
                if (!context) {
                    context = new AudioContext();
                    const current = context;
                    current.onstatechange = () => {
                        if (!disposed) setPlaying(current.state === 'running');
                    };
                }
                // Request resume in the gesture itself, before background synthesis finishes.
                void context.resume().catch(() => { if (!disposed && wanted) setError(true); });
                if (active || renderWorker) return;
                setError(false);
                setRendering(true);
                const worker = new Worker(new URL('../workers/music.worker.ts', import.meta.url), { type: 'module' });
                renderWorker = worker;
                worker.onerror = event => {
                    event.preventDefault();
                    if (!disposed && renderWorker === worker) fail();
                };
                worker.onmessage = (event: MessageEvent<MusicRenderResult>) => {
                    // A rapid selection can supersede a response already queued for delivery.
                    if (disposed || renderWorker !== worker) return;
                    cancelRender();
                    if (!wanted || !context) return;
                    if (!event.data.ok) { fail(); return; }
                    try {
                        const left = new Float32Array(event.data.left), right = new Float32Array(event.data.right);
                        const buffer = context.createBuffer(2, left.length, context.sampleRate);
                        buffer.copyToChannel(left, 0);
                        buffer.copyToChannel(right, 1);
                        const source = context.createBufferSource();
                        const volume = context.createGain();
                        volume.gain.value = .45;
                        source.buffer = buffer;
                        source.connect(volume).connect(context.destination);
                        source.onended = () => {
                            source.disconnect();
                            volume.disconnect();
                            if (disposed || active?.source !== source) return;
                            active = null;
                            index = (index + 1) % MUSIC_TRACKS.length;
                            setTrackIndex(index);
                            start();
                        };
                        source.start();
                        active = { source, volume };
                    } catch {
                        fail();
                    }
                };
                const request: MusicRenderRequest = { trackIndex: index, sampleRate: context.sampleRate };
                worker.postMessage(request);
            } catch {
                fail();
            }
        };
        const select = (nextIndex: number) => {
            stop();
            index = nextIndex;
            setTrackIndex(index);
            setError(false);
            start();
        };
        controls.current = {
            select,
            next: () => select((index + 1) % MUSIC_TRACKS.length),
            toggle: () => {
                wanted = !wanted;
                setEnabled(wanted);
                setError(false);
                if (wanted) start();
                else {
                    cancelRender();
                    if (context) void context.suspend().catch(() => { if (!disposed) setError(true); });
                }
            },
        };
        start();
        const interact = (event: Event) => {
            if (event.target instanceof Element && event.target.closest('[data-music-control]')) return;
            if (context?.state !== 'running') start();
        };
        window.addEventListener('pointerdown', interact);
        window.addEventListener('keydown', interact);
        return () => {
            disposed = true;
            controls.current = null;
            window.removeEventListener('pointerdown', interact);
            window.removeEventListener('keydown', interact);
            stop();
            if (context) {
                context.onstatechange = null;
                void context.close().catch(() => {});
            }
        };
    }, []);

    return {
        enabled, playing, rendering, error, trackIndex,
        toggle: () => controls.current?.toggle(),
        select: nextIndex => controls.current?.select(nextIndex),
        next: () => controls.current?.next(),
    };
}
