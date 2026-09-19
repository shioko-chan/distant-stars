import { useEffect, useRef, useState } from 'react';
import { createBridgeScene } from '../presentation/bridgeScene';
import type { BridgeMotionPhase } from '../presentation/bridgeMotion';
import { MusicControl } from './MusicControl';
import type { ThemeMusicControl } from './useThemeMusic';
import './bridgeIntro.css';

const phaseLabels: Record<BridgeMotionPhase, string> = {
    preparing: '准备就位', jumping: '前往中控台', landing: '已到达中控台', approaching: '正在接入指挥系统', complete: '指挥系统已接入',
};

export function BridgeIntro({ music, simulationReady, simulationError, onEnter, onNewGame }: {
    music: ThemeMusicControl;
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
    const [phase, setPhase] = useState<BridgeMotionPhase>('preparing');
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
            setError('无法启动三维舰桥。请确认浏览器支持 WebGL，然后重新接入。');
        }
        return () => { runtime.current?.dispose(); runtime.current = undefined; };
    }, [attempt]);
    const start = () => {
        if (!ready || !simulationReady || error || simulationError || departing) return;
        setDeparting(true); runtime.current?.start();
    };
    const canStart = ready && simulationReady && !error && !simulationError;
    return <main className={'bridge-intro' + (departing ? ' is-departing' : '')} aria-label="遥远群星 · 观景舰桥" data-phase={departing ? phase : ready ? 'welcome' : 'loading'}>
        <div className="bridge-scene" ref={host}/>
        <div className="intro-vignette" aria-hidden="true"/>
        <header className="intro-masthead">
            <div className="intro-wordmark"><span aria-hidden="true">✧</span><b>DISTANT STARS</b></div>
            <div className="intro-audio"><MusicControl control={music}/>{departing && !error && <button className="skip-arrival" onClick={onEnter}>跳过过场 ↗</button>}</div>
        </header>
        <div className="intro-heading" aria-hidden={departing}>
            <div className="intro-eyebrow"><i/>深空航行 · 观景甲板</div>
            <h1>遥远群星</h1>
            <p>一扇舷窗，一片星海。<br/>还有一位等待出发的舰长。</p>
        </div>
        <div className="intro-entry" aria-hidden={departing && !error}>
            {(error || simulationError) ? <div className="intro-error" role="alert"><p>{error || simulationError}</p><button onClick={() => error ? setAttempt(value => value + 1) : onNewGame()}>{error ? '重新接入舰桥' : '开始新纪元'}</button></div> : <>
                <button className="begin-voyage" disabled={!canStart || departing} onClick={start} tabIndex={departing ? -1 : 0}>
                    <span className="begin-symbol" aria-hidden="true">↗</span><span>{canStart ? '开始' : '正在接入舰桥'}<small>{canStart ? 'ENTER THE BRIDGE' : ready ? '正在连接模拟核心' : progress.total ? `载入资源 ${progress.loaded} / ${progress.total}` : 'LOADING OBSERVATION DECK'}</small></span><span className="begin-arrow" aria-hidden="true">⟶</span>
                </button>
                <p className="intro-instruction">{canStart ? '跟随黑猫，开启你的群星纪元。' : '正在准备舷窗、舰桥与同行者。'}</p>
            </>}
        </div>
        {departing && !error && <div className="arrival-caption" role="status"><span className="status-light"/>{phaseLabels[phase]}<small>COMMAND STATION / 01</small></div>}
        {!departing && !canStart && !error && !simulationError && <span className="intro-loading-status" role="status">{ready ? '正在连接模拟核心' : '正在加载三维舰桥'}</span>}
        <footer className="intro-footer"><span>DS–01 <i/> OBSERVATION DECK</span><a href="/models/credits.html" target="_blank" rel="noreferrer">模型鸣谢 ↗</a></footer>
    </main>;
}
