import { describe, expect, it } from 'vitest';
import { advanceMonths, applyAction, createGame, replay, shipSpeed } from './world';
import { getPlayerView } from './queries';
import { decodeSave, encodeSave } from '../persistence/save';
import { generateSystem, createWorld } from './generation';
import type { Action, Directive, GameState } from './types';
const action = (s: GameState, a: Action) => { const r = applyAction(s, a); expect(r.error).toBe(''); return r.state; };
const directive = (targetId: string, kind: Directive['kind'], value: string): Action => ({ type: 'directive', directive: { targetId, kind, value, budget: 500, priority: 2, deadline: 4000, risk: .5, authorization: 'adaptive', after: 'maintain' } });
const launch = (s: GameState, kind: 'probe' | 'colony' = 'probe', targetId = 'star-1-planet-1') => action(s, { type: 'launch', originId: 'sol-planet-2', targetId, kind, authorization: 'adaptive', risk: .5, goal: 'housing' });
function remote() { const s = createGame(); const sys = s.systems[1]; s.worlds[sys.bodies.find(b=>b.primary)!.id] = createWorld(sys, s.time, s.seed); s.intel[sys.bodies.find(b=>b.primary)!.id] = { systemId: sys.id, planetId:sys.bodies.find(b=>b.primary)!.id, level: 'colonized', observedAt: s.time - 3, receivedAt: s.time, uncertainty: .16, survey: sys, worldSnapshot: structuredClone(s.worlds[sys.bodies.find(b=>b.primary)!.id]) }; return s; }
describe('first playable baseline', () => {
    it('generates 100 systems on demand with radial distances and hidden anomalies', () => { let s = createGame(); expect(s.systems).toHaveLength(20); while (s.systems.length < 100)
        s = action(s, { type: 'catalog' }); expect(s.systems).toHaveLength(100); expect(s.systems[8]).toEqual(generateSystem(s.seed, 8)); for (const sys of s.systems)
        expect(Math.hypot(sys.x, sys.y, sys.z)).toBeCloseTo(sys.distance, 8); expect(getPlayerView(s).systems[8].anomaly).toBeUndefined(); });
    it('starts probes at .01c and spends material stocks', () => { const s = createGame(), n = launch(s); expect(n.ships[0].velocityC).toBe(.01); expect(n.worlds['sol-planet-2'].stock.goods).toBeLessThan(s.worlds['sol-planet-2'].stock.goods); expect(n.ships[0].properYears).toBeLessThan(n.ships[0].arrivesAt - n.ships[0].departsAt); });
    it('delivers survey information only after physical travel and return light time', () => { const s = launch(createGame()), ship = s.ships[0], arrivalTick = Math.ceil((ship.arrivesAt - 2180) * 12 - 1e-6); const arrived = advanceMonths(s, arrivalTick); expect(arrived.ships[0].status).toBe('arrived'); expect(getPlayerView(arrived).intel['star-1-planet-1'].level).toBe('observed'); const before = advanceMonths(arrived, Math.ceil(arrived.systems[1].distance * 12) - 1); expect(before.intel['star-1-planet-1'].level).toBe('observed'); const after = advanceMonths(before, 1); expect(after.intel['star-1-planet-1'].level).toBe('surveyed'); });
    it('completes exploration, founding, local history and delayed policy feedback', () => { let s = launch(createGame()); s = advanceMonths(s, Math.ceil((s.ships[0].arrivesAt - 2180 + s.systems[1].distance) * 12) + 1); s = launch(s, 'colony'); const ship = s.ships[1]; s = advanceMonths(s, Math.ceil((ship.arrivesAt - s.time) * 12 - 1e-6)); expect(s.worlds['star-1-planet-1']).toBeDefined(); expect(getPlayerView(s).worlds['star-1-planet-1']).toBeUndefined(); s = advanceMonths(s, Math.ceil(s.systems[1].distance * 12) + 1); expect(s.intel['star-1-planet-1'].worldSnapshot?.foundedAt).toBe(ship.arrivesAt); expect(s.milestones).toContain('first-colony'); s = action(s, directive('star-1-planet-1', 'policy', 'ecology')); const id = s.orders.at(-1)!.id; s = advanceMonths(s, Math.ceil(s.systems[1].distance * 12)); expect(s.orders.find(o => o.id === id)?.status).toBe('executed'); expect(s.knownOrders.find(o => o.id === id)?.status).toBe('transmitting'); s = advanceMonths(s, Math.ceil(s.systems[1].distance * 12)); expect(s.knownOrders.find(o => o.id === id)?.status).toBe('executed'); });
    it('never includes hidden truth or undisclosed order results in the player query', () => { const s = remote(), before = getPlayerView(s); s.worlds['star-1-planet-1'].population = 999; s.worlds['star-1-planet-1'].policy = 'control'; s.worlds.secret = createWorld(generateSystem(s.seed, 60), s.time, s.seed); expect(getPlayerView(s)).toEqual(before); });
    it('keeps corrections ordered and acknowledges them after return delay', () => { let s = remote(); s = action(s, directive('star-1-planet-1', 'policy', 'industry')); s = action(s, directive('star-1-planet-1', 'policy', 'ecology')); expect(new Set(s.orders.map(o => o.id)).size).toBe(2); s = advanceMonths(s, Math.ceil(s.systems[1].distance * 12)); expect(s.worlds['star-1-planet-1'].policy).toBe('ecology'); expect(s.knownOrders.every(o => o.status === 'transmitting')).toBe(true); });
    it('does not permit illegal policies or reforms', () => { let s = action(createGame(), directive('sol-planet-2', 'policy', 'control')); expect(s.worlds['sol-planet-2'].policy).toBe('balanced'); expect(s.knownOrders.at(-1)?.status).toBe('rejected'); s = action(s, directive('sol-planet-2', 'reform', 'directorate')); expect(s.worlds['sol-planet-2'].regime).toBe('republic'); });
    it('is independent of advance batch sizes and reproduces saved action history', () => { let s = createGame(); s = action(s, directive('sol-planet-2', 'policy', 'ecology')); s = launch(s); const one = advanceMonths(s, 600); let many = s; for (let i = 0; i < 100; i++)
        many = advanceMonths(many, 6); expect({ ...many, pauseRequested: false }).toEqual({ ...one, pauseRequested: false }); const played = replay(one.seed, one.actions, one.tick); expect({ ...played, pauseRequested: false }).toEqual({ ...one, pauseRequested: false }); });
    it('round-trips pending signals, RNG and history and rejects corrupt saves', () => { const s = advanceMonths(launch(createGame()), 12); expect(decodeSave(encodeSave(s))).toEqual(s); expect(() => decodeSave('{"version":1}')).toThrow(); expect(() => decodeSave(JSON.stringify({ ...s, tick: -1 }))).toThrow(); });
    it('keeps an unattended home viable for 600 years and researches all five directions', () => { const s = advanceMonths(createGame(), 7200), w = s.worlds['sol-planet-2']; expect(s.failed).toBe(false); expect(w.population).toBeGreaterThan(1e9); expect(w.stock.food).toBeGreaterThan(0); expect(w.support).toBeGreaterThan(35); for (const level of Object.values(w.tech))
        expect(level).toBeGreaterThan(0); expect(shipSpeed(w, 'probe')).toBeLessThanOrEqual(.25); expect(w.cohorts).toHaveLength(12); });
    it('creates different economic, political and surface histories under different policies', () => { const base = createGame(); const a = advanceMonths(action(base, directive('sol-planet-2', 'policy', 'industry')), 1200).worlds['sol-planet-2']; const b = advanceMonths(action(base, directive('sol-planet-2', 'policy', 'ecology')), 1200).worlds['sol-planet-2']; expect(a.ecology).toBeLessThan(b.ecology - 20); expect(a.industry).toBeGreaterThan(b.industry); expect(a.support).not.toBeCloseTo(b.support, 0); expect(a.districts[1].pollution).toBeGreaterThan(b.districts[1].pollution); });
    it('delivers physical relief cargo only with its ship', () => { let s = remote(); const prior = s.worlds['star-1-planet-1'].stock.food; s = action(s, { type: 'launch', originId: 'sol-planet-2', targetId: 'star-1-planet-1', kind: 'freighter', authorization: 'adaptive', risk: .5, goal: 'farm' }); expect(s.worlds['star-1-planet-1'].stock.food).toBe(prior); expect(s.ships[0].cargo.food).toBe(400); expect(s.worlds['sol-planet-2'].stock.food).toBeLessThan(createGame().worlds['sol-planet-2'].stock.food); });
    it('can discover and influence the fixed civilization through delayed contact', () => { let s = launch(createGame(), 'probe', 'star-8-planet-1'); s = advanceMonths(s, Math.ceil((s.ships[0].arrivesAt - 2180 + s.systems[8].distance) * 12) + 1); expect(s.intel['star-8-planet-1'].survey?.anomaly).toBe('civilization'); s = action(s, directive('star-8-planet-1', 'contact', 'exchange')); s = advanceMonths(s, Math.ceil(s.systems[8].distance * 12) + 120); expect(s.worlds['star-8-planet-1'].contact).toBe('exchange'); expect(s.worlds['star-8-planet-1'].alienTrust).toBeGreaterThan(50); });
    it('stops on a received major event without advancing through the pause', () => { let s = createGame(); s.worlds['sol-planet-2'].stock.food = 0; const next = advanceMonths(s, 240, true); expect(next.pauseRequested).toBe(true); expect(next.tick).toBeLessThan(240); });
    it('requires combined construction and cargo stocks instead of spending the same goods twice',()=>{
        const s=remote();s.worlds['sol-planet-2'].stock.goods=310;
        const result=applyAction(s,{type:'launch',originId:'sol-planet-2',targetId:'star-1-planet-1',kind:'freighter',authorization:'adaptive',risk:.5,goal:'farm'});
        expect(result.error).not.toBe('');expect(result.state.worlds['sol-planet-2'].stock.goods).toBe(310);expect(result.state.ships).toHaveLength(0);
    });
    it('organizes authorized local expansion without disclosing it before light arrival', () => {
        let s = remote();
        const w = s.worlds['star-1-planet-1'];
        w.charter = true;
        w.spaceport = 100;
        w.tech.propulsion = 2;
        w.population = 100000;
        w.cohorts.forEach(c => c.size = w.population / 12);
        w.industry = 50;
        w.finance.balance = 50000;
        s = advanceMonths(s, 120);
        const local = s.ships.find(ship => ship.originId === 'star-1-planet-1');
        expect(local).toBeDefined();
        expect(s.knownShips.some(ship => ship.id === local!.id)).toBe(false);
        s = advanceMonths(s, Math.ceil(s.systems[1].distance * 12));
        expect(s.knownShips.some(ship => ship.id === local!.id)).toBe(true);
    });
    it('evacuates with an existing ship only after the command arrives', () => {
        let s = remote();
        s = action(s, { type: 'launch', originId: 'sol-planet-2', targetId: 'star-1-planet-1', kind: 'freighter', authorization: 'adaptive', risk: .5, goal: 'farm' });
        s = advanceMonths(s, Math.ceil((s.ships[0].arrivesAt - s.time + s.systems[1].distance) * 12) + 1);
        const population = s.worlds['star-1-planet-1'].population;
        s = action(s, directive('star-1-planet-1', 'evacuate', 'sol-planet-2'));
        expect(s.worlds['star-1-planet-1'].population).toBe(population);
        s = advanceMonths(s, Math.ceil(s.systems[1].distance * 12));
        expect(s.ships[0].targetId).toBe('sol-planet-2');
        expect(s.ships[0].passengers).toBeGreaterThan(0);
        expect(s.knownShips[0].targetId).toBe('star-1-planet-1');
    });
    it('runs 8 worlds and 100 ships with bounded snapshots for a century', () => {
        let s = createGame();
        while (s.systems.length < 100)
            s = action(s, { type: 'catalog' });
        for (let i = 1; i < 8; i++)
            s.worlds[s.systems[i].bodies.find(b=>b.primary)!.id] = createWorld(s.systems[i], s.time, s.seed);
        s = launch(s);
        const template = s.ships[0];
        for (let i = 1; i < 100; i++)
            s.ships.push({ ...structuredClone(template), id: `load-ship-${i}`, arrivesAt: 4000 });
        const start = performance.now();
        s = advanceMonths(s, 1200);
        const ms = performance.now() - start;
        expect(Object.keys(s.worlds)).toHaveLength(8);
        expect(s.ships).toHaveLength(100);
        expect(Object.values(s.worlds).every(w => Number.isFinite(w.population))).toBe(true);
        expect(ms).toBeLessThan(15000);
        console.log(`Scale check: 8 worlds / 100 ships / 100 years: ${ms.toFixed(0)} ms; save ${(encodeSave(s).length / 1024).toFixed(0)} KiB`);
    }, 20000);
});
