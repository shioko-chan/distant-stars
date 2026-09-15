import { BALANCE, PROJECTS } from '../content/catalog';
import type { GameState, PlayerView, ResearchFocus, Ship, WorldState } from './types';
/** The only boundary exposed to presentation. Never spread authoritative state. */
export function getPlayerView(s: GameState): PlayerView {
    const intel = structuredClone(s.intel), worlds: PlayerView['worlds'] = {};
    for (const [id, record] of Object.entries(intel))
        if (record.worldSnapshot)
            worlds[id] = record.worldSnapshot;
    const systems = s.systems.map(sys => { const survey = intel[sys.id]?.survey; return { id: sys.id, name: sys.name, x: sys.x, y: sys.y, z: sys.z, distance: sys.distance, spectral: sys.spectral, planets: sys.planets, habitability: survey?.habitability ?? 0, resources: survey?.resources ?? 0, risk: survey?.risk ?? 0, ...(survey?.anomaly ? { anomaly: survey.anomaly } : {}) }; });
    return { time: s.time, seed: s.seed, systems, intel, worlds, ships: structuredClone(s.knownShips), orders: structuredClone(s.knownOrders), messages: structuredClone(s.messages), milestones: s.milestones.filter(x => !x.startsWith('founded-')), routes: [...s.routes], failed: s.failed, credits: worlds.sol.finance.balance, capacity: 100 };
}
export function getShipProgress(state: {
    time: number;
}, ship: Ship) { return Math.max(0, Math.min(1, (state.time - ship.departsAt) / (ship.arrivesAt - ship.departsAt))); }
export function estimateWorld(view: PlayerView, id: string) { const record = view.intel[id], w = record?.worldSnapshot; if (!w)
    return undefined; const age = Math.max(0, view.time - record.observedAt), error = Math.min(.8, record.uncertainty + age * .008); const population = w.population * Math.exp(Math.min(age, 100) * .004); return { population, lower: population * (1 - error), upper: population * (1 + error), age, error }; }
export function researchEstimate(w:WorldState,key:ResearchFocus) {
    const science=w.districts.reduce((n,d)=>n+d.parcels.filter(p=>p==='science').length/64*(d.progress/100+.2)*(1-d.damage/100),0);
    const rate=(key===w.focus?2:.6)*w.finance.budget*(.5+science*.25);
    const years=(1-w.research[key])*BALANCE.researchYears*(1+w.knowledge[key]*.25)/Math.max(.01,rate);
    const prerequisite=key==='propulsion'?Math.min(w.knowledge.industry,w.knowledge.ecology)+1:Math.min(...Object.values(w.knowledge))+2;
    return {name:PROJECTS[key][w.knowledge[key]]??'初版技术上限',low:Math.ceil(years/1.15),high:Math.ceil(years/.65),blocked:w.knowledge[key]>=prerequisite,complete:w.knowledge[key]>=BALANCE.maxTech};
}
