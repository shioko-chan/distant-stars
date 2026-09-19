import { CockpitFrame, InstrumentIcon } from './CockpitFrame';
import { VoyageOverlay } from './VoyageOverlay';
import { HOME, systemForPlanet, planetById, travelDistance } from '../simulation/locations';
import { EmpireClock } from './EmpireClock';
import { SystemView } from '../presentation/SystemView';
import { useEffect, useState } from 'react';
import { POLICIES, RESEARCH, RESOURCES, SHIPS, SPEEDS, ZONES } from '../content/catalog';
import { MusicControl } from './MusicControl';
import { GalaxyMap } from '../presentation/GalaxyMap';
import { PlanetView } from '../presentation/PlanetView';
import { estimateWorld, getShipProgress, researchEstimate } from '../simulation/queries';
import { shipSpeed } from '../simulation/world';
import type { Action, Directive, PlayerView, ResearchFocus, ShipKind, WorldState, Zone } from '../simulation/types';
import { useSimulation } from './useSimulation';
import { DebugConsole } from './DebugConsole';
import { BridgeIntro } from './BridgeIntro';
import { useThemeMusic } from './useThemeMusic';
const year = (n: number) => `${Math.floor(n)}.${String(Math.floor((n % 1) * 12 + 1.001)).padStart(2, '0')}`;
const number = (n: number) => new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const levelNames = { observed: '天文观测', surveyed: '实地勘测', colonized: '定居报告' };
const tabs = { overview: '情报', economy: '经济', population: '人口政治', research: '科研', planning: '星球规划', transport: '舰船运输', contact: '文明接触', orders: '命令', history: '历史' };
type Tab = keyof typeof tabs;
export function App() {
    const music = useThemeMusic();
    const [atConsole, setAtConsole] = useState(false);
    const [debugMode] = useState(() => new URLSearchParams(window.location.search).get('debug') === '1');
    const session = useSimulation(debugMode);
    const { view, notice, fatal, speed, setSpeed, fraction, pending, act, save, load, startNewGame } = session;
    const [selected, setSelected] = useState('star-1'), [tab, setTab] = useState<Tab>('overview'), [map, setMap] = useState<'galaxy' | 'system' | 'planet'>('galaxy'), [historyLimit, setHistoryLimit] = useState(120);
    const [selectedShipId, setSelectedShipId] = useState<string>();
    const [panelOpen, setPanelOpen] = useState(false);
    const openPanel = (next: Tab) => { setTab(next); setPanelOpen(true); };
    useEffect(() => {
        const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setPanelOpen(false); setSelectedShipId(undefined); } };
        window.addEventListener('keydown', escape);
        return () => window.removeEventListener('keydown', escape);
    }, []);
    const [selectedPlanet,setSelectedPlanet] = useState<string>();
    const newGame = () => { if (view && !window.confirm('开始新纪元？当前未保存进度将丢失。'))
        return; startNewGame(); };
    if (!atConsole)
        return <BridgeIntro music={music} simulationReady={Boolean(view)} simulationError={fatal ? notice : undefined} onEnter={() => setAtConsole(true)} onNewGame={newGame}/>;
    if (!view)
        return <main className="loading"><h1>DISTANT STARS</h1><p>{notice}</p>{fatal && <button onClick={newGame}>开始新纪元</button>}{debugMode && <DebugConsole session={session}/>}</main>;
    const system = view.systems.find(s => s.id === selected) ?? view.systems[0], planet = system.bodies.find(b=>b.id===selectedPlanet) ?? system.bodies.find(b=>b.primary)!, targetId=planet.id, intel = view.intel[targetId], world = view.worlds[targetId], estimate = estimateWorld(view, targetId), home = view.worlds[HOME];
    const knownWorlds = Object.values(view.worlds).filter(w => !w.independent), knownPopulation = knownWorlds.reduce((n, w) => n + (estimateWorld(view, w.planetId)?.population ?? w.population), 0);
    const selectedShip = view.ships.find(ship => ship.id === selectedShipId);
    return <div className="app command-station">
  <header className="masthead">
   <div className="brand"><span className="brand-mark" aria-hidden="true">✧</span><div><b>DISTANT STARS</b><small>遥远群星</small></div></div>
   <div className="bridge-designation"><span className="status-light" />舰桥中控台<small>COMMAND STATION / 01</small></div>
   <div className="save-actions"><MusicControl control={music}/><button onClick={() => { setSpeed(0); setAtConsole(false); }}>观景甲板</button><button onClick={save}>保存</button><button onClick={load}>读取</button><button onClick={newGame}>新纪元</button>{debugMode && <DebugConsole session={session}/>}</div>
  </header>
  {view.failed && <div role="alert" className="failure">帝国人口低于延续阈值。可读取旧档或开始新纪元。</div>}
  <main className={"workspace " + (panelOpen ? "panel-open" : "")}>
   <nav className="command-dock" aria-label="指挥部门">
    <span className="dock-label" aria-hidden="true">舰桥<br/>终端</span>
    {Object.entries(tabs).map(([id, name], i) => <button aria-expanded={panelOpen && tab === id} aria-controls="command-panel" className={panelOpen && tab === id ? "active" : ""} key={id} onClick={() => { setTab(id as Tab); setPanelOpen(!(panelOpen && tab === id)); }}><span className="instrument-number" aria-hidden="true">0{i + 1}</span><InstrumentIcon name={id as Tab}/><small>{name}</small><i aria-hidden="true" /></button>)}
   </nav>
   <section className={"map-column view-" + map} aria-label="飞船观测舷窗">
    <CockpitFrame/>
    <div className="map-toolbar">
     <div className="view-switch" aria-label="观测尺度">{(['galaxy', 'system', 'planet'] as const).map((m, i) => <button key={m} aria-pressed={map === m} className={map === m ? 'active' : ''} disabled={m === 'planet' && !world} onClick={() => { setMap(m); if (m === 'planet') setTab('planning'); }}><span aria-hidden="true">0{i + 1}</span>{['银河', '恒星系', '星球'][i]}</button>)}</div>
     <div className="target-selectors"><select aria-label="目标恒星系" value={system.id} onChange={e => { setSelected(e.target.value); setSelectedShipId(undefined); }}>{view.systems.map(s => <option key={s.id} value={s.id}>{s.name} · {levelNames[view.intel[s.bodies.find(b=>b.primary)!.id].level]}</option>)}</select><select aria-label="目标行星" value={targetId} onChange={e=>setSelectedPlanet(e.target.value)}>{system.bodies.map(b=><option key={b.id} value={b.id}>{b.name}{view.worlds[b.id] ? " · 已开发" : ""}</option>)}</select></div>
    </div>
   {map === 'galaxy' ? <GalaxyMap state={view} selectedId={system.id} selectedShipId={selectedShipId} onSelectShip={setSelectedShipId} onSelect={id => { setSelected(id); setSelectedShipId(undefined); }}/> : map === 'planet' && world ? <PlanetView key={world.planetId} world={world} time={view.time} distance={system.distance} credits={view.credits} act={act}/> : <SystemView key={system.id} system={system} worlds={view.worlds} intel={view.intel} onSelect={setSelectedPlanet} onSurface={id => { setSelectedPlanet(id); setMap('planet'); setTab('planning'); setPanelOpen(false); }} onExplore={id => { setSelectedPlanet(id); openPanel('transport'); }}/>}
   <div className="map-title"><small>{map === 'galaxy' ? '深空观测 / NEARBY SPACE' : '轨道观测 / ORBITAL VIEW'}</small><h1>{system.name}<span className="target-class">{levelNames[intel.level]}</span></h1><p>{map === 'planet' ? `地表展示 ${year(intel.observedAt)} 年确认状态；点击区域规划，滚轮查看建筑。` : `${view.systems.length} / 100 个已编目恒星系 · 距离单位：光年`}</p></div>
   {map === 'galaxy' && selectedShip && <VoyageOverlay view={view} ship={selectedShip} onClose={() => setSelectedShipId(undefined)} onDestination={() => { const destination = systemForPlanet(view.systems, selectedShip.targetId); if (destination) { setSelected(destination.id); setSelectedPlanet(selectedShip.targetId); setMap('system'); setSelectedShipId(undefined); } }}/>}
   {map === 'galaxy' && !selectedShip && <aside className="target-console" aria-label="选中目标">
    <small><span className="target-indicator" />观测目标 / {levelNames[intel.level]}</small>
    <h2>{system.name}<span>{system.distance.toFixed(2)} <small>光年</small></span></h2>
    <p>{system.distance > 0 ? '你看到的是 ' + Math.max(0, view.time - intel.observedAt).toFixed(1) + ' 年前的这里' : '太阳系 · 文明的出发地'}</p>
    <div className="signal-track"><span>情报发生 {year(intel.observedAt)}</span><span>接收 {year(intel.receivedAt)}</span></div>
    <div className="target-actions"><button onClick={() => setMap('system')}>靠近恒星系 ↗</button><button onClick={() => openPanel(world ? 'planning' : 'transport')}>{world ? '经营世界' : intel.survey ? '准备远征' : '派遣探测器'}</button><button onClick={() => openPanel('overview')}>情报</button></div>
   </aside>}
   {map === 'galaxy' && !panelOpen && <aside className="dispatch-console" aria-label="抵达报告">
    <small><span className="status-light" />深空通信 / INCOMING</small><div className="map-legend"><span>◇ 舰船 · 预计位置</span><span>○ 金色信号 · 命令去程</span></div>
    {view.messages.at(-1) && <button onClick={() => openPanel('history')}><span>↙ 最新抵达 · {year(view.messages.at(-1)!.receivedAt)}</span><strong>{view.messages.at(-1)!.title}</strong><small>打开报告 →</small></button>}
    <button className="fleet-link" onClick={() => openPanel('transport')}>◇ {view.ships.filter(s => s.status === 'outbound' || s.status === 'building').length} 项航行计划 · 查看舰队 →</button>
   </aside>}
   <div className="map-bottom"><button disabled={view.systems.length >= 100 || view.credits < 2000} onClick={() => act({ type: 'catalog' })}>扩展天文编目 · 2,000 Cr</button><span>{map === 'system' ? '轨道与设施采用战略示意' : '拖动旋转 · 滚轮缩放'}</span></div>
  </section><section id="command-panel" aria-label={tabs[tab]} hidden={!panelOpen} className="command-column"><div className="department-heading"><span>舰桥终端 / {tabs[tab]}</span><button aria-label="关闭舰桥终端" onClick={() => setPanelOpen(false)}>收起 ×</button></div><div className="scroll-pane">
   <div className="pane-heading"><small>{levelNames[intel.level]} · {system.distance.toFixed(2)} 光年</small><h2>{planet.name} <small>· {system.name}</small></h2><p>情报发生 {year(intel.observedAt)} → 接收 {year(intel.receivedAt)} · 年龄 {(view.time - intel.observedAt).toFixed(1)} 年</p></div>
   {tab === 'overview' && <><section className="card"><h3>来自过去的情报</h3><div className="metrics"><Metric label="宜居度" value={intel.survey ? `${(system.habitability * 100).toFixed(0)}%` : '待近距探测'}/><Metric label="资源潜力" value={intel.survey ? `${(system.resources * 100).toFixed(0)}%` : '未知'}/><Metric label="环境风险" value={intel.survey ? `${(system.risk * 100).toFixed(0)}%` : '未知'}/></div><p>不确定性来自光速延迟、轨道覆盖与人口统计。航迹是依据已知计划推算，远方结果须等待报告。</p></section>{estimate && world && <section className="card"><h3>确认与估计</h3><Metric label="最后确认人口" value={number(world.population)}/><Metric label="估计当前人口区间" value={`${number(estimate.lower)} – ${number(estimate.upper)}`}/><p>中心估计 {number(estimate.population)} · ±{(estimate.error * 100).toFixed(0)}%。其他指标保留在确认时间，未伪装为实时值。</p><div className="metrics"><Metric label="支持率" value={`${world.support.toFixed(0)}%`}/><Metric label="生态" value={`${world.ecology.toFixed(0)}%`}/><Metric label="工业" value={world.industry.toFixed(0)}/></div></section>}<LaunchPanel view={view} targetId={targetId} act={act}/><section className="card"><h3>经营提示</h3><ol><li>先探测，等待航行与返回光程。</li><li>在母星规划产业、科研和社会政策。</li><li>依据勘测情报批准拓荒，并选择地方授权。</li><li>收到前哨报告后调整政策或安排物资运输。</li></ol><p>月档适合经营观察；年档和更高速度适合长程等待。重要报告会自动暂停。</p></section></>}
   {tab === 'economy' && (world ? <><section className="card"><h3>当地实体库存</h3><div className="metrics">{Object.entries(RESOURCES).map(([k, name]) => <Metric key={k} label={name} value={number(world.stock[k as keyof typeof RESOURCES])}/>)}</div><p>单位为标准资源批次。物资位于此世界，不能通过中央余额瞬间调拨。</p><details><summary>供给与社会变化的主要原因</summary>{world.causes.length?world.causes.map((cause,i)=><p key={i}>{cause}</p>):<p>首个年度结算后显示生产与消费解释。</p>}</details></section><section className="card"><h3>地方财政</h3><div className="metrics"><Metric label="余额" value={`${number(world.finance.balance)} Cr`}/><Metric label="价格指数" value={world.finance.price.toFixed(2)}/><Metric label="实际购买力" value={number(world.finance.balance / world.finance.price)}/><Metric label="年税收" value={number(world.finance.revenue)}/><Metric label="年支出" value={number(world.finance.expenses)}/><Metric label="债务 / 借款上限" value={`${number(world.finance.debt)} / ${number(world.finance.limit)}`}/><Metric label="年利息" value={number(world.finance.interest)}/><Metric label="预算承诺" value={number(world.finance.commitments)}/></div></section><DirectivePanel key={`budget-${targetId}`} view={view} targetId={targetId} kind="budget" act={act}/></> : <Empty />)}
   {tab === 'population' && (world ? <><PopulationPanel world={world}/><DirectivePanel key={`policy-${targetId}`} view={view} targetId={targetId} kind="policy" act={act}/><DirectivePanel key={`reform-${targetId}`} view={view} targetId={targetId} kind="reform" act={act}/></> : <Empty />)}
   {tab === 'research' && <><section className="card"><h3>中央科研战略</h3><p>各机构自主推进项目。重点方向获得更多资金；其他方向继续研究。推进依赖工业和生态成果。</p><label>重点方向<select value={home.focus} onChange={e => act({ type: 'research', focus: e.target.value as ResearchFocus, budget: home.finance.budget })}>{Object.entries(RESEARCH).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label>科研预算<select value={home.finance.budget} onChange={e => act({ type: 'research', focus: home.focus, budget: Number(e.target.value) })}>{[.5, 1, 1.5, 2].map(n => <option key={n} value={n}>{n} 倍投入</option>)}</select></label><p>预算同时影响公共研究与建设投入，增加地方年度财政支出。</p></section><section className="card"><h3>{world?.name ?? home.name} · 技术部署</h3>{Object.entries(RESEARCH).map(([id, name]) => { const w = world ?? home, k = id as ResearchFocus; const project=researchEstimate(w,k); return <div className="tech" key={id}><div><b>{name}</b><small>{project.name} · {project.complete?"初版上限":project.blocked?"等待前置成果":`预计 ${project.low}–${project.high} 年`}</small><small>知识 {w.knowledge[k]} 代 / 本地部署 {w.tech[k].toFixed(1)} 代</small></div><progress value={w.research[k]} max={1}/><small>机构项目进度 {(w.research[k] * 100).toFixed(0)}%；教育、设备、前置成果决定完成时间。</small></div>; })}<p>知识按光速传播；部署消耗当地高级部件。舰船使用出发地已经部署的整数世代。</p></section></>}
   {tab === 'planning' && (world ? <><section className="card"><h3>地表开发</h3><button onClick={() => { setMap('planet'); setPanelOpen(false); }}>进入地表规划</button><p>在球面上直接铺设道路、刷出功能分区。滚轮连续缩放，双击陆地靠近，右键旋转观察。草稿批准前可撤销。</p><p>道路先施工，连接道路的分区才会发展。建设消耗当地工业品与能源，受财政投入、技术和稳定度影响。</p><div className="metrics"><Metric label="已批准工程" value={String(world.surface.length)}/><Metric label="施工完成" value={String(world.surface.filter(p => p.progress >= 100).length)}/><Metric label="当地稳定度" value={`${world.stability.toFixed(0)}%`}/></div></section><section className="card"><h3>开发工程报告</h3>{world.surface.length === 0 ? <p>尚无新开发工程。进入地表，在陆地上绘制第一条道路和分区。</p> : world.surface.map((p,i) => <div className="mission" key={p.id}><b>{i+1} · {p.kind === 'road' ? '道路' : ZONES[p.zone].name}</b><progress value={p.progress} max={100}/><small>{p.status} · {p.progress.toFixed(0)}% · 预算 {p.cost} Cr</small></div>)}</section><DirectivePanel key={`project-${targetId}`} view={view} targetId={targetId} kind="project" act={act}/></> : <Empty />)}
   {tab === 'transport' && <><LaunchPanel view={view} targetId={targetId} act={act}/>{world && targetId !== HOME && <section className="card"><h3>战略补给航线</h3><p>每十年按已收到的库存报告判断补给需求，自动建造货船；航线不代表即时供给。</p><button onClick={() => act({ type: 'route', targetId, enabled: !view.routes.includes(targetId) })}>{view.routes.includes(targetId) ? '停止批准新的普通货运' : '启用民生优先补给航线'}</button></section>}{world && targetId !== HOME && !world.independent && <><DirectivePanel key={'evacuate-' + targetId} view={view} targetId={targetId} kind="evacuate" act={act}/><DirectivePanel key={'charter-' + targetId} view={view} targetId={targetId} kind="charter" act={act}/></>}<Fleet view={view} onSelect={id => { setSelectedShipId(id); setMap("galaxy"); setPanelOpen(false); }}/></>}
   {tab === 'contact' && <>{intel.survey?.anomaly ? <><section className="card"><h3>{system.anomaly === 'civilization' ? '原生智慧文明' : '文明遗迹'}</h3><p>观测与接触结果受通信延迟限制。技术交流可改变对方的发展，资源竞争可能损害信任并引起国内反对。</p>{world && <div className="metrics"><Metric label="确认信任" value={world.alienTrust.toFixed(0)}/><Metric label="发展指数" value={world.alienDevelopment.toFixed(0)}/><Metric label="当前接触方式" value={world.contact}/></div>}</section><DirectivePanel key={`contact-${targetId}`} view={view} targetId={targetId} kind="contact" act={act}/></> : <section className="card"><h3>尚无已确认智慧活动</h3><p>探测器的近距扫描可能发现文明或遗迹。天文观测不会预先暴露它们。</p></section>}</>}
   {tab === 'orders' && <><section className="card"><h3>命令传播规则</h3><p>旧命令不能撤回。更正命令按发出顺序传播；地方执行后，中央仍须等待返回光程才能确认结果。</p></section>{[...view.orders].reverse().map(o => <article className="card" key={o.id}><div className="row"><b>{o.kind} → {planetById(view.systems,o.targetId)?.name}</b><span className="badge">{{ transmitting: '等待报告', deferred: '已知推迟', executed: '确认执行', adjusted: '确认调整', rejected: '确认拒绝' }[o.status]}</span></div><p>{o.result}</p><small>发出 {year(o.issuedAt)} · 预计抵达 {year(o.arrivesAt)} · 预算 {o.budget} Cr</small><details><summary>完整授权</summary><p>来源 {o.sourceId}；优先级 {o.priority}；期限 {year(o.deadline)}；风险容忍 {(o.risk * 100).toFixed(0)}%；{o.authorization}；完成后 {o.after}</p></details></article>)}</>}
   {tab === 'history' && <><section className="card"><h3>可解释的国家历史</h3><p>只显示已经抵达中央的报告。重要结果列出主要原因与下一步行动。</p></section>{world && <HistoryChart world={world}/>}<div className="feed">{[...view.messages].reverse().slice(0, historyLimit).map(m => <article className={`card ${m.tone}`} key={m.id}><small>发生 {year(m.occurredAt)} → 得知 {year(m.receivedAt)}</small><h3>{m.title}</h3><p>{m.body}</p><details><summary>原因与可采取行动</summary><ul>{m.cause.map((c, i) => <li key={i}>{c}</li>)}</ul><p>{m.action}</p></details></article>)}</div>{view.messages.length>historyLimit&&<button onClick={()=>setHistoryLimit(n=>n+120)}>读取更早的历史</button>}</>}
  </div></section></main>
  <footer className="bridge-console">
   <div className="bridge-readouts"><EmpireClock time={view.time} fraction={fraction} pending={pending}/><div className="header-stats"><span><small>中央财政</small><b>{number(view.credits)} <em>Cr</em></b></span><span><small>人口估计</small><b>{number(knownPopulation)}</b></span><span><small>已确认世界</small><b>{String(knownWorlds.length).padStart(2, '0')}</b></span></div></div>
   <div className="speed"><span className="time-state"><i className={speed === 0 ? 'status-light paused' : 'status-light'}/>{speed === 0 ? '时间暂停' : '时间推进'}<small>推进尺度 · 年 / 秒</small></span><div>{SPEEDS.map(s => <button disabled={view.failed || fatal} key={s.label} aria-pressed={speed === s.value} className={speed === s.value ? 'active' : ''} onClick={() => setSpeed(s.value)}>{s.label}</button>)}</div></div>
   <div className="status-strip"><div role="status" className={fatal ? 'error' : ''}>{notice}</div><span>自动记录 · 30 秒<span className="status-light" /></span></div>
  </footer>
 </div>;
}
function Metric({ label, value }: {
    label: string;
    value: string;
}) { return <div className="metric"><small>{label}</small><strong>{value}</strong></div>; }
function Empty() { return <section className="card"><p>尚未收到该地点的地方报告。请先完成探测或星际拓荒。</p></section>; }
function LaunchPanel({ view, targetId, act }: {
    view: PlayerView;
    targetId: string;
    act: (a: Action) => void;
}) {
    const [authorization, setAuthorization] = useState<Directive['authorization']>('adaptive'), [risk, setRisk] = useState(.5), [goal, setGoal] = useState<Zone>('housing');
    const [chosenOrigin,setChosenOrigin] = useState(HOME);
    const origins=Object.values(view.worlds).filter(w=>w.systemId==='sol' && !w.independent && w.spaceport>=100 && w.planetId!==targetId);
    const originId=origins.some(w=>w.planetId===chosenOrigin)?chosenOrigin:origins[0]?.planetId;
    const target = systemForPlanet(view.systems,targetId)!, body=planetById(view.systems,targetId)!, home = view.worlds[originId];
    if (!home) return <section className="card"><p>请选择另一颗行星作为目标。出发地需要成熟轨道工业。</p></section>;
    if (body.kind==='气态' && view.intel[targetId].level!=='observed') return <section className="card"><h3>{body.name}</h3><p>气态行星尚不支持地表殖民。</p></section>;
    const kinds: ShipKind[] = view.intel[targetId].level === 'observed' ? ['probe'] : view.intel[targetId].level === 'surveyed' && !view.worlds[targetId] ? ['colony'] : ['freighter', 'passenger'];
    if (body.primary && target.anomaly)
        return null;
    return <section className="card"><h3>{planetById(view.systems,originId)?.name} → {body.name}</h3><label>出发行星<select value={originId} onChange={e=>setChosenOrigin(e.target.value)}>{origins.map(w=><option key={w.planetId} value={w.planetId}>{planetById(view.systems,w.planetId)?.name}</option>)}</select></label><label>地方授权<select value={authorization} onChange={e => setAuthorization(e.target.value as typeof authorization)}><option value="strict">严格：遵循既定方案</option><option value="adaptive">适应性：允许调整</option><option value="broad">广泛：地方自主选择</option></select></label><label>发展目标<select value={goal} onChange={e => setGoal(e.target.value as Zone)}>{Object.entries(ZONES).map(([id, z]) => <option key={id} value={id}>{z.name}</option>)}</select></label><label>风险容忍度<input type="range" min="0" max="1" step="0.1" value={risk} onChange={e => setRisk(Number(e.target.value))}/>{(risk * 100).toFixed(0)}%</label>{kinds.map(kind => { const t = SHIPS[kind], speed = shipSpeed(home, kind), travel = Math.max(1/12,travelDistance(view.systems,originId,targetId) / speed), existing = view.ships.some(s => s.originId===originId && s.kind === kind && s.targetId === targetId && s.status !== 'lost' && (kind === 'probe' || kind === 'colony' || s.status === 'outbound' || s.status === 'building')); return <div className="mission" key={kind}><h4>{t.name}</h4><p>{t.cost.toLocaleString()} Cr · {t.goods} 工业品 · {t.components} 高级部件</p><small>建造 {t.buildYears} 年；航程约 {travel.toFixed(1)} 年，舰上约 {(travel * Math.sqrt(1 - speed ** 2)).toFixed(1)} 年；速度 {(speed * 100).toFixed(1)}% c。报告再延迟 {target.distance.toFixed(1)} 年。</small>{kind !== 'probe' && <p>{kind === 'colony' ? '24,000 名拓荒者和完整生产物资' : kind === 'freighter' ? '装载：食物 400、能源 400、原料 500、工业品 300、高级部件 100' : '5,000 名移民；乘员在舰上经历固有时间'}</p>}<button disabled={existing || home.finance.balance < t.cost} onClick={() => act({ type: 'launch', originId, targetId, kind, authorization, risk, goal })}>{existing ? '已有同类任务' : '批准建造与装载'}</button></div>; })}<p className="warning">资源立即在出发地投入。已经发出的任务无法撤回。</p></section>;
}
function DirectivePanel({ view, targetId, kind, act }: {
    view: PlayerView;
    targetId: string;
    kind: Directive['kind'];
    act: (a: Action) => void;
}) {
    const defaults: Record<string, string> = { policy: 'balanced', budget: '.22', hub: 'rail', project: 'spaceport', reform: 'federation', contact: 'observe' };
    const [value, setValue] = useState(defaults[kind] ?? 'allow'), [budget, setBudget] = useState(kind === 'budget' ? 1000 : kind === 'project' ? 5000 : 500), [priority, setPriority] = useState(2), [authorization, setAuthorization] = useState<Directive['authorization']>('adaptive'), [extraYears, setExtraYears] = useState(20);
    const distance = systemForPlanet(view.systems,targetId)!.distance;
    const titles: Record<string, string> = { policy: '发展政策', budget: '财政拨款与税收授权', hub: '战略交通枢纽', project: '轨道工业工程', reform: '政府改革', contact: '文明接触授权', evacuate: '疏散返航', charter: '地方自主拓荒授权' };
    const options: Record<string, Record<string, string>> = { policy: Object.fromEntries(Object.entries(POLICIES).map(([k, p]) => [k, `${p.name} · ${p.effect}`])), reform: { federation: '自治联邦', republic: '代议共和国', directorate: '统制政府' }, charter: { allow: '允许地方探测与拓荒', deny: '禁止批准新任务' }, contact: { observe: '不干涉观察', secret: '秘密观察', contact: '公开接触', exchange: '技术交流', compete: '资源竞争' } };
    return <section className="card"><h3>{titles[kind]}</h3>{options[kind] && <label>方案<select value={value} onChange={e => setValue(e.target.value)}>{Object.entries(options[kind]).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>}{kind === 'budget' && <label>地方税率<input type="number" min="0.05" max="0.5" step="0.01" value={value} onChange={e => setValue(e.target.value)}/></label>}{kind === 'evacuate' && <p>需要已抵达当地的载人舰船和 50 能源。当地装载最多 5,000 人返航母星，中央需等待光速执行报告。</p>}{kind === 'charter' && <p>地方需要工业能力 ≥30、人口 ≥50,000、成熟轨道设施和推进技术。每十年自主评估邻近目标，先探测再拓荒。</p>}{kind === 'hub' && <p>消耗当地 20 工业品，自动连接干线并提高物流效率。</p>}{kind === 'project' && <p>当地需要工业能力 ≥20、50 高级部件；随后按预算建设轨道设施，基础工期约 50 年。</p>}{kind === 'reform' && <p>联邦要求自治倾向 ≥50、支持 ≥45；统制要求集权群体过半、支持 ≥60；共和国要求支持 ≥50。旧合同继续执行。</p>}<div className="form-grid"><label>中央预算 / Cr<input type="number" min="0" step="100" value={budget} onChange={e => setBudget(Number(e.target.value))}/></label><label>优先级<select value={priority} onChange={e => setPriority(Number(e.target.value))}><option value="1">常规</option><option value="2">重要</option><option value="3">紧急</option></select></label><label>执行授权<select value={authorization} onChange={e => setAuthorization(e.target.value as typeof authorization)}><option value="strict">严格</option><option value="adaptive">适应性</option><option value="broad">广泛</option></select></label><label>抵达后期限 / 年<input type="number" min="1" max="100" value={extraYears} onChange={e => setExtraYears(Number(e.target.value))}/></label></div><p className="warning">预计 {distance.toFixed(1)} 年后抵达；约 {(distance * 2).toFixed(1)} 年后才能得知执行结果。不会取消旧命令；地方可以调整、推迟或拒绝。</p><button disabled={budget < 0 || budget > view.credits || !Number.isFinite(budget)} onClick={() => act({ type: 'directive', directive: { targetId, kind, value, budget, priority, deadline: view.time + distance + extraYears, risk: .5, authorization, after: 'maintain' } })}>发送 {titles[kind]}</button></section>;
}
function PopulationPanel({ world: w }: {
    world: WorldState;
}) { const axes = ['集权 → 自治', '等级 → 平等', '生态 → 开发', '管制 → 市场']; return <><section className="card"><h3>人口与政府</h3><div className="metrics"><Metric label="政体" value={{ republic: '代议共和国', federation: '自治联邦', directorate: '统制政府' }[w.regime]}/><Metric label="支持率" value={`${w.support.toFixed(0)}%`}/><Metric label="社会稳定" value={`${w.stability.toFixed(0)}%`}/></div>{axes.map((name, i) => { const v = w.cohorts.reduce((s, c) => s + c.axes[i] * c.size, 0) / Math.max(w.population, 1); return <label key={name}>{name} · {v.toFixed(0)}<progress max={100} value={v}/></label>; })}<p>观点通过生活利益、距离和代际更替缓慢变化；政策影响支持率，长期低支持会带来抵制与政府重组。</p></section><section className="card"><h3>利益联盟</h3>{axes.map((name, i) => { const share = w.cohorts.filter(c => c.axes[i] >= 55).reduce((s, c) => s + c.size, 0) / w.population; return <Metric key={name} label={`${name.split(' → ')[1]}倾向联盟`} value={`${(share * 100).toFixed(0)}% 人口`}/>; })}</section><section className="card"><h3>12 个人口群体</h3><div className="table-scroll"><table><thead><tr><th>区域 / 职业</th><th>规模</th><th>教育</th><th>生活</th><th>支持</th></tr></thead><tbody>{w.cohorts.map(c => <tr key={c.id}><td>{c.region + 1} / {{ workers: '产业工人', scientists: '科研人员', farmers: '农业人口', services: '服务业' }[c.profession]}</td><td>{number(c.size)}</td><td>{c.education.toFixed(0)}</td><td>{c.living.toFixed(0)}</td><td>{c.support.toFixed(0)}</td></tr>)}</tbody></table></div><details><summary>年龄与文化认同</summary>{w.cohorts.map(c => <p key={c.id}>群体 {c.id + 1}：青年 {(c.young * 100).toFixed(0)}%，老年 {(c.elderly * 100).toFixed(0)}%，共同认同 {c.identity.toFixed(0)}。</p>)}</details></section></>; }
function Fleet({ view, onSelect }: {
    view: PlayerView;
    onSelect: (id: string) => void;
}) { return <section className="card"><h3>已知舰队 · {view.ships.length} 项任务记录</h3>{view.ships.length === 0 ? <p>尚无舰船任务。</p> : view.ships.map(s => <div className="mission" key={s.id}><button onClick={() => onSelect(s.id)} aria-label={"在星图查看 " + s.name}>{s.name} ↗</button><p>{planetById(view.systems,s.originId)?.name} → {planetById(view.systems,s.targetId)?.name}</p><progress value={getShipProgress(view, s)} max={1}/><small>{s.status === 'lost' ? '已确认损失' : s.status === 'arrived' ? '已确认抵达' : view.time >= s.arrivesAt ? '按计划应已抵达，等待报告' : view.time < s.departsAt ? '建造与装载中' : '预计航行中'} · 抵达日期 {year(s.arrivesAt)}</small><p>帝国航程 {(s.arrivesAt - s.departsAt).toFixed(1)} 年 / 舰上 {s.properYears.toFixed(1)} 年 · 乘员 {number(s.passengers)} · 可靠性 {(s.reliability * 100).toFixed(1)}%</p></div>)}</section>; }
function HistoryChart({ world }: {
    world: WorldState;
}) { const data = world.history; if (data.length < 2)
    return null; const line = (key: 'ecology' | 'support' | 'industry') => data.map((d, i) => `${10 + i / (data.length - 1) * 380},${110 - d[key]}`).join(' '); return <section className="card"><h3>地方历史 · 截至最近报告</h3><svg className="history-chart" viewBox="0 0 400 135" role="img" aria-label="支持率、生态和工业历史趋势"><polyline points={line('support')} fill="none" stroke="#e4bb7a"/><polyline points={line('ecology')} fill="none" stroke="#82c2a8"/><polyline points={line('industry')} fill="none" stroke="#88b3d5"/><text x="10" y="130">{Math.floor(data[0].time)}</text><text x="350" y="130">{Math.floor(data[data.length - 1].time)}</text></svg><p>金：支持率 · 绿：生态 · 蓝：工业（0–100）</p></section>; }
