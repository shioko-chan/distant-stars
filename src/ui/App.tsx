import { useEffect, useMemo, useRef, useState } from "react";
import { GalaxyMap } from "../presentation/GalaxyMap";
import { hasSave, loadGame, saveGame } from "../persistence/save";
import { POLICIES, RESEARCH, SPEEDS, YEAR_MS } from "../simulation/content";
import type { GameState, Policy, ResearchFocus } from "../simulation/types";
import { advance, createGame, getEstimatedWorld, getShipProgress, getVisibleMessages, launchColony, launchProbe, markMessagesRead, sendPolicy, setResearchFocus } from "../simulation/world";

type Tab = "overview" | "messages" | "orders" | "research";
const fmtYear = (time: number) => `${new Date(time).getUTCFullYear()} 年`;
const fmtNumber = (value: number) => value >= 1e9 ? `${(value / 1e9).toFixed(2)} B` : value >= 1e6 ? `${(value / 1e6).toFixed(2)} M` : Math.round(value).toLocaleString("zh-CN");
const fmtDate = (time: number) => new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short" }).format(new Date(time));
const levelName = { observed: "天文观测", surveyed: "近距勘测", colonized: "殖民地报告" };

export function App() {
  const [state, setState] = useState<GameState>(() => loadGame() ?? createGame());
  const [selectedId, setSelectedId] = useState("star-1");
  const [tab, setTab] = useState<Tab>("overview");
  const [policy, setPolicy] = useState<Policy>("balanced");
  const [toast, setToast] = useState("");
  const lastTick = useRef(performance.now());
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = performance.now(); const elapsed = Math.min(2, (now - lastTick.current) / 1000); lastTick.current = now;
      setState((current) => current.speed ? advance(current, current.speed * elapsed) : current);
    }, 500);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => { const timer = window.setInterval(() => saveGame(stateRef.current), 30_000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(""), 2400); return () => clearTimeout(timer); }, [toast]);

  const selected = state.systems.find((system) => system.id === selectedId) ?? state.systems[0];
  const intel = state.intel[selected.id];
  const estimated = getEstimatedWorld(state, selected.id);
  const visibleMessages = getVisibleMessages(state);
  const unread = visibleMessages.filter((item) => item.unread).length;
  const mission = state.ships.find((ship) => ship.targetId === selected.id);
  const inFlight = mission?.status === "outbound";
  const surveyReport = state.messages.find((item) => item.id.startsWith("survey-") && state.ships.some((ship) => ship.targetId === selected.id && item.id === `survey-${ship.id}`));
  const yearsToReport = surveyReport && surveyReport.receivedAt > state.time ? (surveyReport.receivedAt - state.time) / YEAR_MS : 0;
  const worldCount = Object.keys(state.worlds).length;
  const stage = worldCount > 1 ? 3 : state.ships.some((ship) => ship.kind === "colony") ? 2 : state.ships.length ? 1 : 0;
  const nearest = useMemo(() => [...state.systems].filter((s) => s.id !== "sol").sort((a, b) => a.distance - b.distance).slice(0, 6), [state.systems]);

  function mutate(action: (current: GameState) => GameState, confirmation: string) { setState(action); setToast(confirmation); }
  function manualSave() { saveGame(state); setToast("帝国档案已保存"); }
  function manualLoad() { const loaded = loadGame(); if (loaded) { setState(loaded); setToast("已读取最近存档"); } }

  return <div className="app">
    <header className="masthead">
      <div className="brand"><span className="brand-mark">DS</span><div><b>DISTANT STARS</b><small>遥远群星 · 帝国行政中枢</small></div></div>
      <div className="imperial-clock"><small>帝国标准时间</small><strong>{fmtYear(state.time)}</strong></div>
      <div className="header-stats">
        <span><small>中央财政</small><b>{Math.round(state.credits).toLocaleString()} Cr</b></span>
        <span><small>总人口</small><b>{fmtNumber(Object.values(state.worlds).reduce((sum, world) => sum + world.population, 0))}</b></span>
        <span><small>已建世界</small><b>{worldCount}</b></span>
      </div>
      <div className="save-actions"><button onClick={manualSave}>保存</button><button onClick={manualLoad} disabled={!hasSave()}>读取</button></div>
    </header>

    <main className="workspace">
      <section className="map-column">
        <GalaxyMap state={state} selectedId={selected.id} onSelect={setSelectedId} />
        <div className="map-title"><span>战略星图 / 近邻空间</span><small>固定种子 {state.seed} · 20 个已观测恒星系</small></div>
        <div className="legend"><span><i className="dot home" />行政中心</span><span><i className="dot colony" />定居世界</span><span><i className="route" />在途任务</span><small>拖动旋转 · 滚轮缩放 · 点击恒星选择</small></div>
        <div className="nearby-list">{nearest.map((system) => <button key={system.id} className={selected.id === system.id ? "active" : ""} onClick={() => setSelectedId(system.id)}><b>{system.name}</b><span>{system.distance.toFixed(1)} ly</span><em>{levelName[state.intel[system.id].level]}</em></button>)}</div>
      </section>

      <section className="command-column">
        <nav className="tabs">
          <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>目标</button>
          <button className={tab === "messages" ? "active" : ""} onClick={() => { setTab("messages"); setState(markMessagesRead); }}>消息 {unread > 0 && <i>{unread}</i>}</button>
          <button className={tab === "orders" ? "active" : ""} onClick={() => setTab("orders")}>命令</button>
          <button className={tab === "research" ? "active" : ""} onClick={() => setTab("research")}>科研</button>
        </nav>

        {tab === "overview" && <div className="scroll-pane">
          <section className="target-head">
            <div className={`stellar-icon spectral-${selected.spectral}`}>{selected.spectral}</div>
            <div><span>{intel.level === "colonized" ? "帝国世界" : "目标恒星系"}</span><h1>{selected.name}</h1><p>{selected.distance ? `${selected.distance.toFixed(2)} 光年 · ${selected.spectral} 型恒星` : "国家行政中心 · G 型恒星"}</p></div>
          </section>

          <section className="intel-card">
            <div className="section-heading"><span>情报状态</span><b className={`level-${intel.level}`}>{levelName[intel.level]}</b></div>
            <div className="intel-times"><span><small>情报发生</small><b>{fmtDate(intel.observedAt)}</b></span><span><small>中央接收</small><b>{fmtDate(intel.receivedAt)}</b></span><span><small>情报年龄</small><b>{((state.time - intel.observedAt) / YEAR_MS).toFixed(1)} 年</b></span></div>
            {intel.level === "observed" ? <div className="uncertain-grid"><Metric label="宜居度" value="18–91%" /><Metric label="资源" value="未知" /><Metric label="风险" value="高不确定" /></div> : <div className="uncertain-grid"><Metric label="宜居度" value={`${Math.round(selected.habitability * 100)}%`} /><Metric label="资源潜力" value={`${Math.round(selected.resources * 100)}%`} /><Metric label="任务风险" value={`${Math.round(selected.risk * 100)}%`} /></div>}
            <p className="uncertainty">估计误差 ±{Math.round((intel.uncertainty + Math.max(0, (state.time - intel.observedAt) / YEAR_MS) * 0.008) * 100)}% · 主要来源：通信延迟、轨道覆盖与人口统计外推</p>
          </section>

          {estimated && <WorldPanel world={estimated} confirmed={intel.worldSnapshot} />}

          {mission && <section className="mission-card"><div className="section-heading"><span>{mission.kind === "probe" ? "无人探测任务" : "星际拓荒任务"}</span><b>{mission.status === "arrived" ? yearsToReport > 0 ? "等待信号" : "已抵达" : "航行中"}</b></div><div className="progress"><i style={{ width: `${getShipProgress(state, mission) * 100}%` }} /></div><div className="mission-numbers"><span>{mission.name}</span><span>{(mission.velocityC * 100).toFixed(1)}% c</span><span>舰上经历 {mission.properYears.toFixed(1)} 年</span></div>{yearsToReport > 0 && <p className="signal-wait">探测器可能已经抵达；中央还需等待约 {yearsToReport.toFixed(1)} 年才能收到报告。</p>}</section>}

          <section className="action-card">
            <div className="section-heading"><span>战略行动</span><small>先预览，再承担时间后果</small></div>
            {selected.id === "sol" ? <p className="empty">选择一颗邻星以规划探测与拓荒任务。</p> : intel.level === "observed" ? <>
              <Action title="发送无人探测器" meta={`3,800 Cr · ${(selected.distance / Math.min(0.1 + state.propulsionLevel * 0.025, 0.25)).toFixed(1)} 年航程 · 报告再延迟 ${selected.distance.toFixed(1)} 年`} body="完成环境、资源和异常信号近距勘测。任务发出后无法召回。" disabled={state.credits < 3800 || Boolean(mission)} onClick={() => mutate((s) => launchProbe(s, selected.id), "无人探测任务已批准")} />
            </> : intel.level === "surveyed" && !state.worlds[selected.id] ? <>
              <Action title="批准星际拓荒" meta={`18,000 Cr · ${(selected.distance / Math.min(0.055 + state.propulsionLevel * 0.018, 0.2)).toFixed(1)} 年航程`} body="24,000 名拓荒者与完整生产体系。地方拥有广泛选址授权，抵达时可能调整方案。" disabled={state.credits < 18000 || inFlight} onClick={() => mutate((s) => launchColony(s, selected.id), "曙光拓荒任务已批准")} />
            </> : state.worlds[selected.id] ? <>
              <label>发展政策</label><select value={policy} onChange={(event) => setPolicy(event.target.value as Policy)}>{Object.entries(POLICIES).map(([id, item]) => <option value={id} key={id}>{item.name} — {item.effect}</option>)}</select>
              <Action title="发送政策命令" meta={`2,400 Cr · ${selected.distance.toFixed(1)} 年后抵达`} body="适应性授权：地方可在资源或稳定度不足时调整执行。新命令不会取消旧命令。" disabled={state.credits < 2400} onClick={() => mutate((s) => sendPolicy(s, selected.id, policy), "命令已进入通信链路")} />
            </> : null}
          </section>
        </div>}

        {tab === "messages" && <div className="scroll-pane feed"><div className="pane-title"><span>已抵达中央的消息</span><small>未来消息不会提前显示</small></div>{visibleMessages.map((item) => <article className={`message ${item.tone}`} key={item.id}><header><div><small>{fmtDate(item.receivedAt)} 收到</small><h2>{item.title}</h2></div><span>{item.receivedAt === item.occurredAt ? "本地" : `发生于 ${fmtDate(item.occurredAt)}`}</span></header><p>{item.body}</p><details><summary>为什么会发生？</summary><ul>{item.cause.map((cause) => <li key={cause}>{cause}</li>)}</ul>{item.action && <b>现在可做：{item.action}</b>}</details></article>)}</div>}

        {tab === "orders" && <div className="scroll-pane"><div className="pane-title"><span>命令与任务记录</span><small>{state.orders.filter((o) => o.status === "transmitting").length} 条传播中</small></div>{state.orders.length === 0 ? <p className="empty large">尚未发出国家命令。<br />选择目标恒星，开始第一项探测任务。</p> : state.orders.map((order) => <article className="order" key={order.id}><div><i className={`status ${order.status}`} /><span><b>{order.summary}</b><small>{state.systems.find((s) => s.id === order.targetId)?.name} · {order.authorization === "broad" ? "广泛授权" : order.authorization === "adaptive" ? "适应性授权" : "严格执行"}</small></span></div><div><b>{order.status === "transmitting" ? "传播中" : order.status === "adjusted" ? "地方调整" : "已执行"}</b><small>{fmtDate(order.issuedAt)} → {fmtDate(order.arrivesAt)}</small></div></article>)}</div>}

        {tab === "research" && <div className="scroll-pane"><div className="pane-title"><span>科研战略</span><small>机构自主选择具体项目</small></div><div className="tech-summary"><small>无人探测速度</small><strong>{(Math.min(0.1 + state.propulsionLevel * 0.025, 0.25) * 100).toFixed(1)}% c</strong><div className="progress"><i style={{ width: `${(state.propulsionLevel % 1) * 100}%` }} /></div><p>推进研究每约 55 年形成一次可部署世代；物质速度永远低于光速。</p></div><div className="research-list">{Object.entries(RESEARCH).map(([id, name]) => <button key={id} className={state.researchFocus === id ? "active" : ""} onClick={() => mutate((s) => setResearchFocus(s, id as ResearchFocus), `科研重点已调整为“${name}”`)}><i /><span><b>{name}</b><small>{id === "propulsion" ? "提高探测器与拓荒舰速度" : id === "governance" ? "减少远方政策执行偏差" : "改善国家长期能力与地方部署"}</small></span><em>{state.researchFocus === id ? "重点" : "常规"}</em></button>)}</div></div>}
      </section>
    </main>

    <footer className="timeline">
      <div className="stage-track">{["母系发展", "恒星探测", "拓荒远征", "系外历史"].map((name, index) => <span className={stage >= index ? "reached" : ""} key={name}><i>{stage > index ? "✓" : index + 1}</i><b>{name}</b></span>)}</div>
      <div className="speed"><span><small>时间流速</small><b>{SPEEDS.find((item) => item.value === state.speed)?.rate ?? `${state.speed} 年/秒`}</b></span>{SPEEDS.map((item) => <button className={state.speed === item.value ? "active" : ""} key={item.label} onClick={() => setState((current) => ({ ...current, speed: item.value }))}>{item.label}</button>)}</div>
    </footer>
    {toast && <div className="toast">{toast}</div>}
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <span><small>{label}</small><b>{value}</b></span>; }
function Action({ title, meta, body, disabled, onClick }: { title: string; meta: string; body: string; disabled?: boolean; onClick: () => void }) { return <button className="action" disabled={disabled} onClick={onClick}><span><b>{title}</b><small>{body}</small></span><em>{meta}</em></button>; }
function WorldPanel({ world, confirmed }: { world: ReturnType<typeof getEstimatedWorld> extends infer T ? NonNullable<T> : never; confirmed?: GameState["worlds"][string] }) {
  return <section className="world-card"><div className="section-heading"><span>估计当前状态</span><small>非真实状态 · ±{Math.round(world.uncertainty)}%</small></div><h3>{world.name}</h3><div className="world-metrics"><Metric label="人口估计" value={fmtNumber(world.population)} /><Metric label="支持率" value={`${Math.round(world.support)}%`} /><Metric label="稳定度" value={`${Math.round(world.stability)}%`} /><Metric label="工业" value={`${Math.round(world.industry)}`} /><Metric label="食物库存" value={`${Math.round(world.food)}`} /><Metric label="价格指数" value={world.priceIndex.toFixed(2)} /></div>{confirmed && <p>最近确认人口 {fmtNumber(confirmed.population)}；其后的 {world.age.toFixed(1)} 年由已知计划外推。</p>}</section>;
}
