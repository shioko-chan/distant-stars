import { deterministicNoise, mulberry32 } from "./rng";
import { START_TIME, YEAR_MS } from "./content";
import type { GameState, IntelRecord, Message, Order, Policy, ResearchFocus, Ship, StarSystem, WorldState } from "./types";

const names = ["南门二", "巴纳德", "天狼", "鲁坦", "鲸鱼座 τ", "波江座 ε", "拉卡耶", "罗斯 128", "格利泽 667", "卡普坦", "轩辕增十九", "印第安座 ε", "格利泽 832", "沃尔夫 1061", "罗斯 154", "格利泽 581", "格利泽 876", "天苑四", "格利泽 1061", "蒂加登"];

function makeSystems(seed: number): StarSystem[] {
  const random = mulberry32(seed);
  const systems: StarSystem[] = [{ id: "sol", name: "太阳系", x: 0, y: 0, z: 0, distance: 0, spectral: "G", habitability: 1, resources: 0.75, risk: 0.05 }];
  names.forEach((name, index) => {
    const distance = 3.8 + index * 0.46 + random() * 2.4;
    const angle = random() * Math.PI * 2;
    const elevation = (random() - 0.5) * 0.7;
    systems.push({ id: `star-${index + 1}`, name, x: Math.cos(angle) * distance, y: elevation * distance, z: Math.sin(angle) * distance, distance, spectral: (["G", "K", "M", "M", "F"] as const)[Math.floor(random() * 5)], habitability: 0.18 + random() * 0.77, resources: 0.25 + random() * 0.7, risk: 0.08 + random() * 0.65, anomaly: index === 7 ? "civilization" : index === 3 || index === 14 ? "ruins" : undefined });
  });
  return systems;
}

function earth(): WorldState {
  return { systemId: "sol", name: "地球共同体", foundedAt: START_TIME - 400 * YEAR_MS, population: 12_400_000_000, food: 82, materials: 76, energy: 91, industry: 78, research: 64, treasury: 82_000, priceIndex: 1, support: 67, autonomy: 18, stability: 82, ecology: 63, policy: "balanced", plan: "science", spaceport: true };
}

function newMessage(id: string, occurredAt: number, receivedAt: number, title: string, body: string, tone: Message["tone"], cause: string[], action?: string): Message {
  return { id, occurredAt, receivedAt, title, body, tone, unread: true, cause, action };
}

export function createGame(seed = 731942): GameState {
  const systems = makeSystems(seed);
  const home = earth();
  const intel: Record<string, IntelRecord> = {};
  systems.forEach((system) => { intel[system.id] = { systemId: system.id, level: system.id === "sol" ? "colonized" : "observed", observedAt: START_TIME - system.distance * YEAR_MS, receivedAt: START_TIME, worldSnapshot: system.id === "sol" ? home : undefined, uncertainty: system.id === "sol" ? 0 : 0.45 }; });
  return { version: 1, seed, time: START_TIME, speed: 0, capitalId: "sol", systems, worlds: { sol: home }, intel, ships: [], orders: [], credits: 82_000, researchFocus: "propulsion", propulsionLevel: 0, milestones: [], lastAutosaveAt: START_TIME, messages: [newMessage("welcome", START_TIME, START_TIME, "群星纪元开始", "太阳系经济稳定。国家议会授权首批恒星际探测任务。选择一颗邻星，开始跨越真实距离的远征。", "info", ["成熟的轨道工业", "0.10c 无人探测能力"], "选择目标并发送无人探测器")] };
}

function systemOf(state: GameState, id: string) { return state.systems.find((system) => system.id === id)!; }
function pushMessage(state: GameState, item: Message) { if (!state.messages.some((existing) => existing.id === item.id)) state.messages.unshift(item); }

export function launchProbe(state: GameState, targetId: string): GameState {
  const target = systemOf(state, targetId);
  if (targetId === "sol" || state.credits < 3800 || state.ships.some((ship) => ship.targetId === targetId && ship.kind === "probe")) return state;
  const velocityC = Math.min(0.1 + state.propulsionLevel * 0.025, 0.25);
  const years = target.distance / velocityC;
  const id = `probe-${Math.round(state.time)}-${targetId}`;
  const ship: Ship = { id, name: `远眺-${state.ships.filter((s) => s.kind === "probe").length + 1}`, kind: "probe", originId: "sol", targetId, launchedAt: state.time, arrivesAt: state.time + years * YEAR_MS, velocityC, status: "outbound", properYears: years * Math.sqrt(1 - velocityC ** 2) };
  const order: Order = { id: `order-${id}`, kind: "probe", targetId, issuedAt: state.time, arrivesAt: state.time, summary: `完整勘测 ${target.name}`, budget: 3800, authorization: "adaptive", status: "executed" };
  return { ...state, credits: state.credits - 3800, ships: [...state.ships, ship], orders: [order, ...state.orders], messages: [newMessage(`launch-${id}`, state.time, state.time, "探测器启航", `${ship.name} 已驶向 ${target.name}，预计 ${years.toFixed(1)} 年后抵达；勘测信号还需 ${target.distance.toFixed(1)} 年返回。`, "good", ["推进速度受当前科技限制", "信息只能以光速返回"], "推进时间，等待遥测"), ...state.messages] };
}

export function launchColony(state: GameState, targetId: string): GameState {
  const target = systemOf(state, targetId);
  if (state.intel[targetId]?.level !== "surveyed" || state.credits < 18000 || state.worlds[targetId] || state.ships.some((ship) => ship.targetId === targetId && ship.kind === "colony")) return state;
  const velocityC = Math.min(0.055 + state.propulsionLevel * 0.018, 0.2);
  const years = target.distance / velocityC;
  const id = `colony-${Math.round(state.time)}-${targetId}`;
  const ship: Ship = { id, name: `曙光-${state.ships.filter((s) => s.kind === "colony").length + 1}`, kind: "colony", originId: "sol", targetId, launchedAt: state.time, arrivesAt: state.time + years * YEAR_MS, velocityC, status: "outbound", properYears: years * Math.sqrt(1 - velocityC ** 2) };
  const order: Order = { id: `order-${id}`, kind: "colony", targetId, issuedAt: state.time, arrivesAt: ship.arrivesAt, summary: `建立 ${target.name} 自持前哨`, budget: 18000, authorization: "broad", status: "transmitting", payload: "balanced" };
  return { ...state, credits: state.credits - 18000, ships: [...state.ships, ship], orders: [order, ...state.orders], messages: [newMessage(`launch-${id}`, state.time, state.time, "拓荒舰离港", `${ship.name} 携带 24,000 名拓荒者驶向 ${target.name}。地方团队获准按抵达时的现实调整落点。`, "good", ["目的地已完成勘测", "广泛授权降低过时命令风险"], "等待抵达与报告"), ...state.messages] };
}

export function sendPolicy(state: GameState, targetId: string, policy: Policy): GameState {
  const target = systemOf(state, targetId);
  if (!state.worlds[targetId] || targetId === "sol" || state.credits < 2400) return state;
  const id = `policy-${Math.round(state.time)}-${targetId}`;
  const order: Order = { id, kind: "policy", targetId, issuedAt: state.time, arrivesAt: state.time + target.distance * YEAR_MS, summary: `将发展政策调整为“${policy}”`, budget: 2400, authorization: "adaptive", status: "transmitting", payload: policy };
  return { ...state, credits: state.credits - 2400, orders: [order, ...state.orders], messages: [newMessage(`sent-${id}`, state.time, state.time, "政策命令已发出", `向 ${target.name} 的命令将在 ${target.distance.toFixed(1)} 年后抵达。它不会撤回在途旧命令。`, "info", ["通信严格以光速传播", "地方将依据抵达时状态执行"], "可继续观察，或发送更正命令"), ...state.messages] };
}

export function setResearchFocus(state: GameState, focus: ResearchFocus): GameState { return { ...state, researchFocus: focus }; }
export function markMessagesRead(state: GameState): GameState { return { ...state, messages: state.messages.map((item) => item.receivedAt <= state.time ? { ...item, unread: false } : item) }; }

function simulateWorld(world: WorldState, years: number, seed: number, tick: number): WorldState {
  const industryGrowth = (world.policy === "industry" ? 1.6 : world.policy === "ecology" ? 0.65 : 1) * years;
  const carrying = Math.max(40_000, (world.food + world.energy + world.industry) * 2_000_000);
  const popGrowth = Math.min(0.012 * years, 0.06) * (1 - world.population / carrying) * (world.stability / 100);
  const noise = (deterministicNoise(seed, tick + world.systemId.length) - 0.5) * years * 0.2;
  const population = Math.max(1000, world.population * (1 + popGrowth));
  const food = Math.max(0, Math.min(100, world.food + (world.ecology / 100 * 2.1 - population / 3_000_000) * years));
  const materials = Math.max(0, Math.min(100, world.materials + (world.industry * 0.028 - 1.1) * years));
  const energy = Math.max(0, Math.min(100, world.energy + (2.4 - world.industry * 0.018) * years));
  const shortage = Math.min(food, energy) < 15;
  const support = Math.max(5, Math.min(95, world.support + (world.policy === "autonomy" ? 1.5 : world.policy === "industry" ? -0.8 : 0.25) * years + noise - (shortage ? 4 * years : 0)));
  const ecology = Math.max(5, Math.min(100, world.ecology + (world.policy === "ecology" ? 2.2 : world.policy === "industry" ? -1.6 : 0.1) * years));
  const industry = Math.max(2, Math.min(100, world.industry + industryGrowth * (materials > 5 ? 1 : 0.2)));
  const autonomy = Math.max(0, Math.min(100, world.autonomy + (world.systemId === "sol" ? 0 : 0.42 * years) + (world.policy === "autonomy" ? years : 0)));
  const stability = Math.max(4, Math.min(100, world.stability + ((food > 20 && support > 40) ? 0.3 : -1.8) * years));
  const priceIndex = Math.max(0.65, Math.min(4, 1 + (50 - Math.min(food, materials, energy)) / 40));
  return { ...world, population, food, materials, energy, industry, research: Math.min(100, world.research + years * (world.plan === "science" ? 1.5 : 0.45)), treasury: Math.max(0, world.treasury + population / 20_000 * years * (world.policy === "autonomy" ? 0.65 : 1)), priceIndex, support, autonomy, stability, ecology };
}

function foundColony(state: GameState, ship: Ship, target: StarSystem) {
  const chosenPlan: WorldState["plan"] = target.habitability > 0.65 ? "habitat" : target.resources > 0.68 ? "industry" : "preserve";
  const viable = target.habitability + target.resources - target.risk > 0.55;
  const world: WorldState = { systemId: target.id, name: `${target.name}前哨`, foundedAt: ship.arrivesAt, population: viable ? 24_000 : 15_500, food: 56 * target.habitability, materials: 42 * target.resources, energy: 61, industry: 12, research: 8, treasury: 9_000, priceIndex: 1.25, support: 72, autonomy: 32, stability: viable ? 68 : 41, ecology: 78, policy: "balanced", plan: chosenPlan, spaceport: false };
  state.worlds[target.id] = world;
  const order = state.orders.find((item) => item.kind === "colony" && item.targetId === target.id && item.status === "transmitting");
  if (order) { order.status = chosenPlan === "habitat" ? "executed" : "adjusted"; order.summary += chosenPlan === "industry" ? "（落地后转为工业选址）" : chosenPlan === "preserve" ? "（落地后采取谨慎选址）" : ""; }
  const reportAt = ship.arrivesAt + target.distance * YEAR_MS;
  const report = newMessage(`colony-report-${ship.id}`, ship.arrivesAt, reportAt, viable ? "系外前哨建立" : "前哨面临生存压力", `${ship.name} 已在 ${target.name} 建立聚居地。团队根据实地环境选择了${chosenPlan === "industry" ? "资源型工业带" : chosenPlan === "preserve" ? "受保护的封闭栖居地" : "宜居河谷"}，这份消息在当地发出 ${target.distance.toFixed(1)} 年后抵达。`, viable ? "good" : "critical", [`宜居度 ${Math.round(target.habitability * 100)}%`, `资源 ${Math.round(target.resources * 100)}%`, `风险 ${Math.round(target.risk * 100)}%`, "地方拥有广泛选址授权"], viable ? "发送后续政策，或让前哨自主发展" : "发送救援预算或调整发展政策");
  report.worldSnapshot = structuredClone(world);
  pushMessage(state, report);
}

export function advance(state: GameState, years: number): GameState {
  if (years <= 0) return state;
  const next = structuredClone(state);
  next.systems = state.systems;
  const oldTime = next.time;
  next.time += years * YEAR_MS;
  const tick = Math.floor((next.time - START_TIME) / YEAR_MS);
  Object.entries(next.worlds).forEach(([id, world]) => { next.worlds[id] = simulateWorld(world, years, next.seed, tick); });
  const home = next.worlds.sol;
  next.credits += home.population / 550_000_000 * years * (home.policy === "industry" ? 1.15 : 1) * 1000;
  if (next.researchFocus === "propulsion") next.propulsionLevel = Math.min(6, next.propulsionLevel + years / 55);

  next.orders.forEach((order) => {
    if (order.status !== "transmitting" || order.arrivesAt > next.time || order.kind === "colony") return;
    const world = next.worlds[order.targetId];
    if (order.kind === "policy" && world) {
      const requested = order.payload as Policy;
      const adjusted = world.stability < 25 && requested === "industry";
      world.policy = adjusted ? "autonomy" : requested;
      order.status = adjusted ? "adjusted" : "executed";
      const target = systemOf(next, order.targetId);
      pushMessage(next, newMessage(`result-${order.id}`, order.arrivesAt, order.arrivesAt + target.distance * YEAR_MS, adjusted ? "地方调整中央命令" : "政策开始执行", adjusted ? `${world.name} 议会认为工业动员会加剧当前危机，依据适应性授权改为地方自治。` : `${world.name} 已开始执行新的发展政策。`, adjusted ? "warn" : "good", adjusted ? ["稳定度低于 25%", "命令允许因地制宜", "地方支持率压力"] : ["资源满足执行条件", "地方政府支持命令"], "等待政策效果，或发送更正命令"));
    }
  });

  next.ships.forEach((ship) => {
    if (ship.status !== "outbound" || ship.arrivesAt > next.time) return;
    ship.status = "arrived";
    const target = systemOf(next, ship.targetId);
    if (ship.kind === "probe") {
      pushMessage(next, newMessage(`survey-${ship.id}`, ship.arrivesAt, ship.arrivesAt + target.distance * YEAR_MS, `${target.name} 勘测报告`, `探测器完成近距勘测：宜居度 ${Math.round(target.habitability * 100)}%，资源潜力 ${Math.round(target.resources * 100)}%，任务风险 ${Math.round(target.risk * 100)}%。`, target.habitability > 0.55 ? "good" : "warn", ["近轨光谱与地质扫描", "报告按光速返回", target.anomaly ? "发现无法解释的人工信号" : "未发现明确智慧活动"], "评估并发起星际拓荒"));
    } else foundColony(next, ship, target);
  });

  next.messages.forEach((item) => {
    if (!(item.receivedAt > oldTime && item.receivedAt <= next.time)) return;
    if (item.id.startsWith("survey-")) {
      const ship = next.ships.find((candidate) => item.id === `survey-${candidate.id}`)!;
      next.intel[ship.targetId] = { systemId: ship.targetId, level: "surveyed", observedAt: ship.arrivesAt, receivedAt: item.receivedAt, uncertainty: 0.08 };
    }
    if (item.id.startsWith("colony-report-")) {
      const ship = next.ships.find((candidate) => item.id === `colony-report-${candidate.id}`)!;
      next.intel[ship.targetId] = { systemId: ship.targetId, level: "colonized", observedAt: item.occurredAt, receivedAt: item.receivedAt, worldSnapshot: structuredClone(item.worldSnapshot ?? next.worlds[ship.targetId]), uncertainty: 0.16 };
      if (!next.milestones.includes("first-colony")) { next.milestones.push("first-colony"); next.speed = 0; }
    }
  });
  return next;
}

export function getShipProgress(state: GameState, ship: Ship) { return Math.max(0, Math.min(1, (state.time - ship.launchedAt) / (ship.arrivesAt - ship.launchedAt))); }
export function getVisibleMessages(state: GameState) { return state.messages.filter((item) => item.receivedAt <= state.time).sort((a, b) => b.receivedAt - a.receivedAt); }
export function getEstimatedWorld(state: GameState, systemId: string) {
  const intel = state.intel[systemId];
  if (!intel?.worldSnapshot) return undefined;
  const age = (state.time - intel.observedAt) / YEAR_MS;
  return { ...intel.worldSnapshot, population: intel.worldSnapshot.population * (1 + Math.min(age * 0.009, 1.2)), uncertainty: Math.min(65, intel.uncertainty * 100 + age * 0.8), age };
}
