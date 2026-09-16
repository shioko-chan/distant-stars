import { HOME, planetById } from '../simulation/locations';
import { PLAN_LIMIT, validateSurface } from '../simulation/surface';
import { CONTENT_VERSION, POLICIES, RESEARCH, RESOURCES, SHIPS, START_TIME, ZONES } from '../content/catalog';
import type { GameState, IntelRecord, WorldState } from '../simulation/types';
export const SAVE_KEY = 'distant-stars-save-v3';
export function encodeSave(state: GameState) { return JSON.stringify(state); }
function requireValid(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`存档损坏：${message}`);
}
function validateWorld(w: WorldState) {
    requireValid(w && w.finance && w.stock && w.tech && w.knowledge && w.research, '世界缺少经济或科技数据');
    requireValid(Array.isArray(w.cohorts) && w.cohorts.length === 12 && Array.isArray(w.districts) && w.districts.length === 12, '人口群体或区域数据不完整');
    requireValid(Number.isFinite(w.population) && w.population >= 0 && w.policy in POLICIES && w.focus in RESEARCH, '人口、政策或科研方向无效');
    for (const key of Object.keys(RESOURCES) as (keyof typeof RESOURCES)[]) requireValid(Number.isFinite(w.stock[key]) && w.stock[key] >= 0, '库存无效');
    for (const values of [w.tech, w.knowledge, w.research]) for (const key of Object.keys(RESEARCH) as (keyof typeof RESEARCH)[]) requireValid(Number.isFinite(values[key]) && values[key] >= 0, '科技数值无效');
    for (const c of w.cohorts) requireValid(c && Number.isFinite(c.size) && c.size >= 0 && Number.isInteger(c.region) && c.region >= 0 && c.region < 12 && Array.isArray(c.axes) && c.axes.length === 4 && c.axes.every(Number.isFinite), '人口群体无效');
    for (const [i,d] of w.districts.entries()) requireValid(d && d.id === i && d.zone in ZONES, '地块规划无效');
    requireValid(Number.isFinite(w.radiusKm) && w.radiusKm>0 && typeof w.planetId === 'string' && Array.isArray(w.surface) && w.surface.length <= PLAN_LIMIT && w.surface.every(p => !validateSurface([p], w.planetId) && Number.isFinite(p.progress) && p.progress >= 0 && p.progress <= 100 && Number.isFinite(p.cost) && p.cost >= 0 && Number.isFinite(p.spent) && p.spent >= 0), '地表工程无效');
    requireValid(Array.isArray(w.history) && Array.isArray(w.causes) && Number.isFinite(w.finance.balance) && w.finance.balance >= 0, '财政或历史数据无效');
}
function validateIntel(record: IntelRecord) {
    requireValid(record && typeof record.planetId==='string' && Number.isFinite(record.observedAt) && Number.isFinite(record.receivedAt) && record.receivedAt >= record.observedAt && ['observed','surveyed','colonized'].includes(record.level), '情报时间无效');
    if (record.worldSnapshot) {
        requireValid(record.worldSnapshot.planetId===record.planetId && record.worldSnapshot.systemId===record.systemId,'行星快照错配');
        validateWorld(record.worldSnapshot);
    }
}
export function decodeSave(raw: string): GameState {
    const s = JSON.parse(raw) as GameState;
    if (!s || s.version !== 3 || s.contentVersion !== CONTENT_VERSION) throw new Error('存档版本不匹配，请开始新纪元');
    requireValid(Number.isInteger(s.tick) && s.tick >= 0 && s.time === START_TIME + s.tick / 12 && Number.isInteger(s.rngState) && Number.isInteger(s.sequence), '时间或随机状态无效');
    requireValid(s.worlds?.[HOME] && s.intel?.[HOME] && Array.isArray(s.systems) && s.systems.length >= 20 && s.systems.length <= 100, '世界或星图缺失');
    for (const key of ['ships','knownShips','orders','knownOrders','signals','actions','messages','routes','milestones'] as const) requireValid(Array.isArray(s[key]), `${key} 数据缺失`);
    const ids = new Set(s.systems.map(sys => sys.id));
    requireValid(ids.size === s.systems.length, '星图存在重复目标');
    for (const sys of s.systems) requireValid(sys && Number.isFinite(sys.distance) && sys.distance >= 0 && [sys.x,sys.y,sys.z].every(Number.isFinite) && Array.isArray(sys.bodies) && sys.bodies.length === sys.planets && sys.bodies.filter(b => b.primary).length === 1, '星图坐标无效');
    for (const [id,w] of Object.entries(s.worlds)) { requireValid(id===w.planetId && ids.has(w.systemId), '世界目标不存在'); validateWorld(w); }
    for (const w of Object.values(s.worlds)) requireValid(s.systems.find(sys => sys.id === w.systemId)!.bodies.some(b => b.id === w.planetId), '世界对应行星不存在');
    for (const [id,record] of Object.entries(s.intel)) { requireValid(id===record.planetId && s.systems.some(sys=>sys.id===record.systemId && sys.bodies.some(b=>b.id===id)), '行星情报目标无效'); validateIntel(record); }
    requireValid(s.systems.every(sys=>sys.bodies.every(b=>s.intel[b.id])), '行星情报缺失');
    requireValid(s.routes.every(id=>planetById(s.systems,id)), '补给航线目标无效');
    for (const ship of [...s.ships,...s.knownShips]) requireValid(ship && planetById(s.systems,ship.originId) && planetById(s.systems,ship.targetId) && ship.kind in SHIPS && Number.isFinite(ship.velocityC) && ship.velocityC > 0 && ship.velocityC < 1 && ship.arrivesAt > ship.departsAt && ship.knowledge && ship.cargo, '舰船数据无效');
    for (const signal of s.signals) { requireValid(Number.isFinite(signal.arrivesAt), '通信时间无效'); if (signal.intel) validateIntel(signal.intel); }
    for (const order of [...s.orders,...s.knownOrders]) requireValid(order && planetById(s.systems,order.targetId) && Number.isFinite(order.arrivesAt) && Number.isFinite(order.deadline) && Number.isFinite(order.budget) && order.budget >= 0, '命令数据无效');
    for (const order of [...s.orders, ...s.knownOrders, ...s.signals.flatMap(signal => signal.order ? [signal.order] : [])])
        if (order.kind === 'surface') requireValid(!validateSurface(order.surface, order.targetId), '在途地表规划无效');
    for (const item of s.actions) requireValid(item && Number.isInteger(item.tick) && item.tick >= 0 && item.tick <= s.tick && item.action, '回放记录无效');
    return s;
}
