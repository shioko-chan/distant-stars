import { useEffect, useRef, useState } from 'react';
import { createTheme } from '../presentation/themeMusic';

export function MusicControl() {
    const audio = useRef<AudioContext | null>(null);
    const [playing, setPlaying] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(false);

    useEffect(() => () => {
        const context = audio.current;
        audio.current = null;
        if (context) void context.close();
    }, []);

    const toggle = async () => {
        setBusy(true);
        setError(false);
        try {
            if (!audio.current) {
                const context = new AudioContext();
                audio.current = context;
                context.onstatechange = () => {
                    if (audio.current === context) setPlaying(context.state === 'running');
                };
                // Resume directly from the click so browser autoplay rules are respected.
                const resumed = context.resume();
                const source = context.createBufferSource();
                source.buffer = createTheme(context);
                source.loop = true;
                const volume = context.createGain();
                volume.gain.value = .45;
                source.connect(volume).connect(context.destination);
                source.start();
                await resumed;
            } else if (audio.current.state === 'running') {
                await audio.current.suspend();
            } else {
                await audio.current.resume();
            }
        } catch {
            const context = audio.current;
            audio.current = null;
            if (context && context.state !== 'closed') void context.close();
            setPlaying(false);
            setError(true);
        } finally {
            setBusy(false);
        }
    };

    return <button type="button" onClick={toggle} disabled={busy} aria-pressed={playing}
        title={error ? '音乐未能播放，点击重试' : '遥远群星 · 氛围主题曲'}
        aria-label={playing ? '关闭主题音乐' : '播放主题音乐'}>
        {error ? '音乐重试' : playing ? '♫ 音乐开' : '♪ 音乐关'}
    </button>;
}
