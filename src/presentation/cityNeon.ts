import * as THREE from 'three';

type Triple = [number, number, number];
/** Saturated accents reserved for adverts and station identifiers. */
export const NEON_COLORS: readonly Triple[] = [[1, .12, .62], [.1, .86, 1], [.62, .26, 1], [1, .58, .14], [.2, 1, .62], [1, .2, .25]];
export const ADVERT_HORIZONTAL_COUNT = 16;
export const ADVERT_VERTICAL_COUNT = 16;

const HORIZONTAL: [string, string, string, string][] = [
    ['星槎航运', 'STARRAFT LINES · 月面直达 3H', '#0b2a6b', '#39c6ff'],
    ['星云可乐', 'NEBULA COLA · 零重力气泡', '#3a0747', '#ff4fd8'],
    ['曙光城', 'AURORA CITY · EST. 2180', '#2d1a02', '#ffc24a'],
    ['量子拉面', 'QUANTUM RAMEN · 24H', '#3b0606', '#ff5a3c'],
    ['赫利俄斯', 'HELIOS FUSION · 聚变能源', '#301600', '#ff9a1f'],
    ['轨道度假村', 'ORBITAL RESORT · 失重泳池', '#032c2c', '#3ff2d0'],
    ['CAT-9', '仿生猫 · 你的赛博伙伴', '#330a26', '#ff7ab8'],
    ['深空现场', 'DEEP SPACE LIVE · 今夜', '#170a3d', '#9b6bff'],
    ['月球移民局', 'LUNA SETTLEMENT BUREAU', '#101820', '#d6e4f0'],
    ['天穹银行', 'SKYVAULT BANK · 星际结算', '#062014', '#43ff9a'],
    ['火星红', 'MARS RED · 奥林帕斯酒庄', '#2a0508', '#ff3448'],
    ['星环轻轨', 'RING METRO · 全线贯通', '#04213a', '#4fb3ff'],
    ['AI 医生', '7 × 24 · 义体维护', '#08262a', '#56f0ff'],
    ['绿洲农场', 'OASIS FARMS · 舱内新鲜', '#0e2a07', '#8dff4a'],
    ['跃迁快递', 'WARP EXPRESS · 次日达', '#2b1c00', '#ffd23a'],
    ['记忆云', 'MEMORY CLOUD · 永不遗忘', '#1a0b33', '#c07bff'],
];
const VERTICAL: [string, string][] = [
    ['拉面屋', '#ff5a3c'], ['霓虹酒吧', '#ff4fd8'], ['义体诊所', '#56f0ff'], ['太空旅馆', '#ffc24a'],
    ['星海电玩', '#9b6bff'], ['寿司', '#ff3448'], ['赛博茶馆', '#43ff9a'], ['药局', '#39c6ff'],
    ['夜市', '#ffd23a'], ['零重力', '#3ff2d0'], ['占卜', '#c07bff'], ['电器街', '#4fb3ff'],
    ['咖啡', '#ff9a1f'], ['天梯站', '#d6e4f0'], ['猫咖', '#ff7ab8'], ['歌厅', '#ff4fd8'],
];

function drawAtlas(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 2048, 2048);
    const font = '"Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif';
    HORIZONTAL.forEach(([title, subtitle, background, accent], i) => {
        const x = (i % 4) * 512, y = Math.floor(i / 4) * 256;
        const gradient = ctx.createLinearGradient(x, y, x + 512, y + 256);
        // Saturated screens: from a distance an advert should read as a patch of colour, not a dark panel.
        gradient.addColorStop(0, accent); gradient.addColorStop(.45, background); gradient.addColorStop(1, accent);
        ctx.fillStyle = gradient; ctx.fillRect(x + 4, y + 4, 504, 248);
        ctx.save();
        ctx.beginPath(); ctx.rect(x + 4, y + 4, 504, 248); ctx.clip();
        ctx.globalAlpha = .45; ctx.fillStyle = '#ffffff';
        // A bold graphic motif per brand: rings, stripes or a disc.
        if (i % 3 === 0) for (let r = 40; r < 260; r += 36) { ctx.lineWidth = 6; ctx.strokeStyle = accent; ctx.beginPath(); ctx.arc(x + 420, y + 128, r, 0, Math.PI * 2); ctx.stroke(); }
        else if (i % 3 === 1) for (let s = -256; s < 512; s += 44) { ctx.beginPath(); ctx.moveTo(x + s, y + 256); ctx.lineTo(x + s + 22, y + 256); ctx.lineTo(x + s + 278, y); ctx.lineTo(x + s + 256, y); ctx.fill(); }
        else { ctx.beginPath(); ctx.arc(x + 410, y + 110, 90, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
        ctx.shadowColor = accent; ctx.shadowBlur = 18;
        ctx.strokeStyle = accent; ctx.lineWidth = 5; ctx.strokeRect(x + 10, y + 10, 492, 236);
        ctx.fillStyle = '#ffffff'; ctx.font = `bold 84px ${font}`; ctx.textBaseline = 'middle';
        ctx.fillText(title, x + 34, y + 104, 440);
        ctx.fillStyle = accent; ctx.font = `bold 28px ${font}`;
        ctx.fillText(subtitle, x + 36, y + 190, 440);
        ctx.shadowBlur = 0;
    });
    VERTICAL.forEach(([text, accent], i) => {
        const x = i * 128, y = 1024;
        const glow = ctx.createLinearGradient(x, 0, x + 128, 0);
        glow.addColorStop(0, '#07060d'); glow.addColorStop(.5, accent); glow.addColorStop(1, '#07060d');
        ctx.globalAlpha = .55; ctx.fillStyle = glow; ctx.fillRect(x + 4, y + 4, 120, 1016); ctx.globalAlpha = 1;
        ctx.shadowColor = accent; ctx.shadowBlur = 16;
        ctx.strokeStyle = accent; ctx.lineWidth = 5; ctx.strokeRect(x + 12, y + 12, 104, 1000);
        ctx.fillStyle = '#fff'; ctx.font = `bold 92px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const characters = [...text], step = Math.min(200, 900 / characters.length);
        characters.forEach((character, k) => ctx.fillText(character, x + 64, y + 512 + (k - (characters.length - 1) / 2) * step));
        ctx.textAlign = 'start'; ctx.shadowBlur = 0;
    });
}

/** Screens cycle through the horizontal adverts; vertical signs keep one shop name each. */
export function createAdvertMaterial(time: THREE.IUniform<number>, ownedTextures: Set<THREE.Texture>) {
    let texture: THREE.Texture;
    if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 2048;
        drawAtlas(canvas);
        texture = new THREE.CanvasTexture(canvas);
        texture.anisotropy = 8; texture.generateMipmaps = true; texture.minFilter = THREE.LinearMipmapLinearFilter;
    } else texture = new THREE.DataTexture(new Uint8Array([255, 80, 200, 255]), 1, 1);
    texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true;
    ownedTextures.add(texture);
    const material = new THREE.MeshBasicMaterial({ map: texture, color: new THREE.Color(1.6, 1.6, 1.6), side: THREE.DoubleSide });
    material.onBeforeCompile = shader => {
        shader.uniforms.uTime = time;
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nattribute vec2 advert;\nuniform float uTime;')
            .replace('#include <uv_vertex>', `#include <uv_vertex>
                if (advert.y > .5) vMapUv = vec2((mod(advert.x, ${ADVERT_VERTICAL_COUNT}.0) + uv.x) / 16.0, uv.y * .5);
                else {
                    float cell = mod(advert.x + floor(uTime / 9.0 + fract(advert.x * .37)), ${ADVERT_HORIZONTAL_COUNT}.0);
                    vMapUv = vec2((mod(cell, 4.0) + uv.x) / 4.0, 1.0 - (floor(cell / 4.0) + 1.0 - uv.y) * .125);
                }`);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform float uTime;')
            .replace('#include <map_fragment>', `#include <map_fragment>
                diffuseColor.rgb *= (.975 + .025 * sin(vMapUv.y * 3000.0)) * (.99 + .01 * sin(uTime * 19.0 + vMapUv.x * 37.0));`);
    };
    material.customProgramCacheKey = () => 'city-advert-screen-v1';
    return material;
}

/** Each instanced advert batch needs its own plane, because the atlas cell is a per-instance attribute. */
export function advertGeometry(adverts: readonly { index: number; vertical: boolean }[]) {
    const geometry = new THREE.PlaneGeometry(1, 1);
    geometry.setAttribute('advert', new THREE.InstancedBufferAttribute(new Float32Array(adverts.flatMap(a => [a.index, a.vertical ? 1 : 0])), 2));
    return geometry;
}
