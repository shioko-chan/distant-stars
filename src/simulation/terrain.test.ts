import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { EARTH, geographicPoint, geographicUV, terrainSample } from './terrain';
import { planetPosition } from '../presentation/PlanetTerrain';
import { roadAccess, settleSurface, surfaceCost, surfacePower, surfaceProfile, validateSurface } from './surface';
import { createGame } from './world';
import type { SurfaceDraft, SurfaceProject } from './types';

const stroke=(lat:number,lon:number,kind: 'road'|'zone'='road'):SurfaceDraft=>({kind,zone:'farm',width:.00005,points:[geographicPoint(lat,lon),geographicPoint(lat,lon+.05)]});
const project=(d:SurfaceDraft):SurfaceProject=>({...d,id:'test',cost:surfaceCost(d,EARTH,6371),progress:100,spent:0,status:'已建成'});
describe('registered Earth geography',()=>{
    it('places east to the right when viewed from space with north up',()=>{
        const camera=new THREE.PerspectiveCamera(45,1,.1,10);
        camera.position.set(4,0,0); camera.up.set(0,1,0); camera.lookAt(0,0,0); camera.updateMatrixWorld();
        const screen=(lat:number,lon:number)=>new THREE.Vector3(...geographicPoint(lat,lon)).project(camera);
        expect(screen(0,20).x).toBeGreaterThan(screen(0,-20).x);
        expect(screen(20,0).y).toBeGreaterThan(screen(-20,0).y);
        expect(geographicUV(geographicPoint(0,20))[0]).toBeGreaterThan(geographicUV(geographicPoint(0,-20))[0]);
    });
    it('locates continents, ocean and the Tibetan plateau with the same UV convention',()=>{
        expect(geographicUV(geographicPoint(0,0))).toEqual([.5,.5]);
        for(const [lat,lon] of [[48,2],[25,20],[-25,135]]) expect(terrainSample(geographicPoint(lat,lon),EARTH).water).toBe(false);
        expect(terrainSample(geographicPoint(0,-140),EARTH).water).toBe(true);
        expect(terrainSample(geographicPoint(32,88),EARTH).height).toBeGreaterThan(3500);
        expect(terrainSample(geographicPoint(48,2),EARTH).height).toBeLessThan(500);
    });
    it('wraps the date line and samples both poles without invalid numbers',()=>{
        expect(terrainSample(geographicPoint(0,-180),EARTH)).toEqual(terrainSample(geographicPoint(0,180),EARTH));
        for(const lat of [-90,90]) expect(Object.values(terrainSample(geographicPoint(lat,0),EARTH)).every(v=>typeof v==='boolean'||Number.isFinite(v))).toBe(true);
    });
    it('uses exactly the simulation elevation for rendered geometry',()=>{
        const p=geographicPoint(32,88), height=terrainSample(p,EARTH).height;
        expect((planetPosition(new THREE.Vector3(...p),0,EARTH).length()-1.8)/1.8*6371000).toBeCloseTo(height,6);
    });
    it('rejects ocean construction and wide coastal footprints',()=>{
        expect(validateSurface([stroke(0,-140)],EARTH)).toContain('海域');
        // Inland France is valid; a broad stroke on the west coast extends into the Atlantic.
        expect(validateSurface([stroke(48,2)],EARTH)).toBe('');
        expect(validateSurface([{...stroke(46,-1),points:[geographicPoint(46,-1),geographicPoint(46.05,-1)],width:.02}],EARTH)).toContain('海域');
    });
    it('makes mountain roads more expensive and slower than equal-length lowland roads',()=>{
        const flat=stroke(48,2), mountains=stroke(48,10.8);
        expect(surfaceProfile(mountains,EARTH).slope).toBeGreaterThan(surfaceProfile(flat,EARTH).slope);
        expect(surfaceCost(mountains,EARTH,6371)).toBeGreaterThan(surfaceCost(flat,EARTH,6371));
        const a=createGame().worlds['sol-planet-2'],b=structuredClone(a);
        a.surface=[{...project(flat),progress:0}]; b.surface=[{...project(mountains),progress:0}];
        settleSurface(a);settleSurface(b);expect(a.surface[0].progress).toBeGreaterThan(b.surface[0].progress);
    });
    it('requires road frontage along the whole zone and applies local fertility to output',()=>{
        const zone=stroke(48,2,'zone'), road=project({...zone,kind:'road'});
        expect(roadAccess(zone,[road])).toBe(true);
        expect(roadAccess({...zone,points:[zone.points[0],geographicPoint(48,3)]},[road])).toBe(false);
        const w=createGame().worlds['sol-planet-2'];w.surface=[project(zone),road];
        const expected=Math.min(.2,Math.hypot(...zone.points[0].map((v,k)=>v-zone.points[1][k]))*zone.width*400)*(.25+surfaceProfile(zone,EARTH).fertility);
        expect(surfacePower(w,'farm')).toBeCloseTo(expected);
        w.surface=[project(zone)]; expect(surfacePower(w,'farm')).toBe(0);
    });
});
