import { useMemo } from 'react';
import type { PlayerView } from '../simulation/types';
import { systemForPlanet } from '../simulation/locations';
import { getShipProgress } from '../simulation/queries';
import { outgoingSignals } from './navigation';
import { useViewport } from './native/useViewport';
import { OrbitSurface } from './native/OrbitSurface';
import { ring } from './native/geometry';
import { mix, project, type Vec3 } from './native/math';
import type { NativeObject } from './native/bridge';
const colors={G:'#ffdf99',K:'#ffa85c',M:'#ff7159',F:'#dcecff'};
export function GalaxyMap({state,selectedId,onSelect,selectedShipId,onSelectShip}:{state:PlayerView;selectedId:string;onSelect:(id:string)=>void;selectedShipId?:string;onSelectShip:(id:string)=>void}){
    const position=(s:{x:number;y:number;z:number}):Vec3=>[s.x,s.y,s.z];
    const ships=state.ships.filter(s=>s.status!=='lost'&&s.status!=='arrived').flatMap(ship=>{
        const origin=systemForPlanet(state.systems,ship.originId),target=systemForPlanet(state.systems,ship.targetId);
        return origin&&target?[{ship,origin:position(origin),target:position(target),point:mix(position(origin),position(target),getShipProgress(state,ship))}]:[];
    });
    const objects=useMemo(()=>{
        const result:NativeObject[]=[5,10,15,20].map(r=>ring(`range:${r}`,[0,-.55,0],r,'#284450',.009));
        for(const s of state.systems){const size=s.id==='sol'?.26:s.spectral==='F'?.18:.13;
            result.push({id:s.id,position:position(s),radius:size,color:colors[s.spectral],unlit:true});
            if(s.id===selectedId||s.bodies.some(b=>state.intel[b.id].level==='colonized'))result.push(ring(`ring:${s.id}`,position(s),size*2.2,s.id===selectedId?'#f0b659':'#7fd6e6',.02));
        }
        for(const {ship,origin,target,point} of ships){result.push({id:`route:${ship.id}`,points:[origin,target],width:.012,color:'#567584'},{id:`ship:${ship.id}`,position:point,radius:ship.id===selectedShipId?.16:.11,color:ship.kind==='probe'?'#84d9e8':'#ffd481',unlit:true});}
        for(const order of outgoingSignals(state)){
            const origin=state.systems.find(s=>s.id===order.sourceId)??systemForPlanet(state.systems,order.sourceId),target=systemForPlanet(state.systems,order.targetId);
            if(!origin||!target||origin.id===target.id)continue;
            const t=Math.max(0,Math.min(1,(state.time-order.issuedAt)/(order.arrivesAt-order.issuedAt)));
            result.push({id:`signal-path:${order.id}`,points:[position(origin),position(target)],width:.006,color:'#735e3e'},ring(`signal:${order.id}`,mix(position(origin),position(target),t),.15,'#f2d297',.02));
        }
        return result;
    },[state,selectedId,selectedShipId]);
    const view=useViewport('galaxy',String(state.seed),{position:[0,8,13],target:[0,0,0],fov:46},objects);
    const rect=view.host.current?.getBoundingClientRect();
    const labels=[...state.systems.map(s=>({id:s.id,name:s.name,point:position(s),ship:false})),...ships.map(({ship,point})=>({id:ship.id,name:ship.name,point,ship:true}))];
    return <OrbitSurface view={view} className="galaxy-map" label="Unreal 银河星图，可拖动旋转、滚轮缩放" onClick={(x,y)=>{
        const hit=labels.map(l=>({...l,screen:project(l.point,view.camera.current,innerWidth,innerHeight)})).filter(l=>l.screen.visible&&Math.hypot(l.screen.x-x,l.screen.y-y)<18).sort((a,b)=>Math.hypot(a.screen.x-x,a.screen.y-y)-Math.hypot(b.screen.x-x,b.screen.y-y))[0];
        if(hit)(hit.ship?onSelectShip:onSelect)(hit.id);
    }}>{labels.map(l=>{const p=project(l.point,view.camera.current,innerWidth,innerHeight);return p.visible?<button key={(l.ship?'ship:':'star:')+l.id} className={'native-label'+((l.ship?selectedShipId:selectedId)===l.id?' active':'')} style={{left:p.x-(rect?.left??0),top:p.y-(rect?.top??0)+12}} onClick={()=>{(l.ship?onSelectShip:onSelect)(l.id);}}>{l.name}</button>:null;})}</OrbitSurface>;
}
