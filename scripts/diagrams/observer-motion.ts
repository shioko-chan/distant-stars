/** Generate a portable SMIL SVG from the current presentation model.
 * Run: node_modules/.bin/vite-node scripts/diagrams/observer-motion.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PerspectiveCamera, Vector3 } from 'three';
import { EARTH_BODY, SOLAR_BODIES, SOLAR_KM_PER_UNIT } from '../../src/content/solarSystem';
import { CAMERA_START_POSITION } from '../../src/presentation/bridgeMotion';
import { HABITAT_HALF_WIDTH_M, HABITAT_RADIUS_M, HABITAT_ROTATION_PERIOD, HABITAT_RPM } from '../../src/presentation/habitatFrame';
import { EARTH_SIDEREAL_DAY_SECONDS, earthPositionFromStation, inertialOrientationFromStation, solarPositionFromStation, STATION_ORBIT_PERIOD, STATION_ORBIT_RADIUS_KM } from '../../src/presentation/stationOrbit';

const duration = 24;
const orbitDuration = 32;
const samples = 240;
const round = (n: number) => n.toFixed(3);
const series = <T>(fn: (fraction: number) => T, count = samples) => Array.from({ length: count + 1 }, (_, i) => fn(i / count));
const animate = (attribute: string, values: (string | number)[], seconds = duration) => `<animate attributeName="${attribute}" values="${values.join(';')}" dur="${seconds}s" repeatCount="indefinite" calcMode="linear"/>`;
const translate = (values: string[], seconds = duration) => `<animateTransform attributeName="transform" type="translate" values="${values.join(';')}" dur="${seconds}s" repeatCount="indefinite"/>`;
const text = (x: number, y: number, value: string, cls = 'body', rest = '') => `<text x="${x}" y="${y}" class="${cls}" ${rest}>${value}</text>`;
const line = (x1: number, y1: number, x2: number, y2: number, rest = '') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${rest}/>`;
const center = new Vector3(0, HABITAT_RADIUS_M, 0).sub(new Vector3(...CAMERA_START_POSITION)).divideScalar(1000 * SOLAR_KM_PER_UNIT);
const e0 = earthPositionFromStation(0).sub(center);
const normal = new Vector3(0, 1, 0).addScaledVector(e0.clone().normalize(), -e0.clone().normalize().y).normalize();
const axisAngle = Math.acos(normal.z) * 180 / Math.PI;
const camera = new PerspectiveCamera(60, 820 / 374, .001, 1e7);
camera.lookAt(new Vector3(0, 2.2, -30).sub(new Vector3(...CAMERA_START_POSITION)));
camera.updateMatrixWorld();
const toCamera = camera.quaternion.clone().invert();
const focal = 374 / (2 * Math.tan(Math.PI / 6));
const skyCenter = { x: 960, y: 451 };
const project = (point: Vector3) => {
    const p = point.clone().applyQuaternion(toCamera);
    return { x: skyCenter.x + focal * p.x / -p.z, y: skyCenter.y - focal * p.y / -p.z, p };
};
const frames = series(fraction => {
    const t = fraction * HABITAT_ROTATION_PERIOD;
    const earth = earthPositionFromStation(t);
    const sun = solarPositionFromStation(SOLAR_BODIES[0], t);
    const e = project(earth), s = project(sun);
    const radius = focal * (EARTH_BODY.radiusKm / SOLAR_KM_PER_UNIT) / Math.sqrt(earth.lengthSq() - (EARTH_BODY.radiusKm / SOLAR_KM_PER_UNIT) ** 2);
    const light = sun.clone().sub(earth).normalize();
    const phase = earth.clone().normalize().negate().dot(light);
    // Orthographic crescent icon; centers are perspective-projected from the real model.
    const k = Math.abs(phase);
    const angle = Math.atan2(s.y - e.y, s.x - e.x) * 180 / Math.PI;
    return { t, e, s, radius, k, angle };
});
// Keep the crescent turning continuously through atan2's ±180° seam.
for (let i = 1; i < frames.length; i++) {
    while (frames[i].angle - frames[i - 1].angle > 180) frames[i].angle -= 360;
    while (frames[i].angle - frames[i - 1].angle < -180) frames[i].angle += 360;
}
const sunTrajectory = frames.map((f, i) => `${i ? 'L' : 'M'}${round(f.s.x)},${round(f.s.y)}`).join(' ');
const earthTranslations = frames.map(f => `${round(f.e.x)} ${round(f.e.y)}`);
const sunTranslations = frames.map(f => `${round(f.s.x)} ${round(f.s.y)}`);
const crescent = (r: number, k: number) => `M0 ${round(-r)} A${round(r)} ${round(r)} 0 0 1 0 ${round(r)} A${round(k * r)} ${round(r)} 0 0 0 0 ${round(-r)}Z`;
const ticks = Array.from({ length: 48 }, (_, i) => {
    const a = i * Math.PI / 24;
    return line(Math.sin(a) * 147, Math.cos(a) * 147, Math.sin(a) * 159, Math.cos(a) * 159, `stroke="${i % 4 ? '#305465' : '#72c7d7'}" stroke-width="${i % 4 ? 2 : 3}"`);
}).join('');
const ringBuildings = Array.from({ length: 36 }, (_, i) => `<g transform="rotate(${i * 10})"><rect x="-4" y="${130 - i % 3 * 4}" width="8" height="${12 + i % 3 * 4}" rx="1" fill="#416275"/></g>`).join('');
const person = `<circle cx="0" cy="-24" r="7" fill="currentColor"/><path d="M0 -14 V7 M-13 -5 L0 -12 L13 -5 M0 7 L-9 23 M0 7 L9 23" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
const stars = series(f => {
    const i = Math.round(f * 50);
    const x = 565 + (i * 137.507 % 790), y = 277 + (i * 89.713 % 350);
    // Apply both inverse Earth-pointing attitude and inverse spin, as for the bodies.
    const ray = new Vector3((x - skyCenter.x) / focal, -(y - skyCenter.y) / focal, -1).applyQuaternion(camera.quaternion);
    const positions = series(p => project(ray.clone().applyQuaternion(inertialOrientationFromStation(p * HABITAT_ROTATION_PERIOD))), 96);
    return `<circle cx="${round(positions[0].x)}" cy="${round(positions[0].y)}" r="${i % 6 ? .9 : 1.5}" fill="#bfcbdf" opacity="${i % 6 ? .32 : .65}">${animate('cx', positions.map(p => round(p.x)))}${animate('cy', positions.map(p => round(p.y)))}</circle>`;
}, 50).join('');
const orbitDisplayRadius = 100;
const orbitScale = orbitDisplayRadius / e0.length();
const insetRotation = 54 * Math.PI / 180;
const orbitProject = (v: Vector3) => {
    const x = v.x * orbitScale, y = -(.57 * v.y - .82 * v.z) * orbitScale;
    return { x: 255 + x * Math.cos(insetRotation) - y * Math.sin(insetRotation), y: 891 + x * Math.sin(insetRotation) + y * Math.cos(insetRotation) };
};
const insetSun = orbitProject(solarPositionFromStation(SOLAR_BODIES[0], 0).sub(earthPositionFromStation(0)).normalize().multiplyScalar(160 / orbitScale));
const orbitFrames = series(f => {
    const t = f * STATION_ORBIT_PERIOD;
    const stationToInertial = inertialOrientationFromStation(t).invert();
    const station = earthPositionFromStation(t).sub(center).applyQuaternion(stationToInertial).negate();
    const axis = new Vector3(0, 0, 1).applyQuaternion(stationToInertial);
    // Use the actual ring plane, enlarged for legibility. An axisymmetric circle
    // needs only the slow attitude; omitting its fast spin avoids sample aliasing.
    const ringY = new Vector3(0, 1, 0);
    const ringX = ringY.clone().cross(axis).normalize();
    const ring = series(a => orbitProject(station.clone()
        .addScaledVector(ringX, Math.cos(a * 2 * Math.PI) * 12 / orbitScale)
        .addScaledVector(ringY, Math.sin(a * 2 * Math.PI) * 12 / orbitScale)), 32);
    const axisStart = orbitProject(station.clone().addScaledVector(axis, 24 / orbitScale));
    const axisEnd = orbitProject(station.clone().addScaledVector(axis, -24 / orbitScale));
    return {
        position: orbitProject(station),
        ringPath: `${ring.map((p, i) => `${i ? 'L' : 'M'}${round(p.x)},${round(p.y)}`).join(' ')}Z`,
        axisPath: `M${round(axisStart.x)},${round(axisStart.y)}L${round(axisEnd.x)},${round(axisEnd.y)}`,
    };
}, 240);
const orbitPositions = orbitFrames.map(frame => frame.position);
const orbitPath = orbitPositions.map((p, i) => `${i ? 'L' : 'M'}${round(p.x)},${round(p.y)}`).join(' ');
const orbitalTravel = 360 * HABITAT_ROTATION_PERIOD / STATION_ORBIT_PERIOD;
const sourceMetadata = {
    generatedFrom: ['src/presentation/habitatFrame.ts', 'src/presentation/stationOrbit.ts', 'src/presentation/bridgeMotion.ts', 'src/content/solarSystem.ts'],
    ringPeriodSeconds: HABITAT_ROTATION_PERIOD, orbitPeriodSeconds: STATION_ORBIT_PERIOD,
    orbitRadiusKm: STATION_ORBIT_RADIUS_KM, axisAngleDegrees: axisAngle,
    attitude: 'Ring -Z points to Earth; imposed kinematic attitude, without torque simulation',
    mainPlaybackSeconds: duration, mainModelSeconds: HABITAT_ROTATION_PERIOD,
    orbitPlaybackSeconds: orbitDuration, orbitModelSeconds: STATION_ORBIT_PERIOD,
    projection: '60 degree vertical perspective, initial room camera orientation; spherical disks drawn as schematic circles',
};
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="1120" viewBox="0 0 1440 1120" role="img" aria-labelledby="title desc">
<title id="title">静止观测者：地球、星环与太阳的相对运动</title>
<desc id="desc">观察者相对房间静止，随半径30公里的星环共同自转、公转。星环负Z轴始终指向地球。左图跟随环心与对地姿态，但不随快速自转；右图从房间观察，地球中心方向固定，太阳与星空反向运动。主图24秒重播一个自转周期。下图独立用32秒展示一圈公转及星环对地转向。姿态为运动学约束，不模拟控制力矩。位置采样自项目函数，图示大小与距离不全按比例。</desc>
<metadata>${JSON.stringify(sourceMetadata)}</metadata>
<defs>
  <linearGradient id="background" x2="1" y2="1"><stop stop-color="#09121f"/><stop offset="1" stop-color="#121e2c"/></linearGradient>
  <radialGradient id="planet"><stop stop-color="#173c58"/><stop offset=".72" stop-color="#102b42"/><stop offset="1" stop-color="#0c1c30"/></radialGradient>
  <radialGradient id="sunGlow"><stop stop-color="#fff7c9" stop-opacity=".9"/><stop offset=".25" stop-color="#ffc87d" stop-opacity=".25"/><stop offset="1" stop-color="#ffba65" stop-opacity="0"/></radialGradient>
  <linearGradient id="panel" x2="0" y2="1"><stop stop-color="#152434"/><stop offset="1" stop-color="#101b2a"/></linearGradient>
  <marker id="arrow-teal" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0 10 5 0 10Z" fill="#6fd4df"/></marker>
  <marker id="arrow-gold" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 10 5 0 10Z" fill="#edc47b"/></marker>
  <clipPath id="window"><rect x="550" y="264" width="820" height="374" rx="12"/></clipPath>
  <style>
    text{font-family:'Noto Sans CJK SC','Source Han Sans SC','Microsoft YaHei',sans-serif;fill:#e6edf7}
    .title{font-size:36px;font-weight:700;letter-spacing:1px}.heading{font-size:21px;font-weight:650}
    .body{font-size:17px}.small{font-size:14px;fill:#9fb1c7}.tiny{font-size:12px;fill:#8095ac}
    .eyebrow{font-size:12px;letter-spacing:2.8px;fill:#76d3dc}.number{font-size:30px;font-weight:650;fill:#7bd5df}
    .teal{fill:#7bd5df}.gold{fill:#f2ce8d}.orange{fill:#ffb290}.muted{fill:#9fb1c7}
  </style>
</defs>
<rect width="1440" height="1120" rx="20" fill="url(#background)"/>
${text(40, 36, 'DISTANT STARS  /  MOTION STUDY 01', 'eyebrow')}
${text(40, 87, '对地定向：地球停驻，星空流转', 'title')}
${text(42, 123, '人相对房间静止；星环快速自转产生重力，缓慢转向使 −Z 轴始终指向地球。', 'body muted')}
<rect x="1110" y="51" width="290" height="62" rx="12" fill="#1a2c3a" stroke="#2b4959"/>
${text(1130, 78, '同一段时间 · 两个参照系', 'body teal')}
${text(1130, 99, `主图 ${duration} 秒 = 实际 ${(HABITAT_ROTATION_PERIOD / 60).toFixed(2)} 分钟`, 'small')}

<rect x="32" y="160" width="460" height="547" rx="18" fill="url(#panel)" stroke="#263b50"/>
<rect x="512" y="160" width="896" height="547" rx="18" fill="url(#panel)" stroke="#263b50"/>
${text(57, 202, '01  环外看：人和星环一起转', 'heading')}
${text(57, 231, '跟随环心与对地转向；不随星环快速自转。', 'small')}
${text(537, 202, '02  房间里看：地球定向，太阳绕行', 'heading')}
${text(537, 231, '固定房间朝向 · 60° 垂直视场 · 虚线为太阳轨迹', 'small')}
<circle cx="1160" cy="226" r="4" fill="#79cddd"/>${text(1171, 231, '地球', 'small')}
<circle cx="1241" cy="226" r="4" fill="#f4cd82"/>${text(1252, 231, '太阳', 'small')}

<g transform="translate(262 429)">
  <circle r="174" fill="none" stroke="#253d4d" stroke-dasharray="3 8"/>
  ${line(-198, 0, 199, 0, 'stroke="#2c4255"')}${line(0, -178, 0, 182, 'stroke="#2c4255"')}
  ${text(177, -11, '+X', 'tiny')}${text(10, -169, '+Y', 'tiny')}
  <g id="rotating-ring"><animateTransform attributeName="transform" type="rotate" from="0" to="-360" dur="${duration}s" repeatCount="indefinite"/>
    <circle r="153" fill="none" stroke="#183b48" stroke-width="21"/>
    <circle r="142" fill="none" stroke="#6fd4df" stroke-width="2"/>
    <circle r="165" fill="none" stroke="#4f8995"/>
    ${ticks}${ringBuildings}
    <path d="M-25 144 A146 146 0 0 0 25 144" stroke="#ffb290" stroke-width="7" fill="none"/>
    <g transform="translate(0 127) scale(.65)" color="#ffb290">${person}</g>
    <path d="M0 90 V47" stroke="#ffb290" stroke-width="1.5" stroke-dasharray="4 4"/>
  </g>
  <circle r="5" fill="#7bd5df"/><circle r="11" fill="none" stroke="#7bd5df"/>
  ${text(0, -25, '环心 / +Z 朝向你', 'small', 'text-anchor="middle"')}
  ${text(0, 27, '−Z 指向地球（纸面向里）', 'tiny', 'text-anchor="middle"')}
  <path d="M-122 -137 A184 184 0 0 0 -179 43" fill="none" stroke="#7bd5df" stroke-width="2" marker-end="url(#arrow-teal)"/>
</g>
${text(57, 649, `自转 ${(HABITAT_ROTATION_PERIOD / 60).toFixed(2)} 分钟 / 圈 · 半径 ${HABITAT_RADIUS_M / 1000} km · 约 1 g`, 'body teal')}
${text(57, 679, '橙色：观测者及其房间，随环一起运动。', 'small')}

<rect x="550" y="264" width="820" height="374" rx="12" fill="#080f1c"/>
<g clip-path="url(#window)">
  ${stars}
  <path d="${sunTrajectory}" fill="none" stroke="#f4cd82" stroke-dasharray="3 6" opacity=".37"/>
  <g id="earth-disk" transform="translate(${earthTranslations[0]})">${translate(earthTranslations)}
    <circle r="${frames[0].radius}" fill="url(#planet)" stroke="#649eb7" stroke-width="1.2">${animate('r', frames.map(f => round(f.radius)))}</circle>
    <g transform="rotate(${frames[0].angle})"><animateTransform attributeName="transform" type="rotate" values="${frames.map(f => round(f.angle)).join(';')}" dur="${duration}s" repeatCount="indefinite"/>
      <path d="${crescent(frames[0].radius, frames[0].k)}" fill="#78d1df">${animate('d', frames.map(f => crescent(f.radius, f.k)))}</path>
    </g>
    <circle r="${frames[0].radius + 2}" fill="none" stroke="#8ee7fa" stroke-width="2" opacity=".12">${animate('r', frames.map(f => round(f.radius + 2)))}</circle>
  </g>
  <g id="sun-disk" transform="translate(${sunTranslations[0]})">${translate(sunTranslations)}
    <circle r="30" fill="url(#sunGlow)"/><circle r="2" fill="#fffbdd"/><circle r="4.5" fill="none" stroke="#fce7b4" opacity=".55"/>
  </g>
  ${line(949, 451, 971, 451, 'stroke="#607080" opacity=".6"')}${line(960, 440, 960, 462, 'stroke="#607080" opacity=".6"')}
  ${text(976, 471, '固定视线', 'tiny')}
  <path d="M941 340 A113 113 0 0 1 1037 368" stroke="#edc47b" stroke-width="1.5" fill="none" marker-end="url(#arrow-gold)"/>
  ${text(967, 327, '太阳 / 星空反向运动', 'tiny gold')}
  ${text(frames[0].e.x, frames[0].e.y + frames[0].radius + 23, '地球中心方向固定', 'small teal', 'text-anchor="middle"')}
</g>
<rect x="550" y="264" width="820" height="374" rx="12" fill="none" stroke="#506075" stroke-width="4"/>
${line(755, 265, 755, 638, 'stroke="#29394c" stroke-width="8"')}
${line(1165, 265, 1165, 638, 'stroke="#29394c" stroke-width="8"')}
<rect x="543" y="630" width="834" height="12" rx="4" fill="#43505f"/>
<g transform="translate(960 618) scale(.75)" color="#ffb290">${person}</g>
${text(550, 672, '窗框 / 房间 / 人：始终不转', 'body orange')}
${text(1030, 672, '地球不移位，明暗方向仍会变化', 'body')}

<rect x="32" y="724" width="1376" height="53" rx="12" fill="#112330"/>
${text(52, 756, '主图时间', 'small')}
<path d="M158 750 H966" stroke="#2b4356" stroke-width="3"/>
<circle cx="158" cy="750" r="6" fill="#ffb290">${animate('cx', [158, 966])}</circle>
${[0, 1, 2, 3, 4].map(i => text(158 + i * 202, 767, `${(HABITAT_ROTATION_PERIOD * i / 4).toFixed(0)} s`, 'tiny', 'text-anchor="middle"')).join('')}
${text(1010, 749, `一圈自转期间，公转仅推进 ${orbitalTravel.toFixed(2)}°`, 'small')}
${text(1010, 768, '结束回到起点，重播同一段时间。', 'tiny')}

<rect x="32" y="794" width="1376" height="257" rx="18" fill="url(#panel)" stroke="#263b50"/>
${text(57, 831, '03  绕地公转时，星环同步缓慢转向', 'heading')}
<g transform="translate(0 35)">
  <path d="${orbitPath}" fill="none" stroke="#47687d" stroke-width="1.5" stroke-dasharray="4 6"/>
  <circle cx="255" cy="891" r="${orbitDisplayRadius * EARTH_BODY.radiusKm / STATION_ORBIT_RADIUS_KM}" fill="url(#planet)" stroke="#7ac9dd"/>
  ${text(255, 896, '地球', 'small', 'text-anchor="middle"')}
  <g id="orbiting-ring">
    <path id="earth-pointing-axis" d="${orbitFrames[0].axisPath}" stroke="#7bd5df" opacity=".9" stroke-dasharray="2 3" marker-end="url(#arrow-teal)">${animate('d', orbitFrames.map(f => f.axisPath), orbitDuration)}</path>
    <path id="orbit-ring-plane" d="${orbitFrames[0].ringPath}" fill="#142b37" stroke="#ffb290" stroke-width="2">${animate('d', orbitFrames.map(f => f.ringPath), orbitDuration)}</path>
  </g>
  <circle cx="${insetSun.x}" cy="${insetSun.y}" r="20" fill="url(#sunGlow)"/><circle cx="${insetSun.x}" cy="${insetSun.y}" r="6" fill="#ffe2a2"/>
  ${text(insetSun.x + 20, insetSun.y + 5, '太阳', 'small gold')}
  ${line(255 + (insetSun.x - 255) * .87, 891 + (insetSun.y - 891) * .87, 255 + (insetSun.x - 255) * .25, 891 + (insetSun.y - 891) * .25, 'stroke="#edc47b" stroke-width="1.4" marker-end="url(#arrow-gold)"')}
</g>
${text(58, 1035, `独立加速：${orbitDuration} 秒 = 一圈公转；青色箭头朝向地球。`, 'tiny')}
${text(523, 891, `${(STATION_ORBIT_PERIOD / 3600).toFixed(2)} 小时 / 圈`, 'number')}
${text(523, 925, `轨道半径 ${Math.round(STATION_ORBIT_RADIUS_KM).toLocaleString('en-US')} km`, 'body')}
${text(523, 956, `一圈公转 ≈ ${(STATION_ORBIT_PERIOD / HABITAT_ROTATION_PERIOD).toFixed(2)} 圈星环自转`, 'body')}
${text(523, 997, `自转轴与公转轴夹角约 ${axisAngle.toFixed(2)}°。`, 'small teal')}
${text(523, 1021, '每公转一圈，中心轴同步转向一圈。', 'small')}
${line(996, 867, 996, 1022, 'stroke="#2b4053"')}
${text(1025, 891, '这幅图保留了什么？', 'body')}
${text(1025, 923, '地球、太阳中心的位置取自项目函数。', 'small')}
${text(1025, 952, '对地定向与自转叠加，地球方向固定。', 'small')}
${text(1025, 981, '太阳沿用固定历元，不演示年度公转。', 'small')}
${text(1025, 1010, '按运动学约束定向，未模拟控制力矩。', 'small')}

${text(40, 1080, '依据 habitatFrame.ts · stationOrbit.ts · bridgeMotion.ts · solarSystem.ts  /  当前工作区实现', 'tiny')}
${text(40, 1102, `圆盘与明暗为示意；下图星环放大、日地距离压缩。省略地球纹理约 ${EARTH_SIDEREAL_DAY_SECONDS / 3600} h 自转，星环截面省略 ${HABITAT_HALF_WIDTH_M * 2 / 1000} km 轴向长度。`, 'tiny')}
</svg>`;

const html = `<!doctype html>
<html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>静止观测者 · 地球 / 星环 / 太阳</title>
<style>
  *{box-sizing:border-box}body{margin:0;background:#080f18;color:#e6edf7;font-family:'Noto Sans CJK SC','Source Han Sans SC',sans-serif}
  main{max-width:1440px;margin:auto}svg{display:block;width:100%;height:auto}
  .controls{position:sticky;bottom:0;display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:14px 24px;background:#142333f5;border-top:1px solid #344c60}
  button,select,a{border:1px solid #4d687c;border-radius:8px;background:#1c3446;color:#e6edf7;padding:8px 14px;font:inherit;font-size:14px;text-decoration:none;cursor:pointer}
  button:hover,a:hover{background:#29495b}input{flex:1;min-width:110px;accent-color:#7bd5df}label,output{font-size:13px;color:#b9cbdd}a{margin-left:auto}
  @media(max-width:700px){main{overflow:auto}svg{min-width:920px}.controls{gap:8px;padding:10px}a{margin-left:0}}
</style>
<main>${svg}</main>
<div class="controls" aria-label="动画播放控制">
<button id="play" type="button">暂停</button><button id="reset" type="button">回到起点</button>
<label for="speed">播放</label><select id="speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option></select>
<label for="scrub">主图</label><input id="scrub" type="range" min="0" max="24" step="0.01" value="0" aria-label="主图时间进度"><output id="time">0.0 / ${HABITAT_ROTATION_PERIOD.toFixed(1)} s</output>
<a href="observer-motion.svg" download>下载 SVG 动画</a>
</div>
<script>
const svg = document.querySelector('svg');
const play = document.getElementById('play'), scrub = document.getElementById('scrub'), time = document.getElementById('time');
let paused = matchMedia('(prefers-reduced-motion: reduce)').matches, elapsed = 0, previous = null;
svg.pauseAnimations();
function render(){svg.setCurrentTime(elapsed);scrub.value=elapsed%24;time.value=((elapsed%24)/24*${HABITAT_ROTATION_PERIOD}).toFixed(1)+' / ${HABITAT_ROTATION_PERIOD.toFixed(1)} s';play.textContent=paused?'播放':'暂停';}
play.addEventListener('click',()=>{paused=!paused;render()});
document.getElementById('reset').addEventListener('click',()=>{elapsed=0;render()});
scrub.addEventListener('input',()=>{paused=true;elapsed=Number(scrub.value);render()});
document.addEventListener('visibilitychange',()=>{previous=null});
function tick(now){if(previous!==null&&!paused&&!document.hidden)elapsed+=(now-previous)/1000*Number(document.getElementById('speed').value);previous=now;render();requestAnimationFrame(tick)}
render();requestAnimationFrame(tick);
</script></html>`;

const output = fileURLToPath(new URL('../../public/diagrams/', import.meta.url));
mkdirSync(output, { recursive: true });
writeFileSync(`${output}observer-motion.svg`, svg);
writeFileSync(`${output}observer-motion.html`, html);
console.log(JSON.stringify({ output, ...sourceMetadata, ringRpm: HABITAT_RPM }, null, 2));
