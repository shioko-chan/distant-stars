import { useEffect, useRef, useState } from 'react';
import { createTheme } from '../presentation/themeMusic';

export function MusicControl() {
    const audio = useRef<AudioContext | null>(null);
    const wanted = useRef(true);
    const [enabled, setEnabled] = useState(true);
    const [playing, setPlaying] = useState(false);
    const [error, setError] = useState(false);

    useEffect(() => {
        let disposed = false;
        const start = () => {
            if (!wanted.current || disposed) return;
            try {
                if (!audio.current) {
                    const context = new AudioContext();
                    audio.current = context;
                    context.onstatechange = () => {
                        if (!disposed) setPlaying(context.state === 'running');
                    };
                    const source = context.createBufferSource();
                    source.buffer = createTheme(context);
                    source.loop = true;
                    const volume = context.createGain();
                    volume.gain.value = .45;
                    source.connect(volume).connect(context.destination);
                    source.start();
                }
                void audio.current.resume().catch(() => { if (!disposed) setError(true); });
            } catch {
                if (!disposed) setError(true);
            }
        };
        // Autoplay may be blocked; resume on a user gesture without changing the preference.
        start();
        const interact = (event: Event) => {
            if (event.target instanceof Element && event.target.closest('[data-music-control]')) return;
            start();
        };
        window.addEventListener('pointerdown', interact);
        window.addEventListener('keydown', interact);
        return () => {
            disposed = true;
            window.removeEventListener('pointerdown', interact);
            window.removeEventListener('keydown', interact);
            const context = audio.current;
            audio.current = null;
            if (context) void context.close();
        };
    }, []);

    const toggle = () => {
        wanted.current = !wanted.current;
        setEnabled(wanted.current);
        setError(false);
        const context = audio.current;
        if (context) {
            void (wanted.current ? context.resume() : context.suspend()).catch(() => setError(true));
        }
    };
    return <button type="button" data-music-control aria-pressed={enabled} onClick={toggle}
        title={error ? '音频暂不可用' : enabled && !playing ? '音乐已开启，首次交互后播放' : '遥远群星 · 氛围主题曲'}
        aria-label={enabled ? '关闭主题音乐' : '开启主题音乐'}>
        {enabled ? '♫ 音乐开' : '♪ 音乐关'}
    </button>;
}
