import grid from '../content/earth/grid.json';
import type { SurfacePoint } from './types';

const bytes = Uint8Array.from(atob(grid.data), c => c.charCodeAt(0));
const values = new DataView(bytes.buffer);
export const EARTH = 'sol-planet-2';
const EARTH_REGIONS = [[40,-100],[48,2],[35,105],[-25,135],[0,25],[25,45],[-15,-50],[20,78],[55,40],[40,-80],[35,-5],[-30,25]];
export function districtPoint(id: number, planetId: string): SurfacePoint {
    if (planetId === EARTH) return geographicPoint(...EARTH_REGIONS[id] as [number,number]);
    return geographicPoint(-60 + Math.floor(id/4)*60, id%4*90);
}
export function geographicPoint(latitude: number, longitude: number): SurfacePoint {
    const lat = latitude * Math.PI / 180, lon = longitude * Math.PI / 180;
    // Looking at longitude zero with north up, east must be screen-right (-Z).
    return [Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon)];
}
export function geographicUV([x,y,z]: SurfacePoint) {
    return [(Math.atan2(-z,x) / (2*Math.PI) + .5) % 1, .5 - Math.asin(Math.max(-1,Math.min(1,y))) / Math.PI];
}
function cell(x: number, y: number) {
    return values.getUint16((Math.max(0,Math.min(grid.height-1,y))*grid.width + (x%grid.width+grid.width)%grid.width)*2,true);
}
function earthHeight(x: number, y: number) {
    const ix=Math.floor(x), iy=Math.floor(y), fx=x-ix, fy=y-iy;
    const h=(a:number,b:number)=> (cell(a,b)&2048) ? (cell(a,b)&2047)*4 : 0;
    return (h(ix,iy)*(1-fx)+h(ix+1,iy)*fx)*(1-fy)+(h(ix,iy+1)*(1-fx)+h(ix+1,iy+1)*fx)*fy;
}
export function terrainSample(p: SurfacePoint, planetId: string) {
    if (planetId === EARTH) {
        const [u,v]=geographicUV(p), x=u*grid.width-.5, y=v*grid.height-.5;
        const value=cell(Math.round(x),Math.round(y)), water=!(value&2048);
        const height=water ? 0 : earthHeight(x,y);
        const dx=40030174/grid.width*Math.max(.05,Math.sqrt(1-p[1]*p[1])), dy=20015087/grid.height;
        const slope=water ? 0 : Math.atan(Math.hypot((earthHeight(x+1,y)-earthHeight(x-1,y))/(2*dx),(earthHeight(x,y+1)-earthHeight(x,y-1))/(2*dy)))*180/Math.PI;
        return {water,height,slope,fertility:(value>>>12)/15, minerals:water?0:Math.min(1,.3+height/8000+slope*.03)};
    }
    if (/^sol-planet-[013]$/.test(planetId)) return {water:false,height:0,slope:0,fertility:.1,minerals:.7};
    const [x,y,z]=p, h=Math.sin(x*8+z*3)*Math.cos(y*7-x*2)*.035+Math.sin(z*19+y*11)*.009;
    return {water:h<-.003,height:h/1.8*6371000,slope:Math.abs(Math.cos(x*8+z*3))*4,fertility:Math.max(.1,.8-Math.abs(y)*.5),minerals:Math.min(1,.4+Math.max(0,h)*12)};
}
export function terrainElevation(p: SurfacePoint, planetId: string) {
    const t=terrainSample(p,planetId);
    return planetId===EARTH ? t.height/6371000*1.8 : Math.max(-.005,t.height/6371000*1.8);
}
