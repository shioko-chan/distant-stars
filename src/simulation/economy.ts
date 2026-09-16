import { HOME } from './locations';
import { settleSurface, surfacePower } from './surface';
import { BALANCE, POLICIES, PROJECTS, RESEARCH } from '../content/catalog';
import { deterministicNoise } from './rng';
import type { ResearchFocus, StarSystem, WorldState, Zone } from './types';
export const clamp = (n: number, low = 0, high = 100) => Math.max(low, Math.min(high, n));
export interface LocalEvent {
    title: string;
    cause: string[];
    critical?: boolean;
}
/** One fixed month. No rendering, wall clock, or random calls. */
export function settleWorld(w: WorldState, system: StarSystem, time: number): LocalEvent[] {
    const events: LocalEvent[] = [];
    const planet=system.bodies.find(b=>b.id===w.planetId)!;
    settleSurface(w);
    const dt = 1 / 12, p = POLICIES[w.policy];
    const units = Math.max(1, w.population * BALANCE.stockPerPerson);
    const oldSupport = w.support, oldAutonomy = w.autonomy, oldEcology = w.ecology;
    const logistics = clamp(55 + w.districts.filter(d => d.hub).length * 5 - w.districts.reduce((s, d) => s + d.damage, 0) / 12, 25, 100) / 100;
    const localPower = new Map<Zone, number>();
    const zonePower = (zone: Zone) => {
        if (!localPower.has(zone)) localPower.set(zone, surfacePower(w, zone) + w.districts.reduce((s, d) => s + (d.zone === zone ? 1 : 0) * (d.progress / 100 + .2) * (1 - d.damage / 100), 0));
        return localPower.get(zone)!;
    };
    const shortage = w.stock.food < units * .12 || w.stock.energy < units * .12;
    const efficiency = (shortage ? BALANCE.shortageEfficiency : 1) * (.65 + w.stability * .0035) * (BALANCE.logisticsFloor + logistics * (1 - BALANCE.logisticsFloor));
    const foodOutput = units * (1.1 + zonePower('farm') * .15) * (.7 + w.ecology * .004) * (1 + w.tech.ecology * .1) * efficiency;
    const foodDemand = units * (w.policy === 'ration' ? .75 : 1);
    const power = units * (1.5 + w.tech.industry * .15) * efficiency;
    const inputs = units * (.5 + w.industry * .003);
    const raw = units * (.9 + planet.resources! * .3) * efficiency;
    const goods = units * (.55 + zonePower('industry') * .12) * p.industry * (1 + w.tech.industry * .12) * efficiency;
    const energyUse = units * (1 + zonePower('science') * .035 + zonePower('industry') * .03);
    w.stock.food = clamp(w.stock.food + (foodOutput - foodDemand) * dt, 0, units * 15);
    w.stock.energy = clamp(w.stock.energy + (power - energyUse) * dt, 0, units * 15);
    const factoryEfficiency = w.stock.materials > units * .1 && w.stock.energy > 0 ? 1 : .2;
    w.stock.materials = clamp(w.stock.materials + (raw - inputs * factoryEfficiency) * dt, 0, units * 15);
    w.stock.goods = clamp(w.stock.goods + (goods * factoryEfficiency - units * .5) * dt, 0, units * 15);
    w.stock.components = clamp(w.stock.components + (goods * .15 * factoryEfficiency - units * .06) * dt, 0, units * 5);
    w.ecology = clamp(w.ecology + (p.ecology + zonePower('reserve') * .12 - w.industry * .003) * dt, 3, 100);
    w.industry = clamp(w.industry + (zonePower('industry') * .3 * p.industry * efficiency - w.industry * .008) * dt, 2, 100);
    const priceTarget = clamp(1 + (2 - Math.min(w.stock.food, w.stock.goods, w.stock.energy) / units) * .25, .6, 4);
    w.finance.price += (priceTarget - w.finance.price) * dt;
    const baseIncome = 300 + Math.log10(Math.max(w.population, 1)) * 180;
    w.finance.revenue = baseIncome * (w.finance.tax / .22) * (w.policy === 'autonomy' ? .8 : 1) * (w.support / 100 + .3);
    w.finance.interest = w.finance.debt * BALANCE.debtInterest;
    w.finance.expenses = baseIncome * (.52 + w.finance.budget * .17) + w.finance.interest + w.districts.filter(d => d.hub).length * 12;
    w.finance.limit = baseIncome * 35;
    const change = (w.finance.revenue - w.finance.expenses) * dt;
    w.finance.balance += change;
    if (w.finance.balance < 0) {
        const loan = Math.min(-w.finance.balance, Math.max(0, w.finance.limit - w.finance.debt));
        w.finance.debt += loan;
        w.finance.balance += loan;
        if (w.finance.balance < 0) {
            w.finance.balance = 0;
            w.finance.budget = .5;
        }
    }
    if (w.finance.balance > baseIncome * 5 && w.finance.debt > 0) {
        const repayment = Math.min(w.finance.debt, baseIncome * dt);
        w.finance.balance -= repayment;
        w.finance.debt -= repayment;
    }
    w.finance.commitments = Math.max(0, w.finance.commitments - 100 * dt);
    for (const c of w.cohorts) {
        const materialLiving = clamp(70 + (w.stock.food / units - 2) * 5 - (w.finance.price - 1) * 15 - (w.policy === 'ration' ? 15 : 0));
        c.living += (materialLiving - c.living) * dt * .2;
        c.education = clamp(c.education + (.15 + zonePower('science') * .06) * w.finance.budget * dt);
        const distancePressure = system.distance * .12;
        const targetAxes = [clamp(40 + distancePressure * 8 + (w.policy === 'autonomy' ? 20 : w.policy === 'industry' ? -10 : 0) - (shortage ? 20 : 0)), clamp(55 + (70 - c.living) * .6), clamp(55 + (w.ecology - 65) * .8 + (c.profession === 'workers' ? 15 : -10)), clamp(50 + (w.finance.price - 1) * -12)];
        c.axes = c.axes.map((v, i) => clamp(v + (targetAxes[i] - v) * dt * BALANCE.politicalInertia)) as typeof c.axes;
        const alignment = 100 - c.axes.reduce((sum, v, i) => sum + Math.abs(v - p.axes[i]), 0) / 4;
        const targetSupport = clamp(c.living * .55 + alignment * .45 - (w.finance.tax - .22) * 100 - (shortage ? 25 : 0));
        c.support = clamp(c.support + (targetSupport - c.support) * dt * .12);
        c.identity = clamp(c.identity - distancePressure * .02 * dt + (w.tech.governance * .01) * dt);
        c.young = clamp(c.young + (.22 - c.young) * dt * .01, 0, 1);
        c.elderly = clamp(c.elderly + (.2 - c.elderly) * dt * .01, 0, 1);
        const capacity = w.planetId === HOME ? 30e9 : 40000 + zonePower('housing') * 250000 + w.industry * 10000;
        c.size = Math.max(0, c.size * (1 + (BALANCE.annualGrowth * (1 - w.population / capacity) - (shortage ? BALANCE.annualStarvationLoss : 0)) * dt));
    }
    w.population = w.cohorts.reduce((s, c) => s + c.size, 0);
    // Jobs and services cause gradual internal migration while conserving people.
    const attractions = w.cohorts.map(c => { const d = w.districts[c.region]; return Math.max(.1, (1 + d.density * .2) * (1 - d.pollution / 150) * (d.hub ? 1.15 : 1)); });
    const totalAttraction = attractions.reduce((a, b) => a + b, 0);
    w.cohorts.forEach((c, i) => { c.size += (w.population * attractions[i] / totalAttraction - c.size) * dt * BALANCE.migrationRate; });
    w.support = w.cohorts.reduce((s, c) => s + c.support * c.size, 0) / Math.max(w.population, 1);
    w.autonomy = w.cohorts.reduce((s, c) => s + c.axes[0] * c.size, 0) / Math.max(w.population, 1);
    w.stability = clamp(w.stability + ((w.support - 50) * .04 - (shortage ? 3 : 0) + (w.policy === 'control' ? 1.2 : 0)) * dt, 0, 100);
    if(oldSupport>=40 && w.support<40) events.push({title:'抗议与罢工扩大',cause:['政府支持跌破 40%','群体利益与政策失配','稳定度下降将影响生产与命令执行']});
    for (const d of w.districts) {
        const available = w.stock.goods > units * .2 && w.stock.energy > units * .2 && w.finance.balance > 30;
        const terrain = d.terrain === 'mountain' ? .65 : d.terrain === 'desert' ? .8 : 1;
        if (available && w.stability > 20) {
            const build = dt * (1 + w.tech.industry * .1) * terrain * logistics * d.priority * w.finance.budget;
            d.progress = clamp(d.progress + build * (d.zone === 'reserve' ? .5 : BALANCE.constructionRate));
            d.density = clamp(d.density + build * .015, 0, 4);
            d.damage = clamp(d.damage - build * 2);
            w.stock.goods = Math.max(0, w.stock.goods - units * .0005 * build);
            w.finance.balance -= Math.min(w.finance.balance, 2 * build);
        }
        d.pollution = clamp(d.pollution + ((d.zone === 'industry' ? 1 : -.3) + (w.policy === 'ecology' ? -.5 : 0)) * dt);
        if (shortage) {
            d.damage = clamp(d.damage + .4 * dt);
            d.ruins = Math.max(d.ruins, d.damage);
        }
    }
    // Local institutions prioritize survival without waiting for the capital.
    if (shortage && w.policy !== 'ration') {
        w.policy = 'ration';
        events.push({ title: '地方启动紧急配给', cause: ['食物或能源储备不足', '地方生存授权', '食物消费降低 25%'], critical: true });
    }
    if (shortage && !w.crisis) {
        w.crisis = true;
        events.push({ title: '生存危机', cause: ['本地库存不足', '生产与消费失衡', '可以补给、配给或疏散'], critical: true });
    }
    if (!shortage && w.crisis) {
        w.crisis = false;
        events.push({ title: '恢复基础供给', cause: ['地方生产恢复', '配给或外部补给', '自动修复受损基础设施'] });
    }
    if (w.population < 1000 && w.stage !== -1) {
        w.stage = -1;
        events.push({ title: '前哨失去延续能力', cause: ['人口低于 1,000', '长期供给或运输失败', '剩余人口仍可疏散或救援'], critical: true });
    }
    if (w.stability < 20 && w.regime !== 'federation') {
        w.regime = 'federation';
        w.policy = 'autonomy';
        w.stability = 35;
        events.push({ title: '地方政府重组为自治联邦', cause: ['长期支持不足', '公共服务压力', '既有建设和合同继续'], critical: true });
    }
    if (w.support < 12 && w.autonomy > 65 && !w.independent) {
        w.independent = true;
        events.push({ title: '地方宣布脱离中央管辖', cause: ['支持率低于 12%', '自治主张形成多数', '中央行政能力不足'], critical: true });
    }
    const keys = Object.keys(RESEARCH) as ResearchFocus[];
    for (const key of keys) {
        const prerequisite = key === 'propulsion' ? Math.min(w.knowledge.industry, w.knowledge.ecology) + 1 : Math.min(...Object.values(w.knowledge)) + 2;
        if (w.knowledge[key] < BALANCE.maxTech && w.knowledge[key] < prerequisite) {
            const projectVariation=.85+deterministicNoise(w.systemId.split('').reduce((n,c)=>n+c.charCodeAt(0),0),keys.indexOf(key)*17+w.knowledge[key])*.3;
            const rate = (key === w.focus ? 2 : 0.6) * w.finance.budget * (.5 + zonePower('science') * .25) * efficiency * projectVariation;
            w.research[key] += dt * rate / (BALANCE.researchYears * (1 + w.knowledge[key] * .25));
            if (w.research[key] >= 1) {
                w.research[key] -= 1;
                w.knowledge[key]++;
                events.push({ title: `${RESEARCH[key]}取得第 ${w.knowledge[key]} 代成果`, cause: [PROJECTS[key][w.knowledge[key]-1], `科研预算 ${w.finance.budget.toFixed(1)} 倍`, `项目难度倍率 ${projectVariation.toFixed(2)}（范围 0.85–1.15）`, '当地需要设备和教育部署'] });
            }
        }
        if (w.tech[key] < w.knowledge[key] && w.stock.components > units * .1 && w.cohorts[1].education > 45) {
            w.tech[key] = Math.min(w.knowledge[key], w.tech[key] + dt * .15);
            w.stock.components -= units * .0002;
        }
    }
    if (w.spaceport > 0 && w.spaceport < 100 && w.stock.components > units * .2)
        w.spaceport = clamp(w.spaceport + dt * 2 * w.finance.budget);
    const stage = time - w.foundedAt < 5 ? 0 : shortage ? 1 : w.industry < 30 ? 2 : w.industry < 55 ? 3 : w.spaceport < 100 ? 4 : 5;
    if (stage > w.stage && w.population >= 1000) {
        w.stage = stage;
        events.push({ title: ['着陆', '临时前哨', '基础自持', '区域工业化', '成熟世界', '恒星系中心'][stage], cause: ['能源与食物供给', '地方工业持续建设', `工业能力 ${w.industry.toFixed(0)}`] });
    }
    if (planet.primary && system.anomaly === 'civilization') {
        const trustRate = { observe: .1, secret: -.04, contact: .35, exchange: .6, compete: -.8 }[w.contact];
        w.alienTrust = clamp(w.alienTrust + trustRate * dt);
        w.alienDevelopment = clamp(w.alienDevelopment + (w.contact === 'exchange' ? .3 : .02) * dt);
        if (w.contact === 'compete') {
            w.stock.materials += units * .05 * dt;
            w.support = clamp(w.support - .2 * dt);
        }
    }
    if (Math.abs(time - Math.round(time)) < 1e-6) {
        w.causes = [`支持变化 ${(w.support - oldSupport).toFixed(2)} / 月：生活水平与政策利益匹配`, `自治变化 ${(w.autonomy - oldAutonomy).toFixed(3)} / 月：距离 ${system.distance.toFixed(1)} 光年与代际惯性`, `生态变化 ${(w.ecology - oldEcology).toFixed(2)} / 月：${p.name}、保护区和工业负担`, `食物年产 ${foodOutput.toFixed(0)} / 消费 ${foodDemand.toFixed(0)}；物流 ${(logistics * 100).toFixed(0)}%`];
        w.history.push({ time, population: w.population, support: w.support, ecology: w.ecology, industry: w.industry });
        w.history = w.history.slice(-BALANCE.reportHistory);
    }
    return events;
}
