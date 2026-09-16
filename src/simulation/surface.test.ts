import { EARTH, geographicPoint } from './terrain';
import { describe, expect, it } from 'vitest';
import { createGame, applyAction, advanceMonths, replay } from './world';
import { createWorld } from './generation';
import { getPlayerView } from './queries';
import { decodeSave, encodeSave } from '../persistence/save';
import { normalize, roadAccess, settleSurface, surfaceCost, surfacePower, validateSurface } from './surface';
import type { Action, GameState, SurfaceDraft } from './types';

const road: SurfaceDraft = { kind: 'road', zone: 'housing', width: .0003, points: [geographicPoint(48, 2), geographicPoint(48, 2.5)] };
const zone: SurfaceDraft = { kind: 'zone', zone: 'industry', width: .001, points: [geographicPoint(48.01, 2), geographicPoint(48.01, 2.5)] };
function plan(s: GameState, drafts: SurfaceDraft[], targetId = 'sol-planet-2'): Action {
    return { type: 'directive', directive: { targetId, kind: 'surface', value: 'build', surface: drafts, budget: drafts.reduce((n, p) => n + surfaceCost(p, s.worlds[targetId].planetId, s.worlds[targetId].radiusKm), 0), priority: 2, deadline: s.time + 50, risk: .5, authorization: 'strict', after: 'maintain' } };
}
describe('geographic development', () => {
    it('keeps individual planets deterministic and hides unreturned surveys', () => {
        const s = createGame(), view = getPlayerView(s);
        expect(s.systems[0].bodies).toHaveLength(8);
        expect(s.systems[0].bodies[2].name).toBe('地球');
        expect(s.worlds['sol-planet-2'].planetId).toBe(s.systems[0].bodies[2].id);
        expect(s.systems).toEqual(createGame().systems);
        expect(view.systems[1].bodies.every(b => b.habitability === undefined && b.resources === undefined)).toBe(true);
        s.intel['star-1-planet-1'].survey = structuredClone(s.systems[1]);
        expect(getPlayerView(s).systems[1].bodies[1].habitability).toBe(s.systems[1].habitability);
    });
    it('validates entire strokes and rejects corrupt coordinates without spending', () => {
        const s = createGame(); expect(validateSurface([road, zone], EARTH)).toBe('');
        const broken = { ...road, points: [[NaN, 0, 1], [0, 0, 1]] } as SurfaceDraft;
        const result = applyAction(s, plan(s, [broken]));
        expect(result.error).not.toBe(''); expect(result.state).toEqual(s);
        expect(validateSurface([{ ...road, points: [normalize([1, 0, 0]), normalize([1, .01, 0])] }], EARTH)).toContain('海域');
    });
    it('charges the quoted cost and records geographic strokes, not render tiles', () => {
        const s = createGame(), result = applyAction(s, plan(s, [road, zone]));
        expect(result.error).toBe('');
        expect(result.state.worlds['sol-planet-2'].finance.balance).toBe(s.worlds['sol-planet-2'].finance.balance - surfaceCost(road, EARTH, 6371) - surfaceCost(zone, EARTH, 6371));
        expect(result.state.worlds['sol-planet-2'].surface[0].points).toEqual(road.points);
        expect(result.state.worlds['sol-planet-2'].surface.every(p => p.progress === 0)).toBe(true);
        const a = plan(s, [road]); if (a.type === 'directive') a.directive.budget = 0;
        expect(applyAction(s, a).error).toContain('预算');
    });
    it('waits for roads and then grows buildings with material consumption', () => {
        const s = createGame(), w = applyAction(s, plan(s, [road, zone])).state.worlds['sol-planet-2'];
        const goods = w.stock.goods;
        settleSurface(w);
        expect(w.surface[0].progress).toBeGreaterThan(0);
        expect(w.surface[1].progress).toBe(0);
        expect(w.surface[1].status).toContain('缺少道路');
        for (let i = 0; i < 100; i++) settleSurface(w);
        expect(w.surface.every(p => p.progress === 100)).toBe(true);
        expect(w.stock.goods).toBeLessThan(goods);
        expect(surfacePower(w, 'industry')).toBeGreaterThan(0);
        expect(roadAccess({ ...zone, points: [normalize([0, .3, 1]), normalize([.01, .3, 1])] }, w.surface)).toBe(false);
    });
    it('stops construction when supplies are unavailable', () => {
        const s = createGame(), w = applyAction(s, plan(s, [road])).state.worlds['sol-planet-2'];
        w.stock.goods = 0; settleSurface(w);
        expect(w.surface[0].progress).toBe(0); expect(w.surface[0].status).toContain('工业品');
    });
    it('delivers remote plans and reports only after their light-time delays', () => {
        let s = createGame(); const sys = s.systems[1];
        s.worlds[sys.bodies.find(b=>b.primary)!.id] = createWorld(sys, s.time, s.seed);
        s.intel[sys.bodies.find(b=>b.primary)!.id] = { systemId: sys.id, planetId:sys.bodies.find(b=>b.primary)!.id, level: 'colonized', observedAt: s.time, receivedAt: s.time, uncertainty: .1, survey: sys, worldSnapshot: structuredClone(s.worlds[sys.bodies.find(b=>b.primary)!.id]) };
        s = applyAction(s, plan(s, [{ ...road, points: [normalize([-.004,.2,1]), normalize([.004,.2,1])] }], sys.bodies.find(b=>b.primary)!.id)).state;
        expect(s.worlds[sys.bodies.find(b=>b.primary)!.id].surface).toHaveLength(0);
        s = advanceMonths(s, Math.ceil(sys.distance * 12));
        expect(s.worlds[sys.bodies.find(b=>b.primary)!.id].surface).toHaveLength(1);
        expect(getPlayerView(s).worlds[sys.bodies.find(b=>b.primary)!.id].surface).toHaveLength(0);
        s = advanceMonths(s, Math.ceil(sys.distance * 12));
        expect(getPlayerView(s).worlds[sys.bodies.find(b=>b.primary)!.id].surface).toHaveLength(1);
    });
    it('round-trips construction and replays the same result across time batches', () => {
        const initial = createGame(), s = applyAction(initial, plan(initial, [road, zone])).state;
        const next = advanceMonths(s, 96);
        expect(decodeSave(encodeSave(next))).toEqual(next);
        const replayed = replay(next.seed, next.actions, next.tick);
        expect({ ...replayed, pauseRequested: false }).toEqual({ ...next, pauseRequested: false });
        expect(advanceMonths(advanceMonths(s, 48), 48)).toEqual(next);
        const corrupt = structuredClone(next); corrupt.worlds['sol-planet-2'].surface[0].points[0][0] = 999;
        expect(() => decodeSave(encodeSave(corrupt))).toThrow();
    });
});
