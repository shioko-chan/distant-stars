import { createGame, applyAction, advanceMonths, replay } from '../simulation/world';
import { getPlayerView } from '../simulation/queries';
import { decodeSave, encodeSave } from '../persistence/save';
import type { Action } from '../simulation/types';
export type WorkerRequest = {
    type: 'init';
    raw?: string | null;
} | {
    type: 'new';
    seed: number;
} | {
    type: 'action';
    action: Action;
} | {
    type: 'advance';
    months: number;
} | {
    type: 'save';
} | {
    type: 'load';
    raw: string;
} | {
    type: 'replay';
};
let state = createGame();
let initialized = false;
self.onmessage = (event: MessageEvent<WorkerRequest>) => {
    const start = performance.now();
    let notice = event.data.type === 'init' ? '模拟核心已就绪' : '';
    try {
        const request = event.data;
        if (request.type === 'init') {
            state = request.raw ? decodeSave(request.raw) : createGame();
            initialized = true;
        }
        if (request.type === 'new') {
            state = createGame(request.seed);
            initialized = true;
            notice = '新纪元已开始';
        }
        if (request.type === 'load') {
            state = decodeSave(request.raw);
            initialized = true;
            notice = '已读取最近存档';
        }
        if (!initialized) throw new Error('请先读取有效存档或开始新纪元；原存档未覆盖');
        if (request.type === 'action') {
            const result = applyAction(state, request.action);
            state = result.state;
            if (result.error)
                notice = result.error;
            else
                notice = '指令已记录';
        }
        if (request.type === 'advance')
            state = advanceMonths(state, Math.min(240, Math.max(0, request.months)), true);
        if (request.type === 'save') {
            self.postMessage({ type: 'save', raw: encodeSave(state) });
            return;
        }
        if (request.type === 'replay') {
            const replayed = replay(state.seed, state.actions, state.tick);
            const canonical = (s: typeof state) => JSON.stringify({ ...s, pauseRequested: false });
            notice = canonical(replayed) === canonical(state) ? '确定性回放校验通过' : '回放不一致：请保存并报告此问题';
        }
        if (state.pauseRequested && !notice)
            notice = '自动暂停：' + (state.messages.filter(m => m.pause).at(-1)?.title ?? '重要事件');
        self.postMessage({ type: 'view', view: getPlayerView(state), pause: state.pauseRequested, notice, metrics: { milliseconds: performance.now() - start } });
    }
    catch (error) {
        self.postMessage({ type: 'error', notice: error instanceof Error ? error.message : '模拟出错' });
    }
};
