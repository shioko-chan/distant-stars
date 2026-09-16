import type { PlayerView } from '../simulation/types';

/** Fleet authorizations travel with ships, not as administrative light signals. */
export function outgoingSignals(view: Pick<PlayerView, 'time' | 'ships' | 'orders'>) {
    const fleetOrders = new Set(view.ships.map(ship => ship.orderId));
    return view.orders.filter(order => order.status === 'transmitting'
        && !fleetOrders.has(order.id) && view.time >= order.issuedAt && view.time < order.arrivesAt);
}
