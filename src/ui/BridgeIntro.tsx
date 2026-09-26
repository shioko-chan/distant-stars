import { AudioSettings, type AudioSettingsControl } from './AudioSettings';
import { useEffect, useRef, useState } from 'react';
import { createBridgeScene } from '../presentation/bridgeScene';
import type { BridgeMotionPhase } from '../presentation/bridgeMotion';
import { HABITAT_RADIUS_M, HABITAT_ROTATION_PERIOD } from '../presentation/habitatFrame';
import { MusicControl } from './MusicControl';
import type { ThemeMusicControl } from './useThemeMusic';
import './bridgeIntro.css';

const phaseLabels: Record<BridgeMotionPhase, string> = {
    approaching: '走向窗边书桌', seating: '在窗前落座', companion: '猫咪来陪你看星星', complete: '星图已就绪',
};

export function BridgeIntro({ active, audioSettings, music, simulationReady, simulationError, onEnter, onNewGame }: {
    active: boolean;
    music: ThemeMusicControl;
    audioSettings: AudioSettingsControl;
    simulationReady: boolean;
    simulationError?: string;
    onEnter: () => void;
    onNewGame: () => void;
}) {
    const host = useRef<HTMLDivElement>(null);
    const runtime = useRef<ReturnType<typeof createBridgeScene> | undefined>(undefined);
    const complete = useRef(onEnter); complete.current = onEnter;
    const [ready, setReady] = useState(false), [error, setError] = useState('');
    const [attempt, setAttempt] = useState(0), [departing, setDeparting] = useState(false);
    const [phase, setPhase] = useState<BridgeMotionPhase>('approaching');
    const [progress, setProgress] = useState({ loaded: 0, total: 0 });
    useEffect(() => {
        setReady(false); setError(''); setDeparting(false); setProgress({ loaded: 0, total: 0 });
        try {
            runtime.current = createBridgeScene(host.current!, {
                onReady: () => setReady(true),
                onError: message => setError(message),
                onProgress: (loaded, total) => setProgress({ loaded, total }),
                onPhase: setPhase,
                onComplete: () => complete.current(),
            });
        } catch {
            setError('无法启动顶层居所。请确认浏览器支持 WebGL，然后重新接入。');
        }
        return () => { runtime.current?.dispose(); runtime.current = undefined; };
    }, [attempt]);
    useEffect(() => {
        runtime.current?.setActive(active);
        if (active) { setDeparting(false); setPhase('approaching'); }
    }, [active, attempt]);
    const start = () => {
        if (!ready || !simulationReady || error || simulationError || departing) return;
        setDeparting(true); runtime.current?.start();
    };
    const canStart = ready && simulationReady && !error && !simulationError;
    return <main hidden={!active} className={'bridge-intro' + (departing ? ' is-departing' : '')} aria-label="遥远群星 · 曙光城顶层居所" data-phase={departing ? phase : ready ? 'welcome' : 'loading'}>
        <div className="bridge-scene" ref={host}/>
        <div className="intro-vignette" aria-hidden="true"/>
        <header className="intro-masthead">
            <div className="intro-wordmark"><span aria-hidden="true">✧</span><b>DISTANT STARS</b></div>
            <div className="intro-audio"><MusicControl control={music}/>{departing && !error && <button className="skip-arrival" onClick={onEnter}>跳过过场 ↗</button>}<AudioSettings settings={audioSettings}/></div>
        </header>
        <div className="intro-entry" aria-hidden={departing && !error}>
            <div className="residence-title"><span><i/> EARTH ORBIT / AURORA</span><h1>曙光城<span>顶层居所</span></h1><p>万家灯火之上，遥望我们的蓝色家园。</p><div className="habitat-status" aria-label="旋转居住带参数"><span>旋转居住带</span><span>对地定向</span><span>半径 {HABITAT_RADIUS_M / 1000} km</span><span>1.00 g</span><span>{(HABITAT_ROTATION_PERIOD / 60).toFixed(2)} 分钟 / 圈</span></div></div>
            {(error || simulationError) ? <div className="intro-error" role="alert"><p>{error || simulationError}</p><button onClick={() => error ? setAttempt(value => value + 1) : onNewGame()}>{error ? '重新进入起居室' : '开始新纪元'}</button></div> : <>
                <button className="begin-voyage" disabled={!canStart || departing} onClick={start} tabIndex={departing ? -1 : 0}>
                    <span className="begin-symbol" aria-hidden="true">↗</span><span>{canStart ? '开始' : '正在准备房间'}<small>{canStart ? 'EXPLORE THE STARS' : ready ? '正在连接模拟核心' : progress.total ? `载入资源 ${progress.loaded} / ${progress.total}` : 'PREPARING YOUR ROOM'}</small></span><span className="begin-arrow" aria-hidden="true">⟶</span>
                </button>
            </>}
        </div>
        {departing && !error && <div className="arrival-caption" role="status"><span className="status-light"/>{phaseLabels[phase]}<small>A WINDOW TO THE STARS</small></div>}
        {!departing && !canStart && !error && !simulationError && <span className="intro-loading-status" role="status">{ready ? '正在连接模拟核心' : '正在加载顶层居所'}</span>}
        <footer className="intro-footer"><span>AURORA <i/> HOME ABOVE THE CITY</span><span className="residence-controls">点击地面移动 · 拖动环顾<span> · WASD / ↑↓←→</span></span><a href="/models/credits.html" target="_blank" rel="noreferrer">模型鸣谢 ↗</a></footer>
    </main>;
}
