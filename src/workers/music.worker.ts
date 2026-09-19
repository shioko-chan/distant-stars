import { MUSIC_TRACKS } from '../content/music';
import { renderTheme } from '../presentation/themeMusic';

export interface MusicRenderRequest { trackIndex: number; sampleRate: number }
export type MusicRenderResult = { ok: true; left: ArrayBuffer; right: ArrayBuffer } | { ok: false };

self.onmessage = (event: MessageEvent<MusicRenderRequest>) => {
    try {
        const { trackIndex, sampleRate } = event.data;
        const { left, right } = renderTheme(MUSIC_TRACKS[trackIndex], sampleRate);
        const result: MusicRenderResult = { ok: true, left: left.buffer, right: right.buffer };
        self.postMessage(result, { transfer: [left.buffer, right.buffer] });
    } catch {
        const result: MusicRenderResult = { ok: false };
        self.postMessage(result);
    }
};
