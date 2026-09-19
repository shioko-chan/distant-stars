import { useEffect, useRef, useState } from 'react';
import { MUSIC_TRACKS } from '../content/music';

export interface ThemeMusicControl {
    enabled: boolean;
    playing: boolean;
    loading: boolean;
    error: boolean;
    trackIndex: number;
    toggle: () => void;
    select: (index: number) => void;
    next: () => void;
}

/** One soundtrack session across the deck and command station. */
export function useThemeMusic(volume = .5): ThemeMusicControl {
    const activeAudio = useRef<HTMLAudioElement | null>(null);
    const volumeRef = useRef(volume);
    useEffect(() => {
        volumeRef.current = volume;
        if (activeAudio.current) activeAudio.current.volume = volume;
    }, [volume]);
    const controls = useRef<{ toggle: () => void; select: (index: number) => void; next: () => void } | null>(null);
    const [enabled, setEnabled] = useState(true);
    const [playing, setPlaying] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [trackIndex, setTrackIndex] = useState(0);

    useEffect(() => {
        let disposed = false;
        let wanted = true;
        let index = 0;
        let audio: HTMLAudioElement | null = null;
        let attempt = 0;

        const stop = () => {
            attempt++;
            if (!audio) return;
            audio.onplaying = audio.onpause = audio.onwaiting = audio.oncanplay = audio.onerror = audio.onended = null;
            audio.pause();
            audio.removeAttribute('src');
            audio.load();
            audio = null;
            activeAudio.current = null;
        };
        const start = () => {
            if (!wanted || disposed) return;
            if (!audio) {
                const current = new Audio(`${import.meta.env.BASE_URL}audio/${MUSIC_TRACKS[index].id}.mp3`);
                audio = current;
                activeAudio.current = current;
                current.volume = volumeRef.current;
                current.preload = 'auto';
                const isCurrent = () => !disposed && audio === current;
                current.onplaying = () => { if (isCurrent()) { setPlaying(true); setLoading(false); setError(false); } };
                current.onpause = () => { if (isCurrent()) setPlaying(false); };
                current.onwaiting = () => { if (isCurrent() && wanted) { setPlaying(false); setLoading(true); } };
                current.oncanplay = () => { if (isCurrent()) setLoading(false); };
                current.onerror = () => {
                    if (isCurrent()) { setError(true); setPlaying(false); setLoading(false); }
                };
                current.onended = () => {
                    if (!isCurrent() || !wanted) return;
                    select((index + 1) % MUSIC_TRACKS.length);
                };
            }
            const current = audio, request = ++attempt;
            setError(false);
            setLoading(current.readyState < 3);
            // Call directly in the gesture: browsers can reject delayed autoplay.
            void current.play().catch((reason: unknown) => {
                if (disposed || audio !== current || request !== attempt || !wanted) return;
                setPlaying(false);
                setLoading(false);
                if (!(reason instanceof DOMException && (reason.name === 'NotAllowedError' || reason.name === 'AbortError'))) setError(true);
            });
        };
        const select = (nextIndex: number) => {
            if (!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex >= MUSIC_TRACKS.length) return;
            stop();
            index = nextIndex;
            setTrackIndex(index);
            setPlaying(false);
            setLoading(false);
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
                if (wanted) {
                    if (audio?.error) stop();
                    start();
                } else {
                    attempt++;
                    audio?.pause();
                    setPlaying(false);
                    setLoading(false);
                }
            },
        };
        start();
        const interact = (event: Event) => {
            if (event.target instanceof Element && event.target.closest('[data-music-control]')) return;
            if (audio?.paused) start();
        };
        window.addEventListener('pointerdown', interact);
        window.addEventListener('keydown', interact);
        return () => {
            disposed = true;
            controls.current = null;
            window.removeEventListener('pointerdown', interact);
            window.removeEventListener('keydown', interact);
            stop();
        };
    }, []);

    return {
        enabled, playing, loading, error, trackIndex,
        toggle: () => controls.current?.toggle(),
        select: nextIndex => controls.current?.select(nextIndex),
        next: () => controls.current?.next(),
    };
}
