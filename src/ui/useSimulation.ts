import { useEffect, useRef, useState } from 'react';
import { BALANCE } from '../content/catalog';
import { SAVE_KEY } from '../persistence/save';
import type { Action, PlayerView } from '../simulation/types';
import type { WorkerRequest, WorkerResponse } from '../workers/protocol';

// Mount once in the application shell; pages only consume this session.
export function useSimulation() {
    const [view, setView] = useState<PlayerView>();
    const [notice, setNotice] = useState('正在连接模拟核心…');
    const [fatal, setFatal] = useState(false);
    const [speed, setSpeed] = useState(0);
    const [metrics, setMetrics] = useState(0);
    const worker = useRef<Worker | undefined>(undefined), speedRef = useRef(0), pending = useRef(false), fraction = useRef(0);
    speedRef.current = speed;
    const send = (request: WorkerRequest) => worker.current?.postMessage(request);
    const act = (action: Action) => send({ type: 'action', action });
    useEffect(() => {
        const w = new Worker(new URL('../workers/simulation.worker.ts', import.meta.url), { type: 'module' });
        worker.current = w;
        w.onmessage = (e: MessageEvent<WorkerResponse>) => {
            const result = e.data;
            pending.current = false;
            if (result.type === 'save') {
                try {
                    localStorage.setItem(SAVE_KEY, result.raw);
                    setNotice('档案已保存');
                }
                catch {
                    setNotice('保存失败：浏览器存储空间不足；当前游戏仍在运行');
                }
                return;
            }
            if (result.type === 'error') {
                setNotice(result.notice);
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
                setNotice(result.notice);
        };
        w.onerror = e => { setNotice(`模拟核心错误：${e.message}`); setFatal(true); setSpeed(0); pending.current = false; };
        try {
            w.postMessage({ type: 'init', raw: localStorage.getItem(SAVE_KEY) });
        }
        catch {
            w.postMessage({ type: 'init' });
            setNotice('无法读取浏览器存档');
        }
        const timer = window.setInterval(() => { if (pending.current || !speedRef.current)
            return; fraction.current += speedRef.current * 12 * .25; const months = Math.floor(fraction.current); if (months) {
            fraction.current -= months;
            pending.current = true;
            w.postMessage({ type: 'advance', months });
        } }, 250);
        const autosave = window.setInterval(() => w.postMessage({ type: 'save' }), 30000);
        return () => { clearInterval(timer); clearInterval(autosave); w.terminate(); worker.current = undefined; };
    }, []);
    const save = () => send({ type: 'save' }), load = () => { const raw = localStorage.getItem(SAVE_KEY); if (raw) {
        setSpeed(0);
        fraction.current = 0;
        send({ type: 'load', raw });
    }
    else
        setNotice('没有可读取存档'); };
    const startNewGame = () => {
        setSpeed(0);
        fraction.current = 0;
        send({ type: 'new', seed: BALANCE.seed });
    };
    const replay = () => send({ type: 'replay' });
    return { view, notice, fatal, speed, setSpeed, metrics, fraction, pending, act, save, load, startNewGame, replay };
}
