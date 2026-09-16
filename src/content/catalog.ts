import type { Policy, ResearchFocus, Resource, ShipKind, Zone } from '../simulation/types';
export const CONTENT_VERSION = '0.7.0';
export const START_TIME = 2180;
export const BALANCE = {
    systems: 100, initialObserved: 20, maxShips: 100, reportYears: 5,
    failurePopulation: 1000, colonyPassengers: 24000, researchYears: 36,
    maxTech: 6, seed: 731942, stockPerPerson: .004, tax: .22, reportHistory: 80,
    annualGrowth: .008, annualStarvationLoss: .045, politicalInertia: .012,
    migrationRate: .006, debtInterest: .025, constructionRate: 2,
    routeReviewYears: 10, disasterReviewYears: 50,
    starDistanceBase: 1.8, starDistanceStep: .22, starDistanceJitter: .7,
    logisticsFloor: .8, shortageEfficiency: .85,
};
export const RESOURCES: Record<Resource, string> = { energy: '能源', food: '食物', materials: '基础原料', goods: '工业品', components: '高级部件' };
export const POLICIES: Record<Policy, {
    name: string;
    effect: string;
    industry: number;
    ecology: number;
    axes: [
        number,
        number,
        number,
        number
    ];
}> = {
    balanced: { name: '均衡发展', effect: '维持产业、公共服务与生态平衡', industry: 1, ecology: .12, axes: [45, 55, 50, 50] },
    industry: { name: '工业动员', effect: '工业产出 +25%，生态每年 -0.6', industry: 1.25, ecology: -.6, axes: [35, 40, 85, 35] },
    ecology: { name: '生态优先', effect: '工业产出 -15%，生态每年 +0.8', industry: .85, ecology: .8, axes: [55, 65, 15, 55] },
    autonomy: { name: '地方自治', effect: '增加自治与地方支持；公共财政收入 -20%', industry: .95, ecology: .2, axes: [90, 60, 45, 70] },
    ration: { name: '紧急配给', effect: '食物消费 -25%，生活水平下降', industry: 1, ecology: .1, axes: [30, 80, 45, 15] },
    control: { name: '军事管制', effect: '仅统制政府合法；增加治安，损害自治支持', industry: 1.1, ecology: -.3, axes: [5, 20, 70, 5] }
};
export const RESEARCH: Record<ResearchFocus, string> = { propulsion: '推进与舰船', industry: '能源与工业', ecology: '生命维持与生态', sensors: '探测与通信', governance: '自动化与治理' };
export const PROJECTS: Record<ResearchFocus,string[]> = {
    propulsion:['聚变喷流优化','磁约束推进','高效燃料循环','轻质星际船体','长程发动机维护','高能推进系统'],
    industry:['轨道冶炼','高温材料','自动化装配','高效聚变供能','闭环工业','分布式制造'],
    ecology:['闭环生命维持','生态循环农业','休眠医疗','环境修复','异星适应','长程栖居体系'],
    sensors:['长基线干涉','自主轨道扫描','地表遥测','深空中继','统计观测网络','远距科学观测'],
    governance:['地方行政模型','自动预算审计','自治任务规划','分布式教育','危机决策辅助','星际授权体系'],
};
export const ZONES: Record<Zone, {
    name: string;
    color: string;
}> = { housing: { name: '住宅', color: '#80bba9' }, industry: { name: '工业', color: '#d6a85e' }, farm: { name: '农业', color: '#93b36d' }, science: { name: '科研', color: '#77b7d9' }, reserve: { name: '保护区', color: '#408b6e' }, commerce: { name: '商业', color: '#b09ac8' }, defense: { name: '防御', color: '#c4867f' } };
export const SHIPS: Record<ShipKind, {
    name: string;
    cost: number;
    goods: number;
    components: number;
    buildYears: number;
    speed: number;
    increment: number;
    maximum: number;
    reliability: number;
}> = {
    probe: { name: '无人探测器', cost: 3800, goods: 10, components: 5, buildYears: 1, speed: .01, increment: .04, maximum: .25, reliability: .995 },
    colony: { name: '星际拓荒船', cost: 18000, goods: 80, components: 30, buildYears: 4, speed: .008, increment: .038, maximum: .22, reliability: .98 },
    freighter: { name: '货船', cost: 5000, goods: 20, components: 8, buildYears: 2, speed: .008, increment: .032, maximum: .2, reliability: .995 },
    passenger: { name: '客运船', cost: 7000, goods: 25, components: 12, buildYears: 2, speed: .008, increment: .035, maximum: .22, reliability: .99 }
};
export const SPEEDS = [{ value: 0, label: '暂停' }, { value: 1 / 365.25, label: '日' }, { value: 1 / 12, label: '月' }, { value: 1, label: '年' }, { value: 5, label: '5 年' }, { value: 20, label: '20 年' }];
export const techZero = () => ({ propulsion: 0, industry: 0, ecology: 0, sensors: 0, governance: 0 });
export const stockZero = () => ({ energy: 0, food: 0, materials: 0, goods: 0, components: 0 });
export function validateContent() {
    for (const ship of Object.values(SHIPS)) {
        if (!Object.values(ship).filter(x=>typeof x==='number').every(Number.isFinite) || ship.speed <= 0 || ship.maximum >= 1 || ship.maximum < ship.speed || ship.cost <= 0 || ship.buildYears <= 0 || ship.reliability <= 0 || ship.reliability > 1) throw new Error('舰船配置无效');
    }
    for (const policy of Object.values(POLICIES)) {
        if (policy.axes.length !== 4 || policy.axes.some(v=>!Number.isFinite(v)||v<0||v>100) || policy.industry <= 0) throw new Error('政策配置无效');
    }
    if (Object.keys(ZONES).length !== 7 || Object.keys(RESEARCH).length !== 5 || Object.values(BALANCE).some(v=>!Number.isFinite(v)||v<0)) throw new Error('内容分区不完整或数值无效');
}
validateContent();

