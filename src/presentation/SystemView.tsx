import { solarTexture } from '../content/solar';
import { SolarPortrait } from './SolarPortrait';
import { useEffect, useRef, useState } from 'react';
import type { IntelRecord, StarSystem, WorldState } from '../simulation/types';

const DEFAULT_CAMERA = { x: 400, y: 310, zoom: 1.25 };

export function SystemView({ system, worlds, intel, onSelect, onSurface, onExplore }: {
    system: StarSystem; worlds: Record<string,WorldState>; intel: Record<string,IntelRecord>; onSelect: (id:string)=>void;
    onSurface: (id:string) => void; onExplore: (id:string) => void;
}) {
    const [selected, setSelected] = useState<string>();
    const [camera, setCamera] = useState(DEFAULT_CAMERA);
    const svg = useRef<SVGSVGElement>(null);
    const planet = system.bodies.find(b => b.id === selected);
    const colony = planet && worlds[planet.id];
    const record = planet && intel[planet.id];
    const zoomBy = (factor: number) => setCamera(old => ({ ...old, zoom: Math.max(.5, Math.min(4, old.zoom * factor)) }));
    useEffect(() => {
        const element = svg.current!;
        const wheel = (event: WheelEvent) => {
            event.preventDefault();
            const matrix = element.getScreenCTM();
            if (!matrix) return;
            const point = element.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
            const anchor = point.matrixTransform(matrix.inverse());
            const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1);
            setCamera(old => {
                const zoom = Math.max(.5, Math.min(4, old.zoom * Math.exp(-Math.max(-1, Math.min(1, delta * .0015)))));
                const ratio = old.zoom / zoom;
                return { x: anchor.x + (old.x - anchor.x) * ratio, y: anchor.y + (old.y - anchor.y) * ratio, zoom };
            });
        };
        element.addEventListener('wheel', wheel, { passive: false });
        return () => element.removeEventListener('wheel', wheel);
    }, []);
    return <div className="system-view">
        <svg ref={svg} viewBox={`${camera.x - 400 / camera.zoom} ${camera.y - 350 / camera.zoom} ${800 / camera.zoom} ${700 / camera.zoom}`} role="group" aria-label={`${system.name}行星轨道，滚轮缩放，点击行星查看情报`}
            onClick={() => setSelected(undefined)} onKeyDown={e => { if (e.key === 'Escape') setSelected(undefined); }}>
            <defs><radialGradient id="sun-glow"><stop stopColor="#ffe6ad"/><stop offset=".3" stopColor="#e7aa53" stopOpacity=".4"/><stop offset="1" stopColor="#e7aa53" stopOpacity="0"/></radialGradient></defs>
            <g transform="translate(400 310)"><circle r="65" fill="url(#sun-glow)"/><circle r="17" fill="#ffe1a2"/>{system.id === "sol" && <><clipPath id="solar-star-clip"><circle r="17"/></clipPath><image href="/textures/solar/sun.jpg" x="-34" y="-17" width="68" height="34" clipPath="url(#solar-star-clip)"/></>}
                {system.bodies.map((body, i) => {
                    const radius = 70 + i * 31, angle = i * 2.4 + .3;
                    const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius * .65;
                    return <g key={body.id}>
                        <ellipse rx={radius} ry={radius * .65} fill="none" stroke={selected === body.id ? '#647263' : '#23313d'}/>
                        <g role="button" tabIndex={0} aria-label={`查看${body.name}`} aria-pressed={selected === body.id}
                            onClick={e => { e.stopPropagation(); setSelected(body.id); onSelect(body.id); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(body.id); onSelect(body.id); } }} className="orbit-body" transform={`translate(${x} ${y})`}>
                            <circle r="20" fill="transparent"/>
                            <circle r={body.kind === '气态' ? 10 : 6} fill={body.primary ? '#80b9ae' : body.kind === '气态' ? '#c6ab7f' : '#9ca2b1'}/>
                            {solarTexture(body.id) && <><clipPath id={`clip-${body.id}`}><circle r={body.kind === '气态' ? 10 : 6}/></clipPath><image href={solarTexture(body.id)} x={body.kind === '气态' ? -20 : -12} y={body.kind === '气态' ? -10 : -6} width={body.kind === '气态' ? 40 : 24} height={body.kind === '气态' ? 20 : 12} clipPath={`url(#clip-${body.id})`}/></>}
                            {selected === body.id && <circle r="15" fill="none" stroke="#e4c58a"/>}
                            <text y="30" textAnchor="middle" fill="#bbcbd0" fontSize="11">{body.name}</text>
                        </g>
                    </g>;
                })}
            </g>
        </svg>
        <div className="system-zoom" aria-label="恒星系缩放">
            <button aria-label="缩小恒星系" disabled={camera.zoom <= .5} onClick={() => zoomBy(1 / 1.25)}>−</button>
            <span>{Math.round(camera.zoom * 100)}%</span>
            <button aria-label="放大恒星系" disabled={camera.zoom >= 4} onClick={() => zoomBy(1.25)}>＋</button>
            <button onClick={() => setCamera(DEFAULT_CAMERA)}>重置视角</button>
            <small>滚轮缩放 · 点击空白取消选择</small>
        </div>
        {planet && <section className="planet-inspector">
            <button className="inspector-close" aria-label="关闭星球信息" onClick={() => setSelected(undefined)}>×</button>
            <small>行星情报 · {record!.level === 'observed' ? '天文观测' : '勘测已返回'} · 观测于 {record!.observedAt.toFixed(1)} 年</small>
            {solarTexture(planet.id) && <SolarPortrait planetId={planet.id}/>}
            <h3>{planet.name} <small>{colony ? '已有聚居地' : planet.kind==='气态' ? '气态天体' : '未开发天体'}</small></h3>
            <div className="metrics"><div className="metric"><small>类型 / 半径</small><strong>{planet.kind} · {planet.radius.toLocaleString()} km</strong></div><div className="metric"><small>轨道半径</small><strong>{planet.orbit} AU</strong></div><div className="metric"><small>宜居度 / 资源</small><strong>{planet.habitability === undefined ? '待近距勘测' : `${Math.round(planet.habitability * 100)}% / ${Math.round(planet.resources! * 100)}%`}</strong></div></div>
            {colony ? <button onClick={()=>onSurface(planet.id)}>进入 {planet.name} 地表 →</button> : <><p>{planet.kind==='气态' ? '气态行星尚不支持地表殖民。' : '可向这颗行星派遣探测、拓荒和运输任务。'}</p><button onClick={()=>onExplore(planet.id)}>查看行星探测与运输</button></>}
            <small>轨道间距经过压缩，天体大小不按比例。{system.id === "sol" && <> · <a href="/textures/solar/sources.html" target="_blank" rel="noreferrer">影像来源与说明 ↗</a></>}</small>
        </section>}
    </div>;
}
