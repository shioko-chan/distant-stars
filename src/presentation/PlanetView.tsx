import { EARTH, districtPoint, terrainSample } from '../simulation/terrain';
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { ZONES } from '../content/catalog';
import { distanceToPath, surfaceProfile, PLAN_LIMIT, separation, surfaceCost, validateSurface } from '../simulation/surface';
import type { Action, SurfaceDraft, SurfacePoint, WorldState, Zone } from '../simulation/types';
import { useViewport } from './native/useViewport';
import { NativeTerrain, ribbon, buildingCluster } from './native/geometry';
import { length, pickSurface, ray, surfacePosition, unit } from './native/math';
import type { NativeObject } from './native/bridge';

type Tool = 'inspect' | 'road' | 'zone';
interface Props { world: WorldState; time: number; distance: number; credits: number; act: (a: Action) => void; }
export function PlanetView({ world, time, distance, credits, act }: Props) {
    const [tool,setTool]=useState<Tool>('inspect'),[zone,setZone]=useState<Zone>('housing'),[width,setWidth]=useState(.00015);
    const [drafts,setDrafts]=useState<SurfaceDraft[]>([]),[stroke,setStroke]=useState<SurfaceDraft>(),[selected,setSelected]=useState<string>();
    const [message,setMessage]=useState('双击陆地靠近；滚轮连续缩放。选择道路或分区工具，在地表拖动绘制。');
    const drawing=useRef<SurfaceDraft|undefined>(undefined);
    const objects=useMemo(()=>{
        const items:NativeObject[]=[];
        for(const p of world.surface){
            const color=p.kind==='road'?(p.progress<50?'#9a8864':'#323942'):ZONES[p.zone].color;
            items.push(ribbon('plan:'+p.id,p,color,world.planetId,p.kind==='road'?1:.35));
            if(p.kind==='zone'&&p.zone!=='reserve'&&p.points.length>1)items.push(buildingCluster('buildings:'+p.id,p,p.progress,world.planetId));
        }
        for(const d of world.districts){const n=districtPoint(d.id,world.planetId);if(!terrainSample(n,world.planetId).water)items.push({id:'district:'+d.id,position:surfacePosition(n,.005,world.planetId),radius:.006+d.density*.002,color:ZONES[d.zone].color});}
        for(const [i,p] of [...drafts,...(stroke?[stroke]:[])].entries())if(p.points.length>=2)items.push(ribbon('draft:'+i,p,validateSurface([p],world.planetId)?'#e96b62':'#e7d389',world.planetId,.75));
        return items;
    },[world,drafts,stroke]);
    const view=useViewport('planet',world.planetId,{position:[5,3,5],target:[0,0,0],fov:42},objects,world.planetId);
    const ground=length(surfacePosition(unit(view.camera.current.position),0,world.planetId));
    const height=length(view.camera.current.position)-ground;
    const altitude=Math.round(Math.max(0,height)/1.8*world.radiusKm);
    useEffect(()=>{
        if(!view.ready)return;
        const terrain=new NativeTerrain(world.planetId);terrain.update(view.camera.current.position);
        const timer=setInterval(()=>terrain.update(view.camera.current.position),200);
        return ()=>{clearInterval(timer);terrain.dispose();};
    },[view.ready,world.planetId]);
    const pick=(x:number,y:number)=>pickSurface(view.camera.current.position,ray(x,y,view.camera.current,innerWidth,innerHeight),world.planetId);
    const down=(event:PointerEvent<HTMLDivElement>)=>{
        view.drag.current={x:event.clientX,y:event.clientY,button:event.button,distance:0};event.currentTarget.setPointerCapture(event.pointerId);
        if(event.button!==0||tool==='inspect')return;
        const point=pick(event.clientX,event.clientY);if(!point)return;
        if(height>.45){setMessage('请先双击陆地或点击「靠近地表」，再绘制规划。');return;}
        drawing.current={kind:tool,zone,width:tool==='road'?.00003:width,points:[point]};
    };
    const move=(event:PointerEvent<HTMLDivElement>)=>{
        const drag=view.drag.current;if(!drag)return;
        const dx=event.clientX-drag.x,dy=event.clientY-drag.y;drag.distance+=Math.hypot(dx,dy);drag.x=event.clientX;drag.y=event.clientY;
        if(drag.button===2||tool==='inspect'){view.orbit(dx,dy);return;}
        const d=drawing.current;if(!d)return;
        const point=pick(event.clientX,event.clientY);if(!point||d.points.length>=128||separation(point,d.points.at(-1)!)<.00003)return;
        if(d.kind==='road'){const nearest=[...world.surface,...drafts].filter(p=>p.kind==='road').flatMap(p=>p.points).find(p=>separation(point,p)<.00008);d.points.push(nearest??point);}else d.points.push(point);
        setStroke({...d,points:[...d.points]});
    };
    const cancel=()=>{drawing.current=undefined;view.drag.current=undefined;setStroke(undefined);};
    const up=(event:PointerEvent<HTMLDivElement>)=>{
        const drag=view.drag.current,d=drawing.current;cancel();
        if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
        if(d){const invalid=validateSurface([d],world.planetId);if(invalid)setMessage(invalid);else{setDrafts(old=>old.length<24?[...old,d]:old);setMessage('草稿已绘制。可继续绘制、撤销，或批准全部草稿。');}}
        else if(drag&&drag.button===0&&tool==='inspect'&&drag.distance<5){
            const point=pick(event.clientX,event.clientY);if(!point)return;
            const project=world.surface.find(p=>distanceToPath(point,p.points)<Math.max(.001,p.width)),t=terrainSample(point,world.planetId);setSelected(project?.id);
            setMessage(project?`${project.kind==='road'?'道路':ZONES[project.zone].name} · ${project.status}`:t.water?'海域：当前陆地规划工具无法施工。':`海拔 ${Math.round(t.height)} m · 区域坡度 ${t.slope.toFixed(1)}° · 农业适宜度 ${Math.round(t.fertility*100)}% · 矿产潜力 ${Math.round(t.minerals*100)}%`);
        }
    };
    useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){cancel();setTool('inspect');}};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
    const cost = drafts.reduce((n, p) => n + surfaceCost(p, world.planetId, world.radiusKm), 0);
    const project = world.surface.find(p => p.id === selected);
    const approve = () => {
        act({ type: 'directive', directive: { targetId: world.planetId, kind: 'surface', value: 'build', surface: drafts, budget: cost, priority: 2, deadline: time + distance + 30, risk: .5, authorization: 'strict', after: 'maintain' } });
        setDrafts([]); setTool('inspect'); setMessage(distance ? '规划已发出。实际接收与施工结果以返回报告为准。' : '规划已提交。推进时间后可查看道路施工与分区发展。');
    };
    return <>
        <div ref={view.host} className={`planet-canvas ${tool !== 'inspect' ? 'drawing-surface' : ''}`} aria-label="可连续缩放的星球地表，双击陆地靠近，拖动绘制规划"
            onContextMenu={e=>e.preventDefault()} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}
            onDoubleClick={e=>{if(tool==='inspect'){const p=pick(e.clientX,e.clientY);if(p)view.focus(p);}}}>
            {view.error&&<p className="native-error" role="alert">{view.error}</p>}
        </div>
        <div className="surface-tools">
            <div className="surface-tool-row"><button className={tool === 'inspect' ? 'active' : ''} onClick={() => setTool('inspect')}>选择 / 观察</button><button className={tool === 'road' ? 'active' : ''} onClick={() => setTool('road')}>铺设道路</button><button className={tool === 'zone' ? 'active' : ''} onClick={() => setTool('zone')}>分区笔刷</button></div>
            {tool === 'zone' && <div className="surface-tool-row"><select aria-label="地表分区功能" value={zone} onChange={e => setZone(e.target.value as Zone)}>{Object.entries(ZONES).map(([id, z]) => <option value={id} key={id}>{z.name}</option>)}</select><label>笔刷 <select aria-label="分区笔刷宽度" value={width} onChange={e => setWidth(Number(e.target.value))}><option value={.00005}>{Math.round(.00005*world.radiusKm*1000)} m</option><option value={.00015}>{(.00015*world.radiusKm).toFixed(1)} km</option><option value={.0005}>{(.0005*world.radiusKm).toFixed(1)} km</option></select></label></div>}
            <div className="surface-tool-row"><button onClick={() => view.focus(view.camera.current.position,true)}>靠近地表</button><button onClick={() => view.focus(view.camera.current.position,false)}>全球视角</button><small>{altitude > 1200 ? '全球' : altitude > 150 ? '区域' : '局部'} · 高度约 {altitude.toLocaleString()} km</small></div>
            <p>{tool === 'inspect' ? '左键旋转 · 双击定位 · 滚轮缩放' : '左键按住绘制 · 右键旋转 · 滚轮缩放 · Esc 退出工具'}</p>
        </div>
        <section className="surface-draft-panel" aria-label="地表规划草稿">
            <p role="status">{message}</p>
            {world.planetId === EARTH && <small>真实海陆与高程 · 赤道约 20 km/采样 · 高程不夸张<br/><a href="/textures/solar/sources.html" target="_blank" rel="noreferrer">影像与地形来源 ↗</a></small>}
            {drafts.length > 0 && <p>最大区域坡度 {Math.max(...drafts.map(p=>surfaceProfile(p,world.planetId).slope)).toFixed(1)}° · 坡度增加造价和工期</p>}
            {drafts.length > 0 && <><div className="row"><b>{drafts.length} 项草稿</b><span>{cost.toLocaleString()} Cr</span></div><small>道路先施工，非保护分区需连接道路；命令约 {distance.toFixed(1)} 年后抵达。</small><div className="surface-tool-row"><button onClick={() => setDrafts(old => old.slice(0, -1))}>撤销一笔</button><button onClick={() => setDrafts([])}>清空草稿</button><button disabled={cost > credits || world.independent || world.surface.length + drafts.length > PLAN_LIMIT} onClick={approve}>批准建设</button></div>{cost > credits && <p className="warning">中央预算不足</p>}</>}
            {project && <><h4>{project.kind === 'road' ? '道路' : ZONES[project.zone].name} · {project.progress.toFixed(0)}%</h4><progress max={100} value={project.progress}/><small>{project.status} · 预算 {project.cost} Cr</small></>}
            {world.surface.length > 0 && <select aria-label="定位地表工程" value={selected ?? ''} onChange={e => { const p = world.surface.find(p => p.id === e.target.value); setSelected(p?.id); if (p) view.focus(p.points[Math.floor(p.points.length / 2)]); }}><option value="">定位已批准工程…</option>{world.surface.map((p, i) => <option value={p.id} key={p.id}>{i + 1} · {p.kind === 'road' ? '道路' : ZONES[p.zone].name} · {p.progress.toFixed(0)}%</option>)}</select>}
        </section>
    </>;
}
