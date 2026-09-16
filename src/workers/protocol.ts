import type { Action, PlayerView } from '../simulation/types';

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

export type WorkerResponse =
    | { type: 'save'; raw: string }
    | { type: 'error'; notice: string }
    | { type: 'view'; view: PlayerView; pause: boolean; notice: string; metrics: { milliseconds: number } };
