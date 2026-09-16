import { describe, expect, it } from 'vitest';
import { advanceMonths, applyAction, createGame, replay } from './world';
import { HOME, travelDistance } from './locations';
import { getPlayerView } from './queries';
import { decodeSave, encodeSave } from '../persistence/save';
import { geographicPoint } from './terrain';
import { surfaceCost } from './surface';
import type { Action, GameState, SurfaceDraft } from './types';

const MARS='sol-planet-3', VENUS='sol-planet-1';
function act(s:GameState,a:Action) { const result=applyAction(s,a); expect(result.error).toBe(''); return result.state; }
const launch=(targetId:string,kind:'colony'|'freighter'|'passenger'|'probe'='colony',originId=HOME):Action=>({type:'launch',originId,targetId,kind,authorization:'adaptive',risk:.5,goal:'housing'});
function colonies() {
    let s=act(createGame(),launch(MARS)); s=act(s,launch(VENUS));
    return advanceMonths(s,50);
}
describe('independent planetary development',()=>{
    it('settles two planets without replacing Earth and preserves replay and saves',()=>{
        const s=colonies();
        expect(Object.keys(s.worlds).sort()).toEqual([HOME,MARS,VENUS].sort());
        expect(s.worlds[MARS].name).toContain('火星');
        expect(s.worlds[HOME].population).toBeGreaterThan(1e9);
        expect(s.worlds[MARS].population).toBeGreaterThan(20000);
        expect(getPlayerView(s).worlds[MARS].planetId).toBe(MARS);
        expect(decodeSave(encodeSave(s))).toEqual(s);
        expect(replay(s.seed,s.actions,s.tick)).toEqual(s);
    });
    it('routes policies and surface projects to only the named planet',()=>{
        let s=colonies(); const earth=structuredClone(s.worlds[HOME]),venus=structuredClone(s.worlds[VENUS]);
        s=act(s,{type:'directive',directive:{targetId:MARS,kind:'policy',value:'ecology',budget:0,priority:2,deadline:s.time+10,risk:.5,authorization:'strict',after:'maintain'}});
        expect(s.worlds[MARS].policy).toBe('ecology'); expect(s.worlds[VENUS]).toEqual(venus); expect(s.worlds[HOME]).toEqual(earth);
        const road:SurfaceDraft={kind:'road',zone:'housing',width:.0001,points:[geographicPoint(0,0),geographicPoint(0,.1)]};
        s=act(s,{type:'directive',directive:{targetId:MARS,kind:'surface',value:'build',surface:[road],budget:surfaceCost(road,MARS,3390),priority:2,deadline:s.time+10,risk:.5,authorization:'strict',after:'maintain'}});
        s=advanceMonths(s,12);
        expect(s.worlds[MARS].surface[0].progress).toBeGreaterThan(0);
        expect(s.worlds[HOME].surface).toHaveLength(0); expect(s.worlds[VENUS].surface).toHaveLength(0);
    });
    it('delivers freight to Mars without crediting Venus, after a nonzero journey',()=>{
        let s=act(colonies(),launch(MARS,'freighter'));
        const ship=s.ships.at(-1)!; expect(ship.arrivesAt).toBeGreaterThan(ship.departsAt);
        const before=advanceMonths(s,Math.round((ship.arrivesAt-s.time)*12)-1);
        const empty=structuredClone(before); empty.ships.at(-1)!.cargo.food=0;
        const full=advanceMonths(before,1), control=advanceMonths(empty,1);
        expect(full.worlds[MARS].stock.food-control.worlds[MARS].stock.food).toBeCloseTo(400);
        expect(full.worlds[VENUS].stock).toEqual(control.worlds[VENUS].stock);
        expect(travelDistance(s.systems,HOME,MARS)).toBeGreaterThan(0);
    });
    it('allows a mature solar colony to send freight using its own stocks',()=>{
        let s=colonies(); s.worlds[MARS].spaceport=100; s.worlds[MARS].finance.balance=10000;
        s.worlds[MARS].stock={food:1000,energy:1000,materials:1000,goods:1000,components:1000};
        s=advanceMonths(s,1); const earth=structuredClone(s.worlds[HOME]);
        s=act(s,launch(VENUS,'freighter',MARS));
        expect(s.ships.at(-1)!.originId).toBe(MARS); expect(s.worlds[HOME]).toEqual(earth);
        expect(s.worlds[MARS].stock.food).toBeLessThan(1000);
    });
    it('rejects a gas giant, unknown destination and cargo to an unsettled planet without spending',()=>{
        const s=createGame();
        for(const a of [launch('sol-planet-4'),launch('sol'),launch('missing'),launch(MARS,'freighter')]) {
            const result=applyAction(s,a);expect(result.error).not.toBe('');expect(result.state).toEqual(s);
        }
    });
    it('keeps another planet in the same distant system unscanned',()=>{
        let s=act(createGame(),launch('star-1-planet-0','probe'));
        s=advanceMonths(s,Math.ceil((s.ships[0].arrivesAt-s.time+s.systems[1].distance)*12)+1);
        expect(s.intel['star-1-planet-0'].level).toBe('surveyed');
        expect(s.intel['star-1-planet-1'].level).toBe('observed');
        const view=getPlayerView(s);
        expect(view.systems[1].bodies[0].resources).toBeDefined();
        expect(view.systems[1].bodies[1].resources).toBeUndefined();
    });
});
