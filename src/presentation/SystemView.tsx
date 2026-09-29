import { solarTexture } from '../content/solar';
import { useMemo, useState } from 'react';
import type { IntelRecord, StarSystem, WorldState } from '../simulation/types';
import { useViewport } from './native/useViewport';
import { OrbitSurface } from './native/OrbitSurface';
import { ring } from './native/geometry';
import { project, type Vec3 } from './native/math';
import type { NativeObject } from './native/bridge';
export function SystemView({ system, worlds, intel, onSelect, onSurface, onExplore }: {
    system: StarSystem; worlds: Record<string,WorldState>; intel: Record<string,IntelRecord>; onSelect: (id:string)=>void;
    onSurface: (id:string) => void; onExplore: (id:string) => void;
}) {
    const [selected,setSelected]=useState<string>();
    const planet=system.bodies.find(b=>b.id===selected),colony=planet&&worlds[planet.id],record=planet&&intel[planet.id];
    const bodies=system.bodies.map((body,i)=>({body,point:[Math.cos(i*2.4+.3)*(1.4+i*.62),0,Math.sin(i*2.4+.3)*(1.4+i*.62)] as Vec3}));
    const objects=useMemo(()=>{
        const result:NativeObject[]=[{id:'sun',position:[0,0,0],radius:.34,color:'#ffe1a2',unlit:true,texture:system.id==='sol'?'/textures/solar/sun.jpg':undefined}];
        bodies.forEach(({body,point},i)=>{result.push(ring('orbit:'+body.id,[0,0,0],1.4+i*.62,selected===body.id?'#647263':'#23313d'),{id:body.id,position:point,radius:body.kind==='气态'?.2:.12,color:solarTexture(body.id)?'#ffffff':body.primary?'#80b9ae':'#9ca2b1',texture:solarTexture(body.id)});});return result;
    },[system,selected]);
    const view=useViewport('system',system.id,{position:[0,7,8],target:[0,0,0],fov:46},objects);
    const rect=view.host.current?.getBoundingClientRect();
    return <div className="system-view">
        <OrbitSurface view={view} className="native-orbits" label={`${system.name}行星轨道，滚轮缩放，点击行星查看情报`} onClick={(x,y)=>{
            const hit=bodies.map(item=>({...item,screen:project(item.point,view.camera.current,innerWidth,innerHeight)}))
                .filter(item=>item.screen.visible&&Math.hypot(item.screen.x-x,item.screen.y-y)<22)
                .sort((a,b)=>Math.hypot(a.screen.x-x,a.screen.y-y)-Math.hypot(b.screen.x-x,b.screen.y-y))[0];
            setSelected(hit?.body.id);if(hit)onSelect(hit.body.id);
        }}>
            {bodies.map(({body,point})=>{const p=project(point,view.camera.current,innerWidth,innerHeight);return p.visible?<button key={body.id} className="native-label" style={{left:p.x-(rect?.left??0),top:p.y-(rect?.top??0)+16}} aria-label={`查看${body.name}`} onClick={()=>{setSelected(body.id);onSelect(body.id);}}>{body.name}</button>:null;})}
        </OrbitSurface>
        <div className="system-zoom" aria-label="恒星系缩放"><button aria-label="缩小恒星系" onClick={()=>view.zoom(150)}>−</button><button aria-label="放大恒星系" onClick={()=>view.zoom(-150)}>＋</button><button onClick={()=>{view.camera.current.position=[0,7,8];view.change();}}>重置视角</button><small>拖动旋转 · 滚轮缩放</small></div>
        {planet && <section className="planet-inspector">
            <button className="inspector-close" aria-label="关闭星球信息" onClick={() => setSelected(undefined)}>×</button>
            <small>行星情报 · {record!.level === 'observed' ? '天文观测' : '勘测已返回'} · 观测于 {record!.observedAt.toFixed(1)} 年</small>
            <h3>{planet.name} <small>{colony ? '已有聚居地' : planet.kind==='气态' ? '气态天体' : '未开发天体'}</small></h3>
            <div className="metrics"><div className="metric"><small>类型 / 半径</small><strong>{planet.kind} · {planet.radius.toLocaleString()} km</strong></div><div className="metric"><small>轨道半径</small><strong>{planet.orbit} AU</strong></div><div className="metric"><small>宜居度 / 资源</small><strong>{planet.habitability === undefined ? '待近距勘测' : `${Math.round(planet.habitability * 100)}% / ${Math.round(planet.resources! * 100)}%`}</strong></div></div>
            {colony ? <button onClick={()=>onSurface(planet.id)}>进入 {planet.name} 地表 →</button> : <><p>{planet.kind==='气态' ? '气态行星尚不支持地表殖民。' : '可向这颗行星派遣探测、拓荒和运输任务。'}</p><button onClick={()=>onExplore(planet.id)}>查看行星探测与运输</button></>}
            <small>轨道间距经过压缩，天体大小不按比例。{system.id === "sol" && <> · <a href="/textures/solar/sources.html" target="_blank" rel="noreferrer">影像来源与说明 ↗</a></>}</small>
        </section>}
    </div>;
}
