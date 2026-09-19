import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeSave } from '../persistence/save';
import { advanceMonths, applyAction, createGame } from '../simulation/world';
import { HOME } from '../simulation/locations';
import type { WorkerRequest, WorkerResponse } from './protocol';

const workerScope = {
    onmessage: (_event: { data: WorkerRequest }) => {},
    postMessage: (_response: WorkerResponse) => {},
};
let responses: WorkerResponse[] = [];
const send = (data: WorkerRequest) => {
    workerScope.onmessage({ data });
    return responses.at(-1);
};

beforeEach(async () => {
    responses = [];
    workerScope.postMessage = response => responses.push(response);
    vi.stubGlobal('self', workerScope);
    vi.resetModules();
    await import('./simulation.worker');
});
afterEach(() => vi.unstubAllGlobals());

describe('debug replay worker protocol', () => {
    it('rejects replay in normal mode while preserving the active game', () => {
        send({ type: 'init' });
        const before = send({ type: 'save' });
        expect(send({ type: 'replay' })).toMatchObject({ type: 'replay', status: 'error', notice: '请先启用调试模式' });
        expect(send({ type: 'save' })).toEqual(before);
    });

    it('replays recorded actions without changing time, pause state, or saved data', () => {
        let state = advanceMonths(applyAction(createGame(321), { type: 'research', focus: 'ecology', budget: 1.5 }).state, 18);
        state = advanceMonths(applyAction(state, { type: 'catalog' }).state, 6);
        state.pauseRequested = true;
        const raw = encodeSave(state);
        send({ type: 'init', debug: true, raw });
        expect(send({ type: 'replay' })).toMatchObject({ type: 'replay', status: 'passed', notice: '确定性回放校验通过', milliseconds: expect.any(Number) });
        expect(send({ type: 'save' })).toEqual({ type: 'save', raw });
    });

    it('reports a mismatch and still allows normal simulation', () => {
        const state = createGame();
        state.worlds[HOME].population += 1;
        const raw = encodeSave(state);
        send({ type: 'init', debug: true, raw });
        expect(send({ type: 'replay' })).toMatchObject({ type: 'replay', status: 'failed' });
        expect(send({ type: 'save' })).toEqual({ type: 'save', raw });
        expect(send({ type: 'advance', months: 1 })).toMatchObject({ type: 'view' });
    });

    it('keeps replay exceptions separate from fatal simulation errors', () => {
        const state = createGame();
        state.actions.push({ tick: 0, action: { type: 'route', targetId: 'missing-planet', enabled: true } });
        const raw = encodeSave(state);
        send({ type: 'init', debug: true, raw });
        expect(send({ type: 'replay' })).toMatchObject({ type: 'replay', status: 'error', notice: expect.stringContaining('回放失败') });
        expect(send({ type: 'save' })).toEqual({ type: 'save', raw });
        expect(send({ type: 'advance', months: 1 })).toMatchObject({ type: 'view' });
    });

    it('resets debug permission when initialized without the flag', () => {
        send({ type: 'init', debug: true });
        expect(send({ type: 'replay' })).toMatchObject({ status: 'passed' });
        send({ type: 'init' });
        expect(send({ type: 'replay' })).toMatchObject({ status: 'error', notice: '请先启用调试模式' });
    });
});
