import { districtPoint, terrainSample } from './terrain';
import { BALANCE, START_TIME, techZero } from '../content/catalog';
import { mulberry32 } from './rng';
import type { PlanetBody, StarSystem, WorldState, Zone } from './types';
const names = ['南门二', '巴纳德', '天狼', '鲁坦', '鲸鱼座 τ', '波江座 ε', '拉卡耶', '罗斯 128', '格利泽 667', '卡普坦', '轩辕增十九', '印第安座 ε', '格利泽 832', '沃尔夫 1061', '罗斯 154', '格利泽 581', '格利泽 876', '天苑四', '格利泽 1061'];
export function generateSystem(seed: number, index: number): StarSystem {
    const r = mulberry32(seed + index * 7919);
    const distance = index === 0 ? 0 : BALANCE.starDistanceBase + index * BALANCE.starDistanceStep + r() * BALANCE.starDistanceJitter;
    const a = r() * Math.PI * 2, e = (r() - .5) * .5;
    const system: StarSystem = { bodies: [], id: index === 0 ? 'sol' : `star-${index}`, name: index === 0 ? '太阳系' : names[index - 1] ?? `远望 ${index}`, distance, x: index === 0 ? 0 : Math.cos(a) * Math.cos(e) * distance, y: index === 0 ? 0 : Math.sin(e) * distance, z: index === 0 ? 0 : Math.sin(a) * Math.cos(e) * distance, spectral: index === 0 ? 'G' : (['G', 'K', 'M', 'F'] as const)[Math.floor(r() * 4)], habitability: index === 0 ? 1 : .35 + r() * .6, resources: .4 + r() * .5, risk: .08 + r() * .35, planets: 3 + Math.floor(r() * 6), ...(index === 8 ? { anomaly: 'civilization' as const } : [4, 15, 36].includes(index) ? { anomaly: 'ruins' as const } : {}) };
    system.planets = index === 0 ? 8 : system.planets;
    system.bodies = generateBodies(system, seed + index * 337);
    return system;
}
export function createWorld(system: StarSystem, time: number, seed: number, home = false, goal: Zone = 'housing', targetPlanetId = system.bodies.find(b=>b.primary)!.id): WorldState {
    const r = mulberry32(seed + system.name.length * 541), population = home ? 12400000000 : BALANCE.colonyPassengers;
    const zones: Zone[] = ['housing', 'industry', 'farm', 'science', 'reserve', 'commerce', 'farm', 'defense', 'housing', 'industry', 'farm', 'science'];
    const districts = zones.map((zone, id) => ({ id, zone: !home && id === 0 ? goal : zone, priority: 1, progress: home ? 100 : id < 4 ? 25 : 0, density: home ? 3 : id < 4 ? .3 : 0, pollution: home && zone === 'industry' ? 15 : 0, hub: home ? id % 3 === 0 : id === 0, damage: 0, ruins: 0, terrain: (['plain', 'mountain', 'forest', 'desert'] as const)[Math.floor(r() * 4)], fertility: .5 + r() * .5, minerals: .4 + r() * .6 }));
    const planetId=targetPlanetId;
    for (const d of districts) {
        const sample=terrainSample(districtPoint(d.id,planetId),planetId);
        d.terrain=sample.slope>2 || sample.height>1800 ? 'mountain' : sample.fertility<.35 ? 'desert' : sample.fertility>.65 ? 'forest' : 'plain';
        d.fertility=sample.fertility; d.minerals=sample.minerals;
    }
    const cohorts = Array.from({ length: 12 }, (_, id) => ({ id, region: id, size: population / 12, young: .24, elderly: .16, profession: (['workers', 'scientists', 'farmers', 'services'] as const)[id % 4], education: home ? 65 : 70, identity: home ? 90 : 75, living: 70, support: 70, axes: [35 + r() * 30, 35 + r() * 30, 20 + r() * 60, 35 + r() * 30] as [
            number,
            number,
            number,
            number
        ] }));
    const u = population * BALANCE.stockPerPerson;
    return { systemId: system.id, radiusKm: system.bodies.find(b=>b.id===planetId)!.radius, planetId, surface: [], name: home ? '地球共同体' : `${system.bodies.find(b=>b.id===planetId)!.name}前哨`, foundedAt: home ? START_TIME - 400 : time, population, stock: { energy: u * 4, food: u * 4, materials: u * 5, goods: u * 3, components: u }, cohorts, districts, finance: { balance: home ? 82000 : 9000, debt: 0, revenue: 0, expenses: 0, interest: 0, commitments: 0, limit: home ? 80000 : 12000, tax: BALANCE.tax, budget: 1, price: 1 }, industry: home ? 75 : 15, support: 70, stability: 80, ecology: 80, autonomy: home ? 20 : 35, policy: 'balanced', regime: 'republic', tech: techZero(), knowledge: techZero(), research: techZero(), focus: 'propulsion', spaceport: home ? 100 : 0, stage: home ? 5 : 0, independent: false, charter: false, crisis: false, contact: 'observe', alienTrust: 50, alienDevelopment: 20, causes: [], history: [] };
}

function generateBodies(system: StarSystem, seed: number): PlanetBody[] {
    const random = mulberry32(seed);
    const names = ['水星', '金星', '地球', '火星', '木星', '土星', '天王星', '海王星'];
    const orbits = [.39, .72, 1, 1.52, 5.2, 9.58, 19.2, 30.05];
    const radii = [2440, 6052, 6371, 3390, 69911, 58232, 25362, 24622];
    return Array.from({ length: system.planets }, (_, i) => {
        const primary = i === (system.id === 'sol' ? 2 : 1);
        return {
            id: `${system.id}-planet-${i}`, name: system.id === 'sol' ? names[i] : `${system.name} ${String.fromCharCode(98 + i)}`,
            kind: (i > 3 ? '气态' : '岩质') as PlanetBody['kind'],
            orbit: system.id === 'sol' ? orbits[i] : +(.25 * 1.8 ** i).toFixed(2),
            radius: system.id === 'sol' ? radii[i] : Math.round(i > 3 ? 25000 + random() * 45000 : 2500 + random() * 5000),
            primary, habitability: primary ? system.habitability : random() * .18,
            resources: primary ? system.resources : .2 + random() * .7,
        };
    });
}
