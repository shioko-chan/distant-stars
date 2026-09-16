import { describe, expect, it } from 'vitest';
import { createGame, applyAction } from '../simulation/world';
import { getPlayerView } from '../simulation/queries';
import { outgoingSignals } from './navigation';
import type { Order } from '../simulation/types';

describe('visible outgoing signals', () => {
    it('does not draw fleet authorization as a light signal', () => {
        const state = applyAction(createGame(), {
            type: 'launch', originId: 'sol-planet-2', targetId: 'star-1-planet-1',
            kind: 'probe', authorization: 'adaptive', risk: .5, goal: 'housing',
        }).state;
        const view = getPlayerView(state);
        expect(view.ships).toHaveLength(1);
        expect(view.orders.some(order => order.id === view.ships[0].orderId)).toBe(true);
        expect(outgoingSignals(view)).toEqual([]);
    });

    it('shows only the outward transit, not a fictional return confirmation', () => {
        const order: Order = { id: 'test', sourceId: 'sol-planet-2', targetId: 'star-1-planet-1',
            kind: 'policy', value: 'balanced', budget: 0, priority: 1, deadline: 2200,
            risk: .5, authorization: 'adaptive', after: 'maintain', issuedAt: 2180,
            arrivesAt: 2184, status: 'transmitting', result: '等待报告' };
        const view = { orders: [order], ships: [], time: 2182 };
        expect(outgoingSignals(view)).toEqual([order]);
        expect(outgoingSignals({ ...view, time: 2179 })).toEqual([]);
        expect(outgoingSignals({ ...view, time: 2184 })).toEqual([]);
        expect(outgoingSignals({ ...view, time: 2188 })).toEqual([]);
        expect(outgoingSignals({ ...view, orders: [{ ...order, status: 'executed' }] })).toEqual([]);
    });
});
