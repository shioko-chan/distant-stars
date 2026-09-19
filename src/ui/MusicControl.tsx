import { MUSIC_TRACKS } from '../content/music';
import type { ThemeMusicControl } from './useThemeMusic';

export function MusicControl({ control }: { control: ThemeMusicControl }) {
    const { enabled, playing, loading, error, trackIndex, toggle, select, next } = control;
    const track = MUSIC_TRACKS[trackIndex];
    const status = error ? '音频暂不可用，请重新开启音乐'
        : !enabled ? '音乐已关闭' : loading ? '正在准备曲目' : playing ? '正在播放 · 顺序循环' : '音乐已开启，首次交互后播放';
    return <div className="music-control" data-music-control role="group" aria-label="主题音乐" aria-busy={loading}>
        <button type="button" aria-pressed={enabled} onClick={toggle}
            title={status} aria-label={enabled ? '关闭主题音乐' : '开启主题音乐'}>
            {error ? '♪ 音频不可用' : enabled ? '♫ 音乐开' : '♪ 音乐关'}
        </button>
        <select aria-label="选择音乐曲目" value={trackIndex} title={`${track.title} · ${track.description} · ${status}`}
            onChange={event => select(Number(event.target.value))}>
            {MUSIC_TRACKS.map((item, i) => <option key={item.id} value={i}>{String(i + 1).padStart(2, '0')} · {item.title}</option>)}
        </select>
        <button type="button" aria-label="下一首曲目" title="下一首" onClick={next}>›</button>
    </div>;
}
