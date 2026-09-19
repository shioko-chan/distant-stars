import { useCallback, useEffect, useRef, useState } from 'react';
import { BALANCE } from '../content/catalog';
import { SAVE_KEY } from '../persistence/save';
import type { Action, PlayerView } from '../simulation/types';
import type { WorkerRequest, WorkerResponse } from '../workers/protocol';

export interface DebugEntry {
    id: number;
    time: number;
    level: 'info' | 'success' | 'error';
    message: string;
}

// Mount once in the application shell; pages only consume this session.
export function useSimulation(debugMode: boolean) {
    const [view, setView] = useState<PlayerView>();
    const [notice, setNotice] = useState('正在连接模拟核心…');
    const [fatal, setFatal] = useState(false);
    const [speed, setSpeed] = useState(0);
    const [metrics, setMetrics] = useState(0);
    const [debugLog, setDebugLog] = useState<DebugEntry[]>([]);
    const [replayPending, setReplayPending] = useState(false);
    const replayInFlight = useRef(false), logSequence = useRef(0);
    const logDebug = useCallback((message: string, level: DebugEntry['level'] = 'info') => {
        if (!debugMode) return;
        const entry = { id: ++logSequence.current, time: Date.now(), level, message };
        setDebugLog(log => [...log.slice(-199), entry]);
    }, [debugMode]);
    const reportNotice = useCallback((message: string, level: DebugEntry['level'] = 'info') => {
        setNotice(message);
        logDebug(message, level);
    }, [logDebug]);
    const worker = useRef<Worker | undefined>(undefined), speedRef = useRef(0), pending = useRef(false), fraction = useRef(0);
    speedRef.current = speed;
    const send = (request: WorkerRequest) => worker.current?.postMessage(request);
    const act = (action: Action) => send({ type: 'action', action });
    useEffect(() => {
        const w = new Worker(new URL('../workers/simulation.worker.ts', import.meta.url), { type: 'module' });
        worker.current = w;
        w.onmessage = (e: MessageEvent<WorkerResponse>) => {
            const result = e.data;
            if (result.type === 'replay') {
                replayInFlight.current = false;
                setReplayPending(false);
                logDebug(`${result.notice} · ${result.milliseconds.toFixed(1)} ms`, result.status === 'passed' ? 'success' : 'error');
                return;
            }
            pending.current = false;
            if (result.type === 'save') {
                try {
                    localStorage.setItem(SAVE_KEY, result.raw);
                    reportNotice('档案已保存');
                }
                catch {
                    reportNotice('保存失败：浏览器存储空间不足；当前游戏仍在运行', 'error');
                }
                return;
            }
            if (result.type === 'error') {
                reportNotice(result.notice, 'error');
                setSpeed(0);
                setFatal(true);
                return;
            }
            setFatal(false);
            setView(result.view);
            setMetrics(result.metrics.milliseconds);
            if (result.pause) {
                setSpeed(0);
                fraction.current = 0;
            }
            if (result.notice)
                reportNotice(result.notice);
        };
        w.onerror = e => { reportNotice(`模拟核心错误：${e.message}`, 'error'); setFatal(true); setSpeed(0); pending.current = false; replayInFlight.current = false; setReplayPending(false); };
        try {
            w.postMessage({ type: 'init', raw: localStorage.getItem(SAVE_KEY), debug: debugMode });
        }
        catch {
            w.postMessage({ type: 'init', debug: debugMode });
            reportNotice('无法读取浏览器存档', 'error');
        }
        const timer = window.setInterval(() => { if (pending.current || replayInFlight.current || !speedRef.current)
            return; fraction.current += speedRef.current * 12 * .25; const months = Math.floor(fraction.current); if (months) {
            fraction.current -= months;
            pending.current = true;
            w.postMessage({ type: 'advance', months });
        } }, 250);
        const autosave = window.setInterval(() => w.postMessage({ type: 'save' }), 30000);
        return () => { clearInterval(timer); clearInterval(autosave); w.terminate(); worker.current = undefined; };
    }, [debugMode, logDebug, reportNotice]);
    const save = () => send({ type: 'save' }), load = () => { const raw = localStorage.getItem(SAVE_KEY); if (raw) {
        setSpeed(0);
        fraction.current = 0;
        send({ type: 'load', raw });
    }
    else
        reportNotice('没有可读取存档'); };
    const startNewGame = () => {
        setSpeed(0);
        fraction.current = 0;
        send({ type: 'new', seed: BALANCE.seed });
    };
    const replay = () => {
        if (!debugMode || !view || fatal || replayInFlight.current) return;
        setSpeed(0);
        speedRef.current = 0;
        replayInFlight.current = true;
        setReplayPending(true);
        logDebug('开始校验本局确定性回放；时间已暂停。');
        send({ type: 'replay' });
    };
    const clearDebugLog = () => setDebugLog([]);
    return { view, notice, fatal, speed, setSpeed, metrics, fraction, pending, act, save, load, startNewGame, replay, replayPending, debugLog, logDebug, clearDebugLog };
}
