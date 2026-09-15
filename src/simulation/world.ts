import { BALANCE, CONTENT_VERSION, POLICIES, RESEARCH, SHIPS, START_TIME, ZONES, stockZero } from '../content/catalog';
import { settleWorld, clamp } from './economy';
import { createWorld, generateSystem } from './generation';
import type { Action, Directive, GameState, IntelRecord, Message, Order, ResearchFocus, Ship, ShipKind, Signal, StarSystem, WorldState, Zone } from './types';
const roundMonth = (year: number) => START_TIME + Math.ceil((year - START_TIME) * 12 - 1e-8) / 12;
const uid = (s: GameState, prefix: string) => `${prefix}-${++s.sequence}`;
const systemOf = (s: GameState, id: string) => s.systems.find(x => x.id === id);
export function createGame(seed = BALANCE.seed): GameState {
    const systems = Array.from({ length: BALANCE.initialObserved }, (_, i) => generateSystem(seed, i));
    const home = createWorld(systems[0], START_TIME, seed, true);
    const intel: Record<string, IntelRecord> = {};
    for (const sys of systems)
        intel[sys.id] = { systemId: sys.id, level: sys.id === 'sol' ? 'colonized' : 'observed', observedAt: START_TIME - sys.distance, receivedAt: START_TIME, uncertainty: sys.id === 'sol' ? 0 : .45, ...(sys.id === 'sol' ? { survey: sys, worldSnapshot: structuredClone(home) } : {}) };
    const s: GameState = { version: 2, contentVersion: CONTENT_VERSION, seed, tick: 0, time: START_TIME, sequence: 0, rngState: seed >>> 0, systems, worlds: { sol: home }, intel, ships: [], knownShips: [], orders: [], knownOrders: [], signals: [], messages: [], milestones: [], actions: [], routes: [], failed: false, pauseRequested: false };
    report(s, 'sol', '群星纪元开始', '选择邻星发送探测器；在等待期间建设母星、调整科研和政策。', ['无人探测起步速度 0.01c', '20 个初始观测目标', '国家无须新命令也会持续发展'], 'info');
    receive(s);
    return s;
}
function random(s: GameState) { s.rngState = (Math.imul(s.rngState, 1664525) + 1013904223) >>> 0; return s.rngState / 4294967296; }
function queue(s: GameState, signal: Omit<Signal, 'id'>) { s.signals.push({ id: uid(s, 'signal'), ...signal }); }
function report(s: GameState, id: string, title: string, body: string, cause: string[], tone: Message['tone'] = 'info', pause = false) {
    const distance = systemOf(s, id)?.distance ?? 0;
    const message: Message = { id: uid(s, 'message'), systemId: id, occurredAt: s.time, receivedAt: roundMonth(s.time + distance), title, body, cause, tone, pause, action: `可调整政策、授权或运输；从中央发出的新命令约 ${distance.toFixed(1)} 年后抵达。` };
    queue(s, { arrivesAt: message.receivedAt, message });
}
function snapshot(s: GameState, id: string) { const sys = systemOf(s, id)!; const w = s.worlds[id]; queue(s, { arrivesAt: roundMonth(s.time + sys.distance), intel: { systemId: id, level: w && !w.independent ? 'colonized' : 'surveyed', observedAt: s.time, receivedAt: roundMonth(s.time + sys.distance), uncertainty: Math.max(.03, .16 - (w?.tech.sensors ?? 0) * .015), survey: sys, ...(w ? { worldSnapshot: structuredClone(w) } : {}) } }); }
function acknowledge(s: GameState, order: Order, locationId = order.targetId) { const sys = systemOf(s, locationId)!; queue(s, { arrivesAt: roundMonth(s.time + sys.distance), order: structuredClone(order) }); report(s, locationId, order.status === 'rejected' ? '地方拒绝命令' : order.status === 'adjusted' ? '地方调整命令' : '命令执行报告', order.result, [`授权：${order.authorization}`, `预算 ${order.budget} Cr`, `期限 ${order.deadline.toFixed(1)} 年`], order.status === 'rejected' ? 'warn' : 'good'); }
export function shipSpeed(w: WorldState, kind: ShipKind) { const t = SHIPS[kind]; return Math.min(t.maximum, t.speed + Math.floor(w.tech.propulsion) * t.increment); }
function distanceBetween(a: StarSystem, b: StarSystem) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
function launch(s: GameState, a: Extract<Action, {
    type: 'launch';
}>, local = false): string {
    const home = s.worlds[a.originId], target = systemOf(s, a.targetId), origin = systemOf(s, a.originId);
    const template = SHIPS[a.kind];
    if (!home || !target || !origin || a.targetId === a.originId)
        return '无效的出发地或目标';
    if (!local && a.originId !== 'sol')
        return '远方发射由地方拓荒授权执行';
    if (home.spaceport < 100 || home.independent)
        return '出发地缺少成熟轨道工业';
    if (s.ships.filter(x => x.status === 'building' || x.status === 'outbound').length >= BALANCE.maxShips)
        return '已达到 100 艘活动舰船容量';
    if (a.kind === 'colony' && (!local ? s.intel[a.targetId]?.level !== 'surveyed' : !s.ships.some(x => x.originId === a.originId && x.targetId === a.targetId && x.kind === 'probe' && x.status === 'arrived')))
        return '需要已经抵达的完整勘测报告';
    if (a.kind === 'colony' && s.intel[a.targetId]?.survey?.anomaly === 'civilization')
        return '原生文明世界不可直接拓荒；请制定接触政策';
    if ((local ? s.ships : s.knownShips).some(x => x.originId === a.originId && x.kind === a.kind && x.targetId === a.targetId && x.status !== 'lost' && (a.kind === 'probe' || a.kind === 'colony' || x.status === 'outbound' || x.status === 'building')))
        return '该目标已有同类任务';
    if (home.finance.balance < template.cost || home.stock.goods < template.goods || home.stock.components < template.components)
        return '当地财政、工业品或高级部件不足';
    const passengers = a.kind === 'colony' ? BALANCE.colonyPassengers : a.kind === 'passenger' ? 5000 : 0;
    if (home.population < passengers + BALANCE.failurePopulation)
        return '没有足够可迁出人口';
    const cargo = stockZero();
    if (a.kind === 'colony' || a.kind === 'freighter') {
        Object.assign(cargo, { food: 400, energy: 400, materials: 500, goods: 300, components: 100 });
        if (Object.entries(cargo).some(([k, v]) => home.stock[k as keyof typeof cargo] < v + (k==='goods'?template.goods:k==='components'?template.components:0)))
            return '装载的实体物资不足';
    }
    home.finance.balance -= template.cost;
    home.stock.goods -= template.goods;
    home.stock.components -= template.components;
    for (const k of Object.keys(cargo) as (keyof typeof cargo)[])
        home.stock[k] -= cargo[k];
    if (passengers) {
        const ratio = (home.population - passengers) / home.population;
        home.cohorts.forEach(c => c.size *= ratio);
        home.population -= passengers;
    }
    const departsAt = roundMonth(s.time + template.buildYears), speed = shipSpeed(home, a.kind), travel = distanceBetween(origin, target) / speed;
    const id = uid(s, 'ship'), orderId = uid(s, 'order');
    const ship: Ship = { id, name: `${template.name} ${s.sequence}`, kind: a.kind, originId: a.originId, targetId: a.targetId, launchedAt: s.time, departsAt, arrivesAt: roundMonth(departsAt + travel), velocityC: speed, properYears: travel * Math.sqrt(1 - speed ** 2), status: 'building', cargo, passengers, reliability: template.reliability, orderId, knowledge: Object.fromEntries(Object.entries(home.tech).map(([key, level]) => [key, Math.floor(level)])) as WorldState["tech"] };
    const order: Order = { id: orderId, sourceId: home.systemId, targetId: target.id, kind: 'charter', value: a.goal, budget: template.cost, priority: 2, deadline: ship.arrivesAt + 20, risk: a.risk, authorization: a.authorization, after: 'maintain', issuedAt: s.time, arrivesAt: ship.arrivesAt, status: 'transmitting', result: '任务已批准，舰船正在建造与装载' };
    s.ships.push(ship);
    s.orders.push(order);
    if (local) {
        queue(s, { arrivesAt: roundMonth(s.time + origin.distance), ship: structuredClone(ship), order: structuredClone(order) });
    }
    else {
        s.knownShips.push(structuredClone(ship));
        s.knownOrders.push(structuredClone(order));
    }
    report(s, origin.id, local ? '地方自主任务已批准' : '国家任务已批准', `${ship.name} 将于 ${departsAt.toFixed(1)} 年出发，预计 ${ship.arrivesAt.toFixed(1)} 年抵达。`, ['当地资源已扣除', `${passengers} 名乘员已登船`, `舰上预计经历 ${ship.properYears.toFixed(1)} 年`], 'good');
    return '';
}
function execute(s: GameState, o: Order) {
    const w = s.worlds[o.targetId], sys = systemOf(s, o.targetId)!;
    const reject = (reason: string) => { o.status = 'rejected'; o.result = reason; acknowledge(s, o); };
    if (s.time > o.deadline)
        return reject('命令抵达时已经超过期限');
    if (!w)
        return reject('目的地尚无可执行任务的地方机构');
    if (w.independent && o.kind !== 'contact')
        return reject('地方不受中央管辖');
    if (o.kind === 'policy' && o.value === 'control' && w.regime !== 'directorate')
        return reject('当前政体不允许军事管制；需要先取得改革条件');
    if (w.stability < 25 && o.priority < 2 && o.authorization === 'strict') {
        o.status = 'deferred';
        o.result = '地方危机中，低优先级任务推迟至下一年';
        o.arrivesAt = roundMonth(s.time + 1);
        acknowledge(s, o);
        return;
    }
    o.status = 'executed';
    o.result = '已依据当前资源与社会条件执行';
    if (o.kind === 'policy') {
        if (!(o.value in POLICIES))
            return reject('未知政策');
        if (w.stability < 35 - w.tech.governance * 2 && o.value === 'industry') {
            if (o.authorization === 'strict')
                return reject('工业动员会加剧当前生存危机');
            w.policy = 'autonomy';
            o.status = 'adjusted';
            o.result = '稳定不足，按适应性授权改为地方自治';
        }
        else
            w.policy = o.value as WorldState['policy'];
    }
    else if (o.kind === 'budget') {
        w.finance.balance += o.budget;
        w.finance.commitments += o.budget;
        w.finance.tax = clamp(Number(o.value), .05, .5);
    }
    else if (o.kind === 'plan') {
        if (!(o.value in ZONES))
            return reject('未知区域功能');
        const d = w.districts.find(x => x.id === o.district);
        if (!d)
            return reject('区域不存在');
        if (w.ecology < 20 && o.value === 'industry' && o.authorization !== 'strict') {
            d.zone = 'reserve';
            o.status = 'adjusted';
            o.result = '生态压力过高，地方改为恢复保护区';
        }
        else {
            d.zone = o.value as Zone;
        }
        d.priority = clamp(o.priority, 1, 3);
        const cells = o.cells?.length ? o.cells : d.cells;
        const changedFraction = [...new Set(cells)].filter(cell=>Number.isInteger(cell)&&cell>=0&&cell<64&&d.parcels[cell]!==d.zone).length / 64;
        d.ruins = Math.max(d.ruins, d.density * 8 * changedFraction);
        d.progress = d.progress * (1-changedFraction) + Math.min(d.progress,25) * changedFraction;
        for (const cell of cells)
            if (Number.isInteger(cell) && cell >= 0 && cell < 64)
                d.parcels[cell] = d.zone;
        const counts = Object.keys(ZONES).map(zone => ({ zone: zone as Zone, count: d.parcels.filter(p => p === zone).length }));
        d.zone = counts.sort((a, b) => b.count - a.count)[0].zone;
        w.finance.balance += o.budget;
    }
    else if (o.kind === 'hub') {
        const d = w.districts.find(x => x.id === o.district);
        if (!d)
            return reject('区域不存在');
        if (w.stock.goods < 20)
            return reject('当地工业品不足，预算不能替代物资');
        w.stock.goods -= 20;
        d.hub = true;
        w.finance.balance += o.budget;
    }
    else if (o.kind === 'project') {
        if (w.stock.components < 50 || w.industry < 20)
            return reject('轨道工程需要当地工业能力 20 和 50 高级部件');
        w.stock.components -= 50;
        w.spaceport = Math.max(w.spaceport, 1);
        w.finance.balance += o.budget;
    }
    else if (o.kind === 'reform') {
        const allowed = o.value === 'federation' ? w.autonomy >= 50 && w.support >= 45 : o.value === 'directorate' ? w.cohorts.filter(c => c.axes[0] < 40).reduce((n, c) => n + c.size, 0) > w.population * .5 && w.support >= 60 : w.support >= 50;
        if (!allowed)
            return reject('改革缺乏社会多数或政府支持；需要长期政策与利益变化');
        if (!['republic', 'federation', 'directorate'].includes(o.value))
            return reject('未知政体');
        w.regime = o.value as WorldState['regime'];
        report(s, w.systemId, '政体改革完成', '既有合同继续；冲突政策接受新制度审查。', ['社会价值形成多数', '政府支持达到门槛'], 'warn', true);
        if (w.regime !== 'directorate' && w.policy === 'control')
            w.policy = 'balanced';
    }
    else if (o.kind === 'contact') {
        if (sys.anomaly !== 'civilization' && sys.anomaly !== 'ruins')
            return reject('该地点尚无可接触的文明或遗迹');
        if (!['observe', 'secret', 'contact', 'exchange', 'compete'].includes(o.value))
            return reject('未知接触政策');
        w.contact = o.value as WorldState['contact'];
        report(s, w.systemId, sys.anomaly === 'ruins' ? '遗迹研究启动' : '首次接触政策开始生效', `地方执行 ${o.value}；后续报告将追踪信任、发展与国内反应。`, ['探测确认人工活动', '地方任务获得接触授权'], 'warn', true);
    }
    else if (o.kind === 'charter') {
        w.charter = o.value === 'allow';
        w.finance.commitments += o.budget;
        w.finance.balance += o.budget;
        o.result = w.charter ? '地方将在具备能源、工业、知识、人口和轨道设施后组织探测与拓荒' : '地方停止批准新的拓荒任务；既有任务继续';
    }
    else if (o.kind === 'evacuate') {
        const vessel = s.ships.find(x => x.targetId === w.systemId && x.status === 'arrived' && x.kind !== 'probe');
        if (!vessel || w.stock.energy < 50)
            return reject('疏散需要已抵达当地的载人舰船和 50 能源');
        w.stock.energy -= 50;
        const passengers = Math.min(5000, w.population);
        const ratio = (w.population - passengers) / Math.max(1, w.population);
        w.cohorts.forEach(c => c.size *= ratio);
        w.population -= passengers;
        vessel.originId = w.systemId;
        vessel.targetId = 'sol';
        vessel.kind = 'passenger';
        vessel.passengers = passengers;
        vessel.cargo = stockZero();
        vessel.launchedAt = s.time;
        vessel.departsAt = roundMonth(s.time + 1);
        vessel.arrivesAt = roundMonth(vessel.departsAt + sys.distance / vessel.velocityC);
        vessel.properYears = (vessel.arrivesAt - vessel.departsAt) * Math.sqrt(1 - vessel.velocityC ** 2);
        vessel.status = 'building';
        vessel.orderId = o.id;
        queue(s, { arrivesAt: roundMonth(s.time + sys.distance), ship: structuredClone(vessel) });
        o.result = '已组织 5,000 人容量的返航疏散，人数受当地幸存人口限制';
    }
    else if (o.kind === 'relief')
        return reject('救援需要实体舰船，请从运输面板发起');
    acknowledge(s, o);
    snapshot(s, w.systemId);
}
function arrive(s: GameState, ship: Ship) {
    const sys = systemOf(s, ship.targetId)!, o = s.orders.find(x => x.id === ship.orderId)!;
    const failed = random(s) > ship.reliability;
    ship.status = failed ? 'lost' : 'arrived';
    if (failed) {
        o.status = 'rejected';
        o.result = '航行可靠性事件导致任务损失';
        report(s, sys.id, '舰船任务损失', ship.name, [`可靠性 ${(ship.reliability * 100).toFixed(1)}%`, '长程推进与维护风险'], 'critical', ship.kind === 'colony');
    }
    else if (ship.kind === 'probe') {
        if (sys.anomaly && !s.worlds[sys.id]) {
            const station = createWorld(sys, s.time, s.seed);
            station.independent = true;
            station.name = sys.anomaly === 'civilization' ? `${sys.name}原生文明` : `${sys.name}考察站`;
            s.worlds[sys.id] = station;
        }
        snapshot(s, sys.id);
        o.status = 'executed';
        o.result = '完整勘测已完成';
        report(s, sys.id, sys.anomaly === 'civilization' ? '发现原生智慧文明' : sys.anomaly === 'ruins' ? '发现文明遗迹' : '近距勘测完成', `${sys.name} 宜居度 ${(sys.habitability * 100).toFixed(0)}%，资源 ${(sys.resources * 100).toFixed(0)}%。`, ['轨道扫描与实地遥测', '结果经光速通信返回'], sys.anomaly ? 'warn' : 'good', Boolean(sys.anomaly));
    }
    else if (ship.kind === 'colony') {
        if (s.worlds[sys.id]) {
            o.status = 'rejected';
            o.result = '目的地已有聚居地；物资和乘员并入当地';
            const w = s.worlds[sys.id];
            w.cohorts[0].size += ship.passengers;
            w.population += ship.passengers;
            for (const key of Object.keys(ship.cargo) as (keyof Ship['cargo'])[]) w.stock[key]+=ship.cargo[key];
        }
        else {
            const requested = o.value as Zone;
            const chosen = sys.habitability > .65 ? 'housing' : sys.resources > .7 ? 'industry' : 'farm';
            const goal = o.authorization === 'strict' ? requested : chosen;
            const w = createWorld(sys, s.time, s.seed, false, goal);
            const safety = sys.risk > o.risk && o.authorization === 'strict' ? .7 : 1;
            w.cohorts.forEach(c => c.size = ship.passengers / 12 * safety);
            w.population = ship.passengers * safety;
            w.stock = structuredClone(ship.cargo);
            w.knowledge = structuredClone(ship.knowledge);
            w.cohorts.forEach(c => { c.elderly = clamp(.16 + ship.properYears * .0003, 0, .4); c.young = clamp(.24 - ship.properYears * .0001, .12, .24); });
            s.worlds[sys.id] = w;
            o.status = goal === requested ? 'executed' : 'adjusted';
            o.result = `地方选择${ZONES[goal].name}落点；抵达时资源与环境决定发展路线`;
            snapshot(s, sys.id);
            report(s, sys.id, '系外前哨建立', o.result, [`宜居度 ${(sys.habitability * 100).toFixed(0)}%`, `风险 ${(sys.risk * 100).toFixed(0)}%`, `授权 ${o.authorization}`], 'good', !s.milestones.includes('first-colony'));
            s.milestones.push(`founded-${sys.id}`);
        }
    }
    else {
        const w = s.worlds[sys.id];
        if (w) {
            for (const k of Object.keys(ship.cargo) as (keyof Ship['cargo'])[])
                w.stock[k] += ship.cargo[k];
            w.cohorts[0].size += ship.passengers;
            w.population += ship.passengers;
            o.status = 'executed';
            o.result = '物资和乘员已经到达当地，按民生优先分配';
            snapshot(s, sys.id);
        }
        else {
            o.status = 'rejected';
            o.result = '目的地无接收设施，船员保持轨道待援';
        }
        report(s, sys.id, '运输任务报告', o.result, ['物资实际装载于舰船', '运输受亚光速航程限制'], 'good');
    }
    queue(s, { arrivesAt: roundMonth(s.time + sys.distance), ship: structuredClone(ship) });
    acknowledge(s, o, sys.id);
}
function receive(s: GameState) {
    const ready = s.signals.filter(x => x.arrivesAt <= s.time + 1e-8).sort((a, b) => a.arrivesAt - b.arrivesAt || Number(a.id.split('-')[1]) - Number(b.id.split('-')[1]));
    s.signals = s.signals.filter(x => x.arrivesAt > s.time + 1e-8);
    for (const signal of ready) {
        if (signal.intel) {
            const old = s.intel[signal.intel.systemId];
            if (!old || old.observedAt <= signal.intel.observedAt)
                s.intel[signal.intel.systemId] = signal.intel;
        }
        if (signal.message) {
            s.messages.push(signal.message);
            if (signal.message.pause)
                s.pauseRequested = true;
            if (signal.message.title === '系外前哨建立' && !s.milestones.includes('first-colony'))
                s.milestones.push('first-colony');
        }
        if (signal.order) {
            if (signal.order.kind === 'contact' && signal.order.status === 'executed')
                for (const c of s.worlds.sol.cohorts)
                    c.support = clamp(c.support + (signal.order.value === 'compete' ? (c.axes[2] > 65 ? 2 : -5) : signal.order.value === 'exchange' ? (c.education > 60 ? 3 : -1) : 1));
            const i = s.knownOrders.findIndex(x => x.id === signal.order!.id);
            if (i >= 0)
                s.knownOrders[i] = signal.order;
            else
                s.knownOrders.push(signal.order);
        }
        if (signal.ship) {
            const i = s.knownShips.findIndex(x => x.id === signal.ship!.id);
            if (i >= 0)
                s.knownShips[i] = signal.ship;
            else
                s.knownShips.push(signal.ship);
        }
        if (signal.knowledge) {
            const w = s.worlds[signal.knowledge.targetId];
            if (w)
                for (const k of Object.keys(RESEARCH) as ResearchFocus[])
                    w.knowledge[k] = Math.max(w.knowledge[k], signal.knowledge.tech[k]);
        }
    }
    s.intel.sol = { systemId: 'sol', level: 'colonized', observedAt: s.time, receivedAt: s.time, uncertainty: 0, survey: s.systems[0], worldSnapshot: structuredClone(s.worlds.sol) };
}
function autonomousExpansion(s: GameState) {
    for (const w of Object.values(s.worlds)) {
        if (!w.charter || w.independent || w.spaceport < 100 || w.tech.propulsion < 1 || w.population < 50000 || w.industry < 30)
            continue;
        const origin = systemOf(s, w.systemId)!;
        const target = s.systems.filter(x => x.id !== w.systemId && !s.worlds[x.id])
            .sort((a, b) => distanceBetween(origin, a) - distanceBetween(origin, b))
            .find(x => !s.ships.some(ship => ship.targetId === x.id && ship.kind === 'colony' && ship.status !== 'lost'));
        if (!target)
            continue;
        const surveyed = s.ships.some(ship => ship.originId === w.systemId && ship.targetId === target.id && ship.kind === 'probe' && ship.status === 'arrived');
        launch(s, { type: 'launch', originId: w.systemId, targetId: target.id, kind: surveyed ? 'colony' : 'probe', authorization: 'broad', risk: .5, goal: 'housing' }, true);
    }
}
export function applyAction(state: GameState, action: Action, record = true): {
    state: GameState;
    error: string;
} {
    const s = structuredClone(state);
    if (s.failed)
        return { state, error: '帝国人口已低于延续阈值，请读取存档或开始新纪元' };
    let error = '';
    if (action.type === 'launch')
        error = launch(s, action);
    else if (action.type === 'catalog') {
        const count = Math.min(BALANCE.systems, s.systems.length + 10);
        if (count === s.systems.length)
            error = '标准星图已全部完成天文编目';
        else if (s.worlds.sol.finance.balance < 2000)
            error = '需要 2,000 Cr 天文观测预算';
        else {
            s.worlds.sol.finance.balance -= 2000;
            for (let i = s.systems.length; i < count; i++) {
                const sys = generateSystem(s.seed, i);
                s.systems.push(sys);
                s.intel[sys.id] = { systemId: sys.id, level: 'observed', observedAt: s.time - sys.distance, receivedAt: s.time, uncertainty: .5 };
            }
        }
    }
    else if (action.type === 'research') {
        if (!(action.focus in RESEARCH) || ![.5, 1, 1.5, 2].includes(action.budget))
            error = '无效科研计划';
        else {
            s.worlds.sol.focus = action.focus;
            s.worlds.sol.finance.budget = action.budget;
        }
    }
    else if (action.type === 'route') {
        if (!s.intel[action.targetId]?.worldSnapshot || action.targetId === 'sol')
            error = '需要已确认的远方接收地';
        else
            s.routes = action.enabled ? [...new Set([...s.routes, action.targetId])] : s.routes.filter(x => x !== action.targetId);
    }
    else {
        const d = action.directive, sys = systemOf(s, d.targetId);
        const home = s.worlds.sol;
        if (!sys || !s.intel[d.targetId]?.worldSnapshot)
            error = '需要已经收到的地方情报';
        else if (!Number.isFinite(d.budget) || d.budget < 0 || d.budget > home.finance.balance || !Number.isFinite(d.deadline) || !Number.isFinite(d.risk) || d.risk < 0 || d.risk > 1 || ![1,2,3].includes(d.priority) || (d.kind==='budget' && (!Number.isFinite(Number(d.value)) || Number(d.value)<.05 || Number(d.value)>.5)))
            error = '预算或命令参数无效';
        else {
            home.finance.balance -= d.budget;
            const o: Order = { ...d, id: uid(s, 'order'), sourceId: 'sol', issuedAt: s.time, arrivesAt: roundMonth(s.time + sys.distance), status: 'transmitting', result: '等待地方执行报告' };
            s.orders.push(o);
            s.knownOrders.push(structuredClone(o));
            if (sys.id === 'sol')
                execute(s, o);
        }
    }
    if (error)
        return { state, error };
    if (record)
        s.actions.push({ tick: s.tick, action: structuredClone(action) });
    receive(s);
    return { state: s, error: '' };
}
/** Fixed calendar months make simulation invariant to UI frame rate and speed. */
export function advanceMonths(state: GameState, months: number, stopOnPause = false): GameState {
    const s = structuredClone(state);
    s.pauseRequested = false;
    for (let i = 0; i < Math.floor(months) && !s.failed; i++) {
        s.tick++;
        s.time = START_TIME + s.tick / 12;
        for (const w of Object.values(s.worlds)) {
            const sys = systemOf(s, w.systemId)!;
            const previous = { ...w.knowledge };
            for (const event of settleWorld(w, sys, s.time))
                report(s, w.systemId, event.title, event.cause.join('；'), event.cause, event.critical ? 'critical' : 'good', Boolean(event.critical));
            if (!w.independent && Object.keys(RESEARCH).some(k => previous[k as ResearchFocus] !== w.knowledge[k as ResearchFocus])) {
                if (w.systemId === 'sol')
                    for (const target of Object.values(s.worlds).filter(x => x.systemId !== 'sol' && !x.independent))
                        queue(s, { arrivesAt: roundMonth(s.time + systemOf(s, target.systemId)!.distance), knowledge: { targetId: target.systemId, tech: { ...w.knowledge } } });
                else
                    queue(s, { arrivesAt: roundMonth(s.time + sys.distance), knowledge: { targetId: 'sol', tech: { ...w.knowledge } } });
            }
            if (s.tick % (BALANCE.reportYears * 12) === 0 && w.systemId !== 'sol') {
                snapshot(s, w.systemId);
                report(s, w.systemId, '地方五年报告', `人口 ${Math.round(w.population).toLocaleString('en-US')}；支持 ${w.support.toFixed(0)}%；生态 ${w.ecology.toFixed(0)}%。`, w.causes);
            }
        }
        for (const ship of s.ships) {
            if (ship.status === 'building' && ship.departsAt <= s.time) {
                ship.status = 'outbound';
                const known = s.knownShips.find(x => x.id === ship.id);
                if (known && ship.originId === 'sol')
                    known.status = 'outbound';
            }
            if (ship.status === 'outbound' && ship.arrivesAt <= s.time + 1e-8)
                arrive(s, ship);
        }
        for (const o of [...s.orders].sort((a, b) => a.arrivesAt - b.arrivesAt || Number(a.id.split('-')[1]) - Number(b.id.split('-')[1])))
            if ((o.status === 'transmitting' || o.status === 'deferred') && o.arrivesAt <= s.time + 1e-8 && !s.ships.some(x => x.orderId === o.id))
                execute(s, o);
        if (s.tick % (BALANCE.routeReviewYears * 12) === 0) {
            autonomousExpansion(s);
            for (const targetId of s.routes) {
                const w = s.intel[targetId]?.worldSnapshot;
                if (w && w.stock.food < Math.max(500, w.population * BALANCE.stockPerPerson * 2))
                    launch(s, { type: 'launch', originId: 'sol', targetId, kind: 'freighter', authorization: 'adaptive', risk: .5, goal: 'farm' });
            }
        }
        if (s.tick % (BALANCE.disasterReviewYears * 12) === 0)
            for (const w of Object.values(s.worlds).filter(w => !w.independent)) {
                const sys = systemOf(s, w.systemId)!;
                const defense = w.districts.filter(d => d.zone === 'defense').reduce((n, d) => n + d.progress / 100, 0);
                const chance = clamp(sys.risk * (1 - w.ecology / 150) / (1 + defense * .3), 0, 1);
                if (random(s) < chance) {
                    const district = w.districts[Math.floor(random(s) * w.districts.length)];
                    const severity = 10 + sys.risk * 30;
                    district.damage = clamp(district.damage + severity);
                    district.ruins = Math.max(district.ruins, district.damage);
                    w.stock.goods *= .9;
                    w.ecology = clamp(w.ecology - 2);
                    report(s, w.systemId, '区域环境灾害', `区域 ${district.id + 1} 的基础设施受损，地方开始自动修复。`, [`本轮环境事件概率 ${(chance * 100).toFixed(1)}%`, `环境风险 ${sys.risk.toFixed(2)}，防御设施 ${defense.toFixed(1)}`, `损坏增加 ${severity.toFixed(0)}%，工业品损失 10%`], 'warn');
                }
            }
        if (s.tick % 1200 === 0)
            report(s, 'sol', '百年时代总结', `国家已知世界 ${Object.values(s.intel).filter(x => x.level === 'colonized').length}；已收到历史记录 ${s.messages.length} 条。`, s.worlds.sol.causes, 'good');
        const population = Object.values(s.worlds).filter(x => !x.independent).reduce((n, w) => n + w.population, 0) + s.ships.filter(x => x.status === 'outbound' || x.status === 'building').reduce((n, x) => n + x.passengers, 0);
        if(population<BALANCE.failurePopulation*10&&!s.milestones.includes('population-warning')) {
            s.milestones.push('population-warning');
            report(s,'sol','人口接近延续阈值','请优先保障幸存人口的供给，评估救援或疏散。',[`延续阈值 ${BALANCE.failurePopulation} 人`,'世界与在途乘员总量下降'],'critical',true);
        }
        if (population < BALANCE.failurePopulation) {
            s.failed = true;
            report(s, 'sol', '帝国无法延续', '总人口低于延续阈值。', ['所有本国世界与航行乘员合计不足 1,000 人'], 'critical', true);
        }
        receive(s);
        if (stopOnPause && s.pauseRequested)
            break;
    }
    return s;
}
export function replay(seed: number, actions: GameState['actions'], tick: number) { let s = createGame(seed); for (const item of actions) {
    if (item.tick > tick)
        break;
    s = advanceMonths(s, item.tick - s.tick);
    const result = applyAction(s, item.action);
    if (result.error)
        throw new Error(`回放失败：${result.error}`);
    s = result.state;
} return advanceMonths(s, tick - s.tick); }
