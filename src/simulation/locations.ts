import type { StarSystem } from './types';

export const HOME = 'sol-planet-2';
export const systemForPlanet = (systems: StarSystem[], planetId: string) => systems.find(s => s.bodies.some(b => b.id === planetId));
export const planetById = (systems: StarSystem[], planetId: string) => systemForPlanet(systems,planetId)?.bodies.find(b=>b.id===planetId);
export function travelDistance(systems: StarSystem[], originId: string, targetId: string) {
    const a=systemForPlanet(systems,originId)!, b=systemForPlanet(systems,targetId)!;
    // Same-system route estimate uses opposing orbital positions; AU converted to light years.
    return a.id===b.id ? (planetById(systems,originId)!.orbit+planetById(systems,targetId)!.orbit)/63241.077 : Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
}
