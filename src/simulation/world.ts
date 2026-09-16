import { HOME, systemForPlanet, planetById, travelDistance } from './locations';
import { PLAN_LIMIT, surfaceCost, validateSurface } from './surface';
import { BALANCE, CONTENT_VERSION, POLICIES, RESEARCH, SHIPS, START_TIME, ZONES, stockZero } from '../content/catalog';
import { settleWorld, clamp } from './economy';
import { createWorld, generateSystem } from './generation';
import type { Action, Directive, GameState, IntelRecord, Message, Order, ResearchFocus, Ship, ShipKind, Signal, StarSystem, WorldState, Zone } from './types';
const roundMonth = (year: number) => START_TIME + Math.ceil((year - START_TIME) * 12 - 1e-8) / 12;
const uid = (s: GameState, prefix: string) => `${prefix}-${++s.sequence}`;
const systemOf = (s: GameState, id: string) => s.systems.find(x => x.id === id) ?? systemForPlanet(s.systems,id);
export function createGame(seed = BALANCE.seed): GameState {
    const systems = Array.from({ length: BALANCE.initialObserved }, (_, i) => generateSystem(seed, i));
    const home = createWorld(systems[0], START_TIME, seed, true);
    const intel: Record<string, IntelRecord> = {};
    for (const sys of systems) for (const planet of sys.bodies)
        intel[planet.id] = { systemId: sys.id, planetId: planet.id, level: planet.id===HOME ? 'colonized' : sys.id==='sol' ? 'surveyed' : 'observed', observedAt: START_TIME-sys.distance, receivedAt: START_TIME, uncertainty: sys.id==='sol'?0:.45, ...(sys.id==='sol'?{survey:sys}:{}), ...(planet.id===HOME?{worldSnapshot:structuredClone(home)}:{}) };
    const s: GameState = { version: 3, contentVersion: CONTENT_VERSION, seed, tick: 0, time: START_TIME, sequence: 0, rngState: seed >>> 0, systems, worlds: { [HOME]: home }, intel, ships: [], knownShips: [], orders: [], knownOrders: [], signals: [], messages: [], milestones: [], actions: [], routes: [], failed: false, pauseRequested: false };
    report(s, 'sol', '群星纪元开始', '选择邻星发送探测器；在等待期间建设母星、调整科研和政策。', ['无人探测起步速度 0.01c', '20 个初始观测目标', '国家无须新命令也会持续发展'], 'info');
    receive(s);
    return s;
}
function random(s: GameState) { s.rngState = (Math.imul(s.rngState, 1664525) + 1013904223) >>> 0; return s.rngState / 4294967296; }
function queue(s: GameState, signal: Omit<Signal, 'id'>) { s.signals.push({ id: uid(s, 'signal'), ...signal }); }
function report(s: GameState, id: string, title: string, body: string, cause: string[], tone: Message['tone'] = 'info', pause = false) {
    const distance = systemOf(s, id)?.distance ?? 0;
    const planet=planetById(s.systems,id);
    const message: Message = { id: uid(s, 'message'), systemId: systemOf(s,id)!.id, occurredAt: s.time, receivedAt: roundMonth(s.time + distance), title, body: planet ? `${planet.name}：${body}` : body, cause, tone, pause, action: `可调整政策、授权或运输；从中央发出的新命令约 ${distance.toFixed(1)} 年后抵达。` };
    queue(s, { arrivesAt: message.receivedAt, message });
}
function snapshot(s: GameState, id: string) { const sys = systemOf(s, id)!; const w = s.worlds[id]; queue(s, { arrivesAt: roundMonth(s.time + sys.distance), intel: { systemId: sys.id, planetId: id, level: w && !w.independent ? 'colonized' : 'surveyed', observedAt: s.time, receivedAt: roundMonth(s.time + sys.distance), uncertainty: Math.max(.03, .16 - (w?.tech.sensors ?? 0) * .015), survey: sys, ...(w ? { worldSnapshot: structuredClone(w) } : {}) } }); }
function acknowledge(s: GameState, order: Order, locationId = order.targetId) { const sys = systemOf(s, locationId)!; queue(s, { arrivesAt: roundMonth(s.time + sys.distance), order: structuredClone(order) }); report(s, locationId, order.status === 'rejected' ? '地方拒绝命令' : order.status === 'adjusted' ? '地方调整命令' : '命令执行报告', order.result, [`授权：${order.authorization}`, `预算 ${order.budget} Cr`, `期限 ${order.deadline.toFixed(1)} 年`], order.status === 'rejected' ? 'warn' : 'good'); }
export function shipSpeed(w: WorldState, kind: ShipKind) { const t = SHIPS[kind]; return Math.min(t.maximum, t.speed + Math.floor(w.tech.propulsion) * t.increment); }
function distanceBetween(a: StarSystem, b: StarSystem) { return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); }
function launch(s: GameState, a: Extract<Action, {
    type: 'launch';
}>, local = false): string {
    const home = s.worlds[a.originId], target = systemOf(s, a.targetId), origin = systemOf(s, a.originId);
    const template = SHIPS[a.kind];
    if (!home || !target || !origin || !planetById(s.systems,a.targetId) || a.targetId === a.originId)
        return '无效的出发地或目标';
    if (!local && origin.id !== 'sol')
        return '远方发射由地方拓荒授权执行';
    if (['freighter','passenger'].includes(a.kind) && !s.intel[a.targetId]?.worldSnapshot) return '目标行星尚无已确认的接收机构';
    if (home.spaceport < 100 || home.independent)
        return '出发地缺少成熟轨道工业';
    if (s.ships.filter(x => x.status === 'building' || x.status === 'outbound').length >= BALANCE.maxShips)
        return '已达到 100 艘活动舰船容量';
    if (a.kind === 'colony' && planetById(s.systems,a.targetId)?.kind === '气态') return '气态行星尚不支持地表殖民';
    if (a.kind === 'colony' && (!local ? s.intel[a.targetId]?.level !== 'surveyed' : !s.ships.some(x => x.originId === a.originId && x.targetId === a.targetId && x.kind === 'probe' && x.status === 'arrived')))
        return '需要已经抵达的完整勘测报告';
    if (a.kind === 'colony' && planetById(s.systems,a.targetId)!.primary && s.intel[a.targetId]?.survey?.anomaly === 'civilization')
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
    const departsAt = roundMonth(s.time + template.buildYears), speed = shipSpeed(home, a.kind), travel = travelDistance(s.systems,a.originId,a.targetId) / speed;
    const id = uid(s, 'ship'), orderId = uid(s, 'order');
    const ship: Ship = { id, name: `${template.name} ${s.sequence}`, kind: a.kind, originId: a.originId, targetId: a.targetId, launchedAt: s.time, departsAt, arrivesAt: roundMonth(departsAt + travel), velocityC: speed, properYears: travel * Math.sqrt(1 - speed ** 2), status: 'building', cargo, passengers, reliability: template.reliability, orderId, knowledge: Object.fromEntries(Object.entries(home.tech).map(([key, level]) => [key, Math.floor(level)])) as WorldState["tech"] };
    const order: Order = { id: orderId, sourceId: home.planetId, targetId: a.targetId, kind: 'charter', value: a.goal, budget: template.cost, priority: 2, deadline: ship.arrivesAt + 20, risk: a.risk, authorization: a.authorization, after: 'maintain', issuedAt: s.time, arrivesAt: ship.arrivesAt, status: 'transmitting', result: '任务已批准，舰船正在建造与装载' };
    s.ships.push(ship);
    s.orders.push(order);
    if (local) {
        queue(s, { arrivesAt: roundMonth(s.time + origin.distance), ship: structuredClone(ship), order: structuredClone(order) });
    }
    else {
        s.knownShips.push(structuredClone(ship));
        s.knownOrders.push(structuredClone(order));
    }
    report(s, a.originId, local ? '地方自主任务已批准' : '国家任务已批准', `${ship.name} 将于 ${departsAt.toFixed(1)} 年出发，预计 ${ship.arrivesAt.toFixed(1)} 年抵达。`, ['当地资源已扣除', `${passengers} 名乘员已登船`, `舰上预计经历 ${ship.properYears.toFixed(1)} 年`], 'good');
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
    else if (o.kind === 'surface') {
        const invalid = validateSurface(o.surface, w.planetId);
        if (invalid) return reject(invalid);
        if (w.surface.length + o.surface!.length > PLAN_LIMIT) return reject('该世界的开发项目已达到容量');
        for (const draft of o.surface!) w.surface.push({ ...structuredClone(draft), id: uid(s, 'surface'), progress: 0, cost: surfaceCost(draft, w.planetId, w.radiusKm), spent: 0, status: '规划已批准，等待施工' });
        o.result = '地表规划已接收；道路先施工，分区在道路接通后发展';
    }    else if (o.kind === 'hub') {
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
        report(s, w.planetId, '政体改革完成', '既有合同继续；冲突政策接受新制度审查。', ['社会价值形成多数', '政府支持达到门槛'], 'warn', true);
        if (w.regime !== 'directorate' && w.policy === 'control')
            w.policy = 'balanced';
    }
    else if (o.kind === 'contact') {
        if (!planetById(s.systems,w.planetId)!.primary || (sys.anomaly !== 'civilization' && sys.anomaly !== 'ruins'))
            return reject('该地点尚无可接触的文明或遗迹');
        if (!['observe', 'secret', 'contact', 'exchange', 'compete'].includes(o.value))
            return reject('未知接触政策');
        w.contact = o.value as WorldState['contact'];
        report(s, w.planetId, sys.anomaly === 'ruins' ? '遗迹研究启动' : '首次接触政策开始生效', `地方执行 ${o.value}；后续报告将追踪信任、发展与国内反应。`, ['探测确认人工活动', '地方任务获得接触授权'], 'warn', true);
    }
    else if (o.kind === 'charter') {
        w.charter = o.value === 'allow';
        w.finance.commitments += o.budget;
        w.finance.balance += o.budget;
        o.result = w.charter ? '地方将在具备能源、工业、知识、人口和轨道设施后组织探测与拓荒' : '地方停止批准新的拓荒任务；既有任务继续';
    }
    else if (o.kind === 'evacuate') {
        const vessel = s.ships.find(x => x.targetId === w.planetId && x.status === 'arrived' && x.kind !== 'probe');
        if (!vessel || w.stock.energy < 50)
            return reject('疏散需要已抵达当地的载人舰船和 50 能源');
        w.stock.energy -= 50;
        const passengers = Math.min(5000, w.population);
        const ratio = (w.population - passengers) / Math.max(1, w.population);
        w.cohorts.forEach(c => c.size *= ratio);
        w.population -= passengers;
        vessel.originId = w.planetId;
        vessel.targetId = HOME;
        vessel.kind = 'passenger';
        vessel.passengers = passengers;
        vessel.cargo = stockZero();
        vessel.launchedAt = s.time;
        vessel.departsAt = roundMonth(s.time + 1);
        vessel.arrivesAt = roundMonth(vessel.departsAt + travelDistance(s.systems,w.planetId,HOME) / vessel.velocityC);
        vessel.properYears = (vessel.arrivesAt - vessel.departsAt) * Math.sqrt(1 - vessel.velocityC ** 2);
        vessel.status = 'building';
        vessel.orderId = o.id;
        queue(s, { arrivesAt: roundMonth(s.time + sys.distance), ship: structuredClone(vessel) });
        o.result = '已组织 5,000 人容量的返航疏散，人数受当地幸存人口限制';
    }
    else if (o.kind === 'relief')
        return reject('救援需要实体舰船，请从运输面板发起');
    acknowledge(s, o);
    snapshot(s, w.planetId);
}
function arrive(s: GameState, ship: Ship) {
    const sys = systemOf(s, ship.targetId)!, o = s.orders.find(x => x.id === ship.orderId)!;
    const failed = random(s) > ship.reliability;
    ship.status = failed ? 'lost' : 'arrived';
    if (failed) {
        o.status = 'rejected';
        o.result = '航行可靠性事件导致任务损失';
        report(s, ship.targetId, '舰船任务损失', ship.name, [`可靠性 ${(ship.reliability * 100).toFixed(1)}%`, '长程推进与维护风险'], 'critical', ship.kind === 'colony');
    }
    else if (ship.kind === 'probe') {
        if (sys.anomaly && planetById(s.systems,ship.targetId)!.primary && !s.worlds[ship.targetId]) {
            const station = createWorld(sys, s.time, s.seed, false, 'housing', ship.targetId);
            station.independent = true;
            station.name = sys.anomaly === 'civilization' ? `${sys.name}原生文明` : `${sys.name}考察站`;
            s.worlds[ship.targetId] = station;
        }
        snapshot(s, ship.targetId);
        o.status = 'executed';
        o.result = '完整勘测已完成';
        report(s, ship.targetId, sys.anomaly === 'civilization' ? '发现原生智慧文明' : sys.anomaly === 'ruins' ? '发现文明遗迹' : '近距勘测完成', `${sys.name} 宜居度 ${(sys.habitability * 100).toFixed(0)}%，资源 ${(sys.resources * 100).toFixed(0)}%。`, ['轨道扫描与实地遥测', '结果经光速通信返回'], sys.anomaly ? 'warn' : 'good', Boolean(sys.anomaly));
    }
    else if (ship.kind === 'colony') {
        if (s.worlds[ship.targetId]) {
            o.status = 'rejected';
            o.result = '目的地已有聚居地；物资和乘员并入当地';
            const w = s.worlds[ship.targetId];
            w.cohorts[0].size += ship.passengers;
            w.population += ship.passengers;
            for (const key of Object.keys(ship.cargo) as (keyof Ship['cargo'])[]) w.stock[key]+=ship.cargo[key];
            snapshot(s,ship.targetId);
        }
        else {
            const requested = o.value as Zone;
            const body=planetById(s.systems,ship.targetId)!;
            const chosen = body.habitability! > .65 ? 'housing' : body.resources! > .7 ? 'industry' : 'farm';
            const goal = o.authorization === 'strict' ? requested : chosen;
            const w = createWorld(sys, s.time, s.seed, false, goal, ship.targetId);
            const safety = sys.risk > o.risk && o.authorization === 'strict' ? .7 : 1;
            w.cohorts.forEach(c => c.size = ship.passengers / 12 * safety);
            w.population = ship.passengers * safety;
            w.stock = structuredClone(ship.cargo);
            w.knowledge = structuredClone(ship.knowledge);
            w.cohorts.forEach(c => { c.elderly = clamp(.16 + ship.properYears * .0003, 0, .4); c.young = clamp(.24 - ship.properYears * .0001, .12, .24); });
            s.worlds[ship.targetId] = w;
            o.status = goal === requested ? 'executed' : 'adjusted';
            o.result = `地方选择${ZONES[goal].name}落点；抵达时资源与环境决定发展路线`;
            snapshot(s, ship.targetId);
            report(s, ship.targetId, '行星前哨建立', o.result, [`宜居度 ${(body.habitability! * 100).toFixed(0)}%`, `风险 ${(sys.risk * 100).toFixed(0)}%`, `授权 ${o.authorization}`], 'good', !s.milestones.includes('first-colony'));
            s.milestones.push(`founded-${ship.targetId}`);
        }
    }
    else {
        const w = s.worlds[ship.targetId];
        if (w) {
            for (const k of Object.keys(ship.cargo) as (keyof Ship['cargo'])[])
                w.stock[k] += ship.cargo[k];
            w.cohorts[0].size += ship.passengers;
            w.population += ship.passengers;
            o.status = 'executed';
            o.result = '物资和乘员已经到达当地，按民生优先分配';
            snapshot(s, ship.targetId);
        }
        else {
            o.status = 'rejected';
            o.result = '目的地无接收设施，船员保持轨道待援';
        }
        report(s, ship.targetId, '运输任务报告', o.result, ['物资实际装载于舰船', '运输受亚光速航程限制'], 'good');
    }
    queue(s, { arrivesAt: roundMonth(s.time + sys.distance), ship: structuredClone(ship) });
    acknowledge(s, o, sys.id);
}
function receive(s: GameState) {
    const ready = s.signals.filter(x => x.arrivesAt <= s.time + 1e-8).sort((a, b) => a.arrivesAt - b.arrivesAt || Number(a.id.split('-')[1]) - Number(b.id.split('-')[1]));
    s.signals = s.signals.filter(x => x.arrivesAt > s.time + 1e-8);
    for (const signal of ready) {
        if (signal.intel) {
            const old = s.intel[signal.intel.planetId];
            if (!old || old.observedAt <= signal.intel.observedAt)
                s.intel[signal.intel.planetId] = signal.intel;
        }
        if (signal.message) {
            s.messages.push(signal.message);
            if (signal.message.pause)
                s.pauseRequested = true;
            if (signal.message.title === '行星前哨建立' && !s.milestones.includes('first-colony'))
                s.milestones.push('first-colony');
        }
        if (signal.order) {
            if (signal.order.kind === 'contact' && signal.order.status === 'executed')
                for (const c of s.worlds[HOME].cohorts)
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
    for (const w of Object.values(s.worlds).filter(w=>w.systemId==='sol'))
        s.intel[w.planetId] = { systemId:'sol', planetId:w.planetId, level:w.independent?'surveyed':'colonized', observedAt:s.time, receivedAt:s.time, uncertainty:0, survey:s.systems[0], worldSnapshot:structuredClone(w) };

}
function autonomousExpansion(s: GameState) {
    for (const w of Object.values(s.worlds)) {
        if (!w.charter || w.independent || w.spaceport < 100 || w.tech.propulsion < 1 || w.population < 50000 || w.industry < 30)
            continue;
        const origin = systemOf(s, w.systemId)!;
        const target = s.systems.filter(x => x.id !== w.systemId && !s.worlds[x.bodies.find(b=>b.primary)!.id])
            .sort((a, b) => distanceBetween(origin, a) - distanceBetween(origin, b))
            .find(x => !s.ships.some(ship => ship.targetId === x.bodies.find(b=>b.primary)!.id && ship.kind === 'colony' && ship.status !== 'lost'));
        if (!target)
            continue;
        const surveyed = s.ships.some(ship => ship.originId === w.planetId && ship.targetId === target.bodies.find(b=>b.primary)!.id && ship.kind === 'probe' && ship.status === 'arrived');
        launch(s, { type: 'launch', originId: w.planetId, targetId: target.bodies.find(b=>b.primary)!.id, kind: surveyed ? 'colony' : 'probe', authorization: 'broad', risk: .5, goal: 'housing' }, true);
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
        else if (s.worlds[HOME].finance.balance < 2000)
            error = '需要 2,000 Cr 天文观测预算';
        else {
            s.worlds[HOME].finance.balance -= 2000;
            for (let i = s.systems.length; i < count; i++) {
                const sys = generateSystem(s.seed, i);
                s.systems.push(sys);
                for (const body of sys.bodies) s.intel[body.id] = { systemId: sys.id, planetId: body.id, level: 'observed', observedAt: s.time - sys.distance, receivedAt: s.time, uncertainty: .5 };
            }
        }
    }
    else if (action.type === 'research') {
        if (!(action.focus in RESEARCH) || ![.5, 1, 1.5, 2].includes(action.budget))
            error = '无效科研计划';
        else {
            s.worlds[HOME].focus = action.focus;
            s.worlds[HOME].finance.budget = action.budget;
        }
    }
    else if (action.type === 'route') {
        if (!s.intel[action.targetId]?.worldSnapshot || action.targetId === HOME)
            error = '需要已确认的远方接收地';
        else
            s.routes = action.enabled ? [...new Set([...s.routes, action.targetId])] : s.routes.filter(x => x !== action.targetId);
    }
    else {
        const d = action.directive, sys = systemOf(s, d.targetId);
        const home = s.worlds[HOME];
        if (!sys || !s.intel[d.targetId]?.worldSnapshot)
            error = '需要已经收到的地方情报';
        else if (d.kind === 'surface' && (validateSurface(d.surface, d.targetId) || d.budget !== d.surface!.reduce((n, p) => n + surfaceCost(p, d.targetId, s.intel[d.targetId].worldSnapshot!.radiusKm), 0)))
            error = validateSurface(d.surface, d.targetId) || '地表规划预算不匹配';
        else if (d.kind === 'surface' && s.intel[d.targetId].worldSnapshot!.surface.length + d.surface!.length > PLAN_LIMIT)
            error = '该世界的开发项目已达到容量';
        else if (!Number.isFinite(d.budget) || d.budget < 0 || d.budget > home.finance.balance || !Number.isFinite(d.deadline) || !Number.isFinite(d.risk) || d.risk < 0 || d.risk > 1 || ![1,2,3].includes(d.priority) || (d.kind==='budget' && (!Number.isFinite(Number(d.value)) || Number(d.value)<.05 || Number(d.value)>.5)))
            error = '预算或命令参数无效';
        else {
            home.finance.balance -= d.budget;
            const o: Order = { ...d, id: uid(s, 'order'), sourceId: HOME, issuedAt: s.time, arrivesAt: roundMonth(s.time + sys.distance), status: 'transmitting', result: '等待地方执行报告' };
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
                report(s, w.planetId, event.title, event.cause.join('；'), event.cause, event.critical ? 'critical' : 'good', Boolean(event.critical));
            if (!w.independent && Object.keys(RESEARCH).some(k => previous[k as ResearchFocus] !== w.knowledge[k as ResearchFocus])) {
                if (w.planetId === HOME)
                    for (const target of Object.values(s.worlds).filter(x => x.planetId !== HOME && !x.independent))
                        queue(s, { arrivesAt: roundMonth(s.time + systemOf(s, target.systemId)!.distance), knowledge: { targetId: target.planetId, tech: { ...w.knowledge } } });
                else
                    queue(s, { arrivesAt: roundMonth(s.time + sys.distance), knowledge: { targetId: HOME, tech: { ...w.knowledge } } });
            }
            if (s.tick % (BALANCE.reportYears * 12) === 0 && w.systemId !== 'sol') {
                snapshot(s, w.planetId);
                report(s, w.planetId, '地方五年报告', `人口 ${Math.round(w.population).toLocaleString('en-US')}；支持 ${w.support.toFixed(0)}%；生态 ${w.ecology.toFixed(0)}%。`, w.causes);
            }
        }
        for (const ship of s.ships) {
            if (ship.status === 'building' && ship.departsAt <= s.time) {
                ship.status = 'outbound';
                const known = s.knownShips.find(x => x.id === ship.id);
                if (known && systemOf(s,ship.originId)!.id === 'sol')
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
                    launch(s, { type: 'launch', originId: HOME, targetId, kind: 'freighter', authorization: 'adaptive', risk: .5, goal: 'farm' });
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
                    report(s, w.planetId, '区域环境灾害', `区域 ${district.id + 1} 的基础设施受损，地方开始自动修复。`, [`本轮环境事件概率 ${(chance * 100).toFixed(1)}%`, `环境风险 ${sys.risk.toFixed(2)}，防御设施 ${defense.toFixed(1)}`, `损坏增加 ${severity.toFixed(0)}%，工业品损失 10%`], 'warn');
                }
            }
        if (s.tick % 1200 === 0)
            report(s, 'sol', '百年时代总结', `国家已知世界 ${Object.values(s.intel).filter(x => x.level === 'colonized').length}；已收到历史记录 ${s.messages.length} 条。`, s.worlds[HOME].causes, 'good');
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
