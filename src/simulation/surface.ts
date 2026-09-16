import { terrainSample } from './terrain';
import { ZONES } from '../content/catalog';
import type { SurfaceDraft, SurfacePoint, SurfaceProject, WorldState, Zone } from './types';

export const PLAN_LIMIT = 96;
export const normalize = (p: SurfacePoint): SurfacePoint => {
    const length = Math.hypot(...p);
    return p.map(v => v / length) as SurfacePoint;
};
export const separation = (a: SurfacePoint, b: SurfacePoint) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export function pathLength(draft: SurfaceDraft) {
    return draft.points.slice(1).reduce((n, p, i) => n + separation(p, draft.points[i]), 0);
}
export function surfaceCost(draft: SurfaceDraft, planetId: string, radiusKm: number) {
    const lengthKm = pathLength(draft) * radiusKm;
    return Math.ceil((1 + surfaceProfile(draft, planetId).slope / 5) * (draft.kind === 'road' ? 100 + lengthKm * 8 : 80 + lengthKm * draft.width * radiusKm * 1.5));
}
export function validateSurface(drafts: SurfaceDraft[] | undefined, planetId: string): string {
    if (!Array.isArray(drafts) || !drafts.length || drafts.length > 24) return '一次批准 1–24 项地表规划';
    for (const d of drafts) {
        if (!d || !['road', 'zone'].includes(d.kind) || !(d.zone in ZONES) || !Number.isFinite(d.width) || d.width < .00001 || d.width > .02)
            return '规划工具或宽度无效';
        if (!Array.isArray(d.points) || d.points.length < 2 || d.points.length > 128 || d.points.some(p => !Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite) || Math.abs(Math.hypot(...p) - 1) > .0001))
            return '规划坐标无效';
        const length = pathLength(d);
        if (length < .00003 || length > .3) return '单项规划跨度过短或过长，请调整或分段绘制';
        // Check the full path, including between pointer samples.
        for (let i = 1; i < d.points.length; i++) {
            const a = d.points[i - 1], b = d.points[i], steps = Math.max(1, Math.ceil(separation(a, b) / .001));
            for (let j = 0; j <= steps; j++) {
                const p = normalize(a.map((v, k) => v + (b[k] - v) * j / steps) as SurfacePoint);
                const t = terrainSample(p, planetId);
                if (t.water) return '规划穿过海域，请沿陆地绘制';
                if (t.slope > (d.kind === 'road' ? 12 : 8)) return '区域坡度过陡，请绕行或选择平缓地形';
                const delta=b.map((v,k)=>v-a[k]);
                const side=normalize([p[1]*delta[2]-p[2]*delta[1],p[2]*delta[0]-p[0]*delta[2],p[0]*delta[1]-p[1]*delta[0]]);
                if (side.every(Number.isFinite)) {
                    const across=Math.max(2,Math.ceil(d.width/.001));
                    for(let k=0;k<=across;k++) {
                        const edge=terrainSample(normalize(p.map((v,c)=>v+side[c]*d.width*(k/across-.5)) as SurfacePoint),planetId);
                        if(edge.water) return '笔刷范围覆盖海域，请缩窄笔刷或向内陆移动';
                        if(edge.slope>(d.kind==='road'?12:8)) return '笔刷范围内区域坡度过陡';
                    }
                }
            }
        }
    }
    return '';
}
export function distanceToPath(point: SurfacePoint, path: SurfacePoint[]) {
    let best = Infinity;
    for (let i = 1; i < path.length; i++) {
        const a = path[i - 1], b = path[i], delta = b.map((v, k) => v - a[k]);
        const length = delta.reduce((n, v) => n + v * v, 0);
        const t = Math.max(0, Math.min(1, point.reduce((n, v, k) => n + (v - a[k]) * delta[k], 0) / Math.max(1e-12, length)));
        best = Math.min(best, separation(point, a.map((v, k) => v + delta[k] * t) as SurfacePoint));
    }
    return best;
}
export function roadAccess(project: SurfaceDraft, projects: SurfaceProject[]) {
    const roads=projects.filter(road=>road.kind==='road' && road.progress>=50);
    // Every part of a painted strip needs nearby road frontage, not just one endpoint.
    for(let i=1;i<project.points.length;i++) {
        const a=project.points[i-1], b=project.points[i], steps=Math.max(1,Math.ceil(separation(a,b)/.00008));
        for(let j=0;j<=steps;j++) {
            const p=normalize(a.map((v,k)=>v+(b[k]-v)*j/steps) as SurfacePoint);
            if(!roads.some(road=>distanceToPath(p,road.points)<project.width/2+road.width/2+.00008))return false;
        }
    }
    return roads.length>0;
}
export function surfacePower(w: WorldState, zone: Zone) {
    // Local developments have a bounded contribution to the existing regional economy.
    return Math.min(2, w.surface.filter(p => p.kind === 'zone' && p.zone === zone)
        .reduce((n, p) => n + Math.min(.2, pathLength(p) * p.width * 400) * p.progress / 100 * productivity(p, w.planetId) * (p.zone === 'reserve' || roadAccess(p, w.surface) ? 1 : 0), 0));
}
export function settleSurface(w: WorldState) {
    for (const p of w.surface) {
        if (p.progress >= 100) { p.status = '已建成'; continue; }
        if (w.stability <= 20) { p.status = '等待地方秩序恢复'; continue; }
        if (p.kind === 'zone' && p.zone !== 'reserve' && !roadAccess(p, w.surface)) { p.status = '缺少道路：在分区旁铺路，等待道路完成 50%'; continue; }
        const step = Math.min(100 - p.progress, (p.kind === 'road' ? 3 : 1.5) * w.finance.budget * (1 + w.tech.industry * .1) / (1 + surfaceProfile(p, w.planetId).slope / 5));
        const goods = step * p.cost / 1000;
        if (w.stock.goods < goods || w.stock.energy < goods / 2) { p.status = '等待当地工业品与能源'; continue; }
        w.stock.goods -= goods;
        w.stock.energy -= goods / 2;
        p.progress += step;
        p.spent = p.cost * p.progress / 100;
        p.status = p.progress >= 100 ? '已建成' : '施工中';
    }
}

export function surfaceProfile(draft: SurfaceDraft, planetId: string) {
    let slope=0, fertility=0, minerals=0, count=0;
    for (let i=1;i<draft.points.length;i++) {
        const a=draft.points[i-1], b=draft.points[i], steps=Math.max(1,Math.ceil(separation(a,b)/.001));
        for(let j=0;j<=steps;j++) {
            const t=terrainSample(normalize(a.map((v,k)=>v+(b[k]-v)*j/steps) as SurfacePoint),planetId);
            slope=Math.max(slope,t.slope); fertility+=t.fertility; minerals+=t.minerals; count++;
        }
    }
    return {slope,fertility:fertility/Math.max(1,count),minerals:minerals/Math.max(1,count)};
}
function productivity(draft: SurfaceDraft, planetId: string) {
    const profile=surfaceProfile(draft,planetId);
    return draft.zone==='farm' ? .25+profile.fertility : draft.zone==='industry' ? .5+profile.minerals : 1;
}
