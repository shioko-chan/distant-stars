import { useEffect, useRef, useState } from 'react';
import './audioSettings.css';

const storageKey = 'distant-stars.audio-settings';
interface Volumes { music: number; effects: number }
export function useAudioSettings() {
    const [volumes, setVolumes] = useState<Volumes>(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
            const valid = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
            return { music: valid(saved?.music) ? saved.music : .5, effects: valid(saved?.effects) ? saved.effects : .5 };
        } catch { return { music: .5, effects: .5 }; }
    });
    useEffect(() => {
        try { localStorage.setItem(storageKey, JSON.stringify(volumes)); } catch { /* Settings still work for this session when storage is unavailable. */ }
    }, [volumes]);
    return { ...volumes, setVolume: (channel: keyof Volumes, value: number) => setVolumes(previous => ({ ...previous, [channel]: value })) };
}
export type AudioSettingsControl = ReturnType<typeof useAudioSettings>;

export function AudioSettings({ settings }: { settings: AudioSettingsControl }) {
    const dialog = useRef<HTMLDialogElement>(null);
    return <>
        <button type="button" className="settings-launcher" aria-label="打开设置" title="设置" onClick={() => dialog.current?.showModal()}>
            <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 2 3-1 2 3 3-1 1-3 3-1 2-3-2-2 1-3-3-2-3 1-2-3Z"/><circle cx="12" cy="11" r="3"/></svg>
        </button>
        <dialog ref={dialog} className="audio-settings" aria-labelledby="audio-settings-title" onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }} onKeyDown={event => event.stopPropagation()}>
            <div className="audio-settings-content">
                <header><div><small>SETTINGS</small><h2 id="audio-settings-title">设置</h2></div><button type="button" aria-label="关闭设置" onClick={() => dialog.current?.close()}>×</button></header>
                <p>声音</p>
                {(['music', 'effects'] as const).map(channel => <label key={channel} className="audio-setting-row">
                    <span>{channel === 'music' ? '背景音乐音量' : '音效音量'}<output>{Math.round(settings[channel] * 100)}%</output></span>
                    <input type="range" min="0" max="100" step="1" value={Math.round(settings[channel] * 100)} aria-label={channel === 'music' ? '背景音乐音量' : '音效音量'} onChange={event => settings.setVolume(channel, Number(event.target.value) / 100)}/>
                </label>)}
                <small className="audio-settings-note">设置自动保存。当前版本暂无独立音效。</small>
            </div>
        </dialog>
    </>;
}
