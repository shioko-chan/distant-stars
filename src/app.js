import * as THREE from "./vendor/three.module.js";
import { OrbitControls } from "./vendor/OrbitControls.js";

const balanceResponse = await fetch(new URL("./data/game-balance.json", import.meta.url));
if (!balanceResponse.ok) throw new Error(`Failed to load game balance: ${balanceResponse.status}`);
const GAME_BALANCE = await balanceResponse.json();
const TERRAIN = GAME_BALANCE.terrain;
const RESOURCES = GAME_BALANCE.resourceNodes;
const ECONOMY_RESOURCES = GAME_BALANCE.economyResources;
const DISTRICTS = Object.fromEntries(Object.entries(GAME_BALANCE.districts).map(([key, district]) => [key, {
  name: district.name,
  color: district.color,
  bonus: district.bonus,
}]));
const DISTRICT_ECONOMY = Object.fromEntries(Object.entries(GAME_BALANCE.districts)
  .filter(([, district]) => district.economy)
  .map(([key, district]) => [key, district.economy]));
const HUBS = GAME_BALANCE.hubs;
const MODIFIERS = GAME_BALANCE.modifiers;
const SIMULATION = GAME_BALANCE.simulation;

const canvas = document.querySelector("#planetCanvas");
const stage = document.querySelector("#simStage");
const tooltip = document.querySelector("#mapTooltip");
const contextMenu = document.querySelector("#contextMenu");
const breadcrumb = document.querySelector("#breadcrumb");
const viewIndicator = document.querySelector("#viewIndicator");
const interactionHint = document.querySelector("#interactionHint");
const selectedPanel = document.querySelector("#selectedPanel");
const resourceLegend = document.querySelector("#resourceLegend");
const terrainKey = document.querySelector("#terrainKey");
const planetStats = document.querySelector("#planetStats");
const levelScale = document.querySelector("#levelScale");
const hubCount = document.querySelector("#hubCount");
const eventLog = document.querySelector("#eventLog");
const gameClock = document.querySelector("#gameClock");
const speedControls = document.querySelector("#speedControls");
const timeRate = document.querySelector("#timeRate");
const economyPanel = document.querySelector("#economyPanel");
const economyStatus = document.querySelector("#economyStatus");
const economyFoot = document.querySelector("#economyFoot");

const REGION_NAMES = [
  "晨曦海", "北辰高地", "赫利俄斯平原", "苍绿裂谷", "赤砂盆地", "极光冰盖",
  "西风群山", "远望台地", "沉星海", "灰烬荒原", "翡翠林带", "天穹丘陵",
  "南冠冰原", "静海沿岸", "长昼平原", "断脊山脉", "潮汐群岛", "赤道雨林",
  "暮色沙海", "银湾", "风暴高原", "新月大陆",
];

const state = {
  view: "macro",
  selectedRegion: null,
  selectedMeso: null,
  selectedObject: null,
  hoveredObject: null,
  pointer: new THREE.Vector2(),
  currentHour: 0,
  speed: SIMULATION.defaultSpeed,
  simulationAccumulator: 0,
  lastSimulationTime: null,
  economy: { ...SIMULATION.initialEconomy },
  economyDelta: {
    ...SIMULATION.baseHourly,
    food: SIMULATION.baseHourly.food - SIMULATION.initialPopulation / SIMULATION.foodConsumptionPopulationDivisor,
  },
  population: SIMULATION.initialPopulation,
  events: [
    { title: "殖民纪元开始", text: "2100年01月01日 00:00，行星建设协议正式生效。" },
    { title: "地表扫描完成", text: "22 个连续地貌区已建立索引。" },
    { title: "建设协议待命", text: "双击地貌区以展开中观规划地图。" },
  ],
};

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.setClearColor(0x05070a, 1);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x070a0e, 0.018);

const camera = new THREE.PerspectiveCamera(42, stage.clientWidth / stage.clientHeight, 0.1, 300);
camera.position.set(0, 1.8, 14.5);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 7.2;
controls.maxDistance = 24;
controls.enablePan = false;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.32;

scene.add(new THREE.HemisphereLight(0xb9dbea, 0x152116, 1.55));
const sun = new THREE.DirectionalLight(0xfff2d6, 3.2);
sun.position.set(7, 5, 8);
scene.add(sun);
const rim = new THREE.DirectionalLight(0x65a9c9, 1.4);
rim.position.set(-7, 1, -5);
scene.add(rim);

const worldRoot = new THREE.Group();
scene.add(worldRoot);

const raycaster = new THREE.Raycaster();
let pickables = [];
let clickTimer = null;
let cameraTween = null;
let macroDevelopmentLayer = null;

function seededNoise(a, b = 0, c = 0) {
  const value = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
  return value - Math.floor(value);
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function smooth(value) {
  return value * value * (3 - 2 * value);
}

function interpolate(a, b, amount) {
  return a + (b - a) * amount;
}

function valueNoise2D(x, y, seed = 0) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const a = interpolate(seededNoise(x0 + seed * 17, y0, seed), seededNoise(x0 + 1 + seed * 17, y0, seed), tx);
  const b = interpolate(seededNoise(x0 + seed * 17, y0 + 1, seed), seededNoise(x0 + 1 + seed * 17, y0 + 1, seed), tx);
  return interpolate(a, b, ty);
}

function valueNoise3D(x, y, z, seed = 0) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const tz = smooth(z - z0);
  const layer = (oz) => {
    const a = interpolate(
      seededNoise(x0 + seed * 19, y0, z0 + oz + seed),
      seededNoise(x0 + 1 + seed * 19, y0, z0 + oz + seed),
      tx,
    );
    const b = interpolate(
      seededNoise(x0 + seed * 19, y0 + 1, z0 + oz + seed),
      seededNoise(x0 + 1 + seed * 19, y0 + 1, z0 + oz + seed),
      tx,
    );
    return interpolate(a, b, ty);
  };
  return interpolate(layer(0), layer(1), tz);
}

function fractalNoise2D(x, y, seed, octaves = 5) {
  let amplitude = 0.55;
  let frequency = 1;
  let total = 0;
  let weight = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += valueNoise2D(x * frequency, y * frequency, seed + octave * 7) * amplitude;
    weight += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return total / weight;
}

function fractalNoise3D(x, y, z, seed, octaves = 5) {
  let amplitude = 0.56;
  let frequency = 1;
  let total = 0;
  let weight = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    total += valueNoise3D(x * frequency, y * frequency, z * frequency, seed + octave * 11) * amplitude;
    weight += amplitude;
    amplitude *= 0.5;
    frequency *= 2.04;
  }
  return total / weight;
}

function classifyTerrain(elevation, moisture, temperature) {
  if (elevation < 0) return temperature < 0.17 ? "ice" : "ocean";
  if (temperature < 0.14) return "ice";
  if (elevation > 0.28) return "mountain";
  if (moisture < 0.34 && temperature > 0.42) return "desert";
  if (moisture > 0.58) return "forest";
  return "plains";
}

function samplePlanet(direction) {
  const continental = fractalNoise3D(
    direction.x * 1.32 + 7.1,
    direction.y * 1.32 - 3.8,
    direction.z * 1.32 + 1.9,
    31,
    6,
  );
  const ridgeSource = fractalNoise3D(
    direction.x * 3.8 - 4.2,
    direction.y * 3.8 + 8.4,
    direction.z * 3.8 - 1.7,
    73,
    4,
  );
  const detail = fractalNoise3D(direction.x * 8.5, direction.y * 8.5, direction.z * 8.5, 109, 3);
  const ridge = 1 - Math.abs(ridgeSource * 2 - 1);
  const land = (continental - 0.515) * 1.5;
  const elevation = clamp(land + Math.max(0, ridge - 0.68) * 0.72 + (detail - 0.5) * 0.1, -0.28, 0.62);
  const moisture = fractalNoise3D(
    direction.x * 2.7 + 11,
    direction.y * 2.7 - 6,
    direction.z * 2.7 + 3,
    151,
    4,
  );
  const temperature = clamp(1 - Math.abs(direction.y) * 1.16 - Math.max(0, elevation) * 0.8);
  return { elevation, moisture, temperature, terrain: classifyTerrain(elevation, moisture, temperature) };
}

const LOCAL_BASE_ELEVATION = {
  ocean: -0.12,
  plains: 0.11,
  forest: 0.14,
  desert: 0.09,
  mountain: 0.34,
  ice: 0.07,
};

function sampleRegionTerrain(regionId, u, v, parentTerrain) {
  const seedOffset = regionId * 3.71;
  const broad = fractalNoise2D(u * 2.15 + seedOffset, v * 2.15 - seedOffset * 0.37, regionId + 211, 5);
  const ridgeNoise = fractalNoise2D(u * 5.8 - seedOffset * 0.2, v * 5.8 + seedOffset, regionId + 307, 4);
  const detail = fractalNoise2D(u * 15.5 + seedOffset, v * 15.5, regionId + 401, 3);
  const ridge = 1 - Math.abs(ridgeNoise * 2 - 1);
  const mountainWeight = parentTerrain === "mountain" ? 0.42 : 0.19;
  const elevation = clamp(
    LOCAL_BASE_ELEVATION[parentTerrain]
      + (broad - 0.5) * 0.38
      + Math.max(0, ridge - 0.7) * mountainWeight
      + (detail - 0.5) * 0.06,
    -0.2,
    0.72,
  );
  const moistureBias = parentTerrain === "forest" ? 0.18 : parentTerrain === "desert" ? -0.2 : 0;
  const moisture = clamp(fractalNoise2D(u * 3.4 + 19, v * 3.4 - 7, regionId + 503, 4) + moistureBias);
  const latitudeTemperature = parentTerrain === "ice" ? 0.1 : parentTerrain === "desert" ? 0.82 : 0.56;
  const temperature = clamp(latitudeTemperature - Math.max(0, elevation) * 0.58);
  return { elevation, moisture, temperature, terrain: classifyTerrain(elevation, moisture, temperature) };
}

function sampleMicroTerrain(regionId, mesoX, mesoY, u, v, parentTerrain) {
  const globalU = (mesoX + u) / 8;
  const globalV = (mesoY + v) / 8;
  const base = sampleRegionTerrain(regionId, globalU, globalV, parentTerrain);
  const localSeed = regionId * 64 + mesoY * 8 + mesoX;
  const detail = fractalNoise2D(u * 4.2 + localSeed * 0.31, v * 4.2 - localSeed * 0.17, localSeed + 601, 4);
  const drainageSource = fractalNoise2D(u * 7.5 - localSeed * 0.08, v * 7.5 + localSeed * 0.12, localSeed + 701, 3);
  const drainage = 1 - Math.abs(drainageSource * 2 - 1);
  const relief = parentTerrain === "mountain" ? 0.18 : parentTerrain === "ocean" ? 0.035 : 0.11;
  const elevation = clamp(
    base.elevation + (detail - 0.5) * relief + Math.max(0, drainage - 0.82) * relief * 0.65,
    -0.2,
    0.76,
  );
  const moisture = clamp(base.moisture + (drainage - 0.5) * 0.1);
  return {
    elevation,
    moisture,
    temperature: base.temperature,
    terrain: classifyTerrain(elevation, moisture, base.temperature),
  };
}

function sphericalPosition(lat, lon, radius) {
  const cosLat = Math.cos(lat);
  return new THREE.Vector3(
    radius * cosLat * Math.cos(lon),
    radius * Math.sin(lat),
    radius * cosLat * Math.sin(lon),
  );
}

function resourceFor(terrain, seed) {
  const n = seededNoise(seed, 17);
  if (n < 0.46) return null;
  if (terrain === "mountain") return "mineral";
  if (terrain === "plains" || terrain === "forest") return n > 0.74 ? "fertile" : "energy";
  if (terrain === "ocean") return "energy";
  if (terrain === "ice") return n > 0.78 ? "relic" : "energy";
  return n > 0.8 ? "relic" : "mineral";
}

function dominantTerrainAround(center, seed) {
  const reference = Math.abs(center.y) > 0.85 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const tangentA = new THREE.Vector3().crossVectors(reference, center).normalize();
  const tangentB = new THREE.Vector3().crossVectors(center, tangentA).normalize();
  const counts = new Map();
  const samples = [center.clone()];
  for (const angle of [0.18, 0.34]) {
    for (let index = 0; index < 8; index += 1) {
      const theta = (index / 8) * Math.PI * 2 + seededNoise(seed, angle) * 0.18;
      const radial = tangentA.clone().multiplyScalar(Math.cos(theta)).addScaledVector(tangentB, Math.sin(theta));
      samples.push(center.clone().multiplyScalar(Math.cos(angle)).addScaledVector(radial, Math.sin(angle)).normalize());
    }
  }
  samples.forEach((position) => {
    const terrain = samplePlanet(position).terrain;
    counts.set(terrain, (counts.get(terrain) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function createRegions() {
  const count = REGION_NAMES.length;
  return Array.from({ length: count }, (_, index) => {
    const y = 1 - (index / (count - 1)) * 2;
    const radius = Math.sqrt(1 - y * y);
    const theta = Math.PI * (3 - Math.sqrt(5)) * index + 0.38;
    const center = new THREE.Vector3(Math.cos(theta) * radius, y, Math.sin(theta) * radius).normalize();
    const terrain = dominantTerrainAround(center, index);
    return {
      id: index,
      name: REGION_NAMES[index],
      center,
      terrain,
      resource: resourceFor(terrain, index),
      districts: 0,
      population: Math.round(0.4 + seededNoise(index, 29) * 4.8),
      meso: createMesoCells(index, terrain),
    };
  });
}

function createMesoCells(regionId, parentTerrain) {
  return Array.from({ length: 64 }, (_, index) => {
    const x = index % 8;
    const y = Math.floor(index / 8);
    const sample = sampleRegionTerrain(regionId, (x + 0.5) / 8, (y + 0.5) / 8, parentTerrain);
    const terrain = sample.terrain;
    const resource = seededNoise(regionId * 9 + x, y, 21) > 0.82
      ? resourceFor(terrain, regionId * 64 + index)
      : null;
    return {
      id: index,
      x,
      y,
      terrain,
      elevation: sample.elevation,
      moisture: sample.moisture,
      resource,
      district: "none",
      hub: null,
      development: 0,
      micro: createMicroCells(regionId, index, parentTerrain, x, y),
    };
  });
}

function createMicroCells(regionId, mesoId, regionTerrain, mesoX, mesoY) {
  return Array.from({ length: 64 }, (_, index) => {
    const x = index % 8;
    const y = Math.floor(index / 8);
    const sample = sampleMicroTerrain(regionId, mesoX, mesoY, (x + 0.5) / 8, (y + 0.5) / 8, regionTerrain);
    return {
      id: index,
      x,
      y,
      terrain: sample.terrain,
      elevation: sample.elevation,
      moisture: sample.moisture,
      resource: seededNoise(regionId + mesoId, index, 91) > 0.95
        ? resourceFor(sample.terrain, regionId * 4096 + mesoId * 64 + index)
        : null,
      district: "none",
      hub: null,
      development: 0,
    };
  });
}

const regions = createRegions();

function clearWorld() {
  pickables = [];
  macroDevelopmentLayer = null;
  while (worldRoot.children.length) {
    const child = worldRoot.children.pop();
    child.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
  }
}

function regionDevelopmentProfile(region) {
  const byDistrict = new Map();
  let total = 0;
  const add = (district, amount) => {
    if (district === "none" || amount <= 0) return;
    byDistrict.set(district, (byDistrict.get(district) || 0) + amount);
    total += amount;
  };
  region.meso.forEach((meso) => {
    if (meso.district !== "none") {
      add(meso.district, meso.development || 0);
    } else {
      meso.micro.forEach((cell) => add(cell.district, (cell.development || 0) * SIMULATION.scale.microEconomy));
    }
  });
  return {
    total,
    districts: [...byDistrict.entries()].sort((a, b) => b[1] - a[1]),
  };
}

function regionBuildAnchor(region) {
  const candidates = [region.center.clone()];
  const reference = Math.abs(region.center.y) > 0.85 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const tangentA = new THREE.Vector3().crossVectors(reference, region.center).normalize();
  const tangentB = new THREE.Vector3().crossVectors(region.center, tangentA).normalize();
  for (const angle of [0.16, 0.28, 0.38]) {
    for (let index = 0; index < 8; index += 1) {
      const theta = index / 8 * Math.PI * 2;
      const radial = tangentA.clone().multiplyScalar(Math.cos(theta)).addScaledVector(tangentB, Math.sin(theta));
      candidates.push(region.center.clone().multiplyScalar(Math.cos(angle)).addScaledVector(radial, Math.sin(angle)).normalize());
    }
  }
  return candidates.find((candidate) => {
    const terrain = samplePlanet(candidate).terrain;
    return nearestRegion(candidate) === region && terrain !== "ocean";
  }) || region.center.clone();
}

function addStars() {
  const positions = [];
  for (let index = 0; index < 720; index += 1) {
    const radius = 45 + seededNoise(index, 2) * 90;
    const theta = seededNoise(index, 3) * Math.PI * 2;
    const phi = Math.acos(2 * seededNoise(index, 5) - 1);
    positions.push(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta),
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const stars = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ color: 0xb8cbd2, size: 0.12, transparent: true, opacity: 0.72 }),
  );
  worldRoot.add(stars);
}

function nearestRegion(position) {
  let best = regions[0];
  let bestDot = -Infinity;
  for (const region of regions) {
    const dot = position.dot(region.center);
    if (dot > bestDot) {
      bestDot = dot;
      best = region;
    }
  }
  return best;
}

function terrainColor(sample, tintSeed = 0) {
  const color = new THREE.Color(TERRAIN[sample.terrain].color);
  const reliefLightness = sample.terrain === "ocean"
    ? sample.elevation * 0.06
    : clamp(sample.elevation, 0, 0.65) * 0.18;
  color.offsetHSL((seededNoise(tintSeed, 67) - 0.5) * 0.025, 0, reliefLightness);
  return color;
}

function planetSurfaceRadius(sample) {
  if (sample.elevation < 0) return 4.965 + sample.elevation * 0.035;
  return 5 + sample.elevation * 0.68;
}

function refreshMacroDevelopment() {
  if (state.view !== "macro") return;
  if (macroDevelopmentLayer?.parent) {
    macroDevelopmentLayer.parent.remove(macroDevelopmentLayer);
    macroDevelopmentLayer.traverse((object) => {
      object.geometry?.dispose();
      object.material?.dispose();
    });
  }
  macroDevelopmentLayer = new THREE.Group();
  worldRoot.add(macroDevelopmentLayer);

  regions.forEach((region) => {
    const profile = regionDevelopmentProfile(region);
    if (profile.total <= 0) return;
    const normal = regionBuildAnchor(region);
    const sample = samplePlanet(normal);
    const surfaceRadius = planetSurfaceRadius(sample) + 0.018;
    const cluster = new THREE.Group();
    cluster.position.copy(normal).multiplyScalar(surfaceRadius);
    cluster.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    macroDevelopmentLayer.add(cluster);

    const clusterCount = Math.min(10, Math.max(3, Math.ceil(Math.sqrt(profile.total) * 1.8)));
    const intensity = clamp(profile.total / 12, 0.25, 1);
    const footprint = new THREE.Mesh(
      new THREE.TorusGeometry(0.14 + intensity * 0.055, 0.014, 6, 24),
      new THREE.MeshBasicMaterial({
        color: DISTRICTS[profile.districts[0][0]].color,
        transparent: true,
        opacity: 0.9,
      }),
    );
    footprint.rotation.x = Math.PI / 2;
    footprint.position.y = 0.012;
    cluster.add(footprint);
    for (let index = 0; index < clusterCount; index += 1) {
      const district = profile.districts[index % profile.districts.length][0];
      const angle = index / clusterCount * Math.PI * 2 + seededNoise(region.id, index) * 0.5;
      const distance = index === 0 ? 0 : 0.07 + (index % 3) * 0.035;
      const height = 0.09 + intensity * 0.16 + seededNoise(index, region.id, 83) * 0.075;
      const width = district === "agriculture" ? 0.1 : district === "industrial" ? 0.078 : 0.055;
      const material = new THREE.MeshStandardMaterial({
        color: DISTRICTS[district].color,
        emissive: DISTRICTS[district].color,
        emissiveIntensity: district === "agriculture" ? 0.15 : 0.55,
        roughness: 0.48,
        metalness: 0.25,
      });
      const geometry = district === "research"
        ? new THREE.CylinderGeometry(width * 0.55, width, height, 8)
        : district === "military"
          ? new THREE.CylinderGeometry(width, width * 1.25, height * 0.65, 6)
          : new THREE.BoxGeometry(width, height, width);
      const structure = new THREE.Mesh(geometry, material);
      structure.position.set(Math.cos(angle) * distance, height / 2, Math.sin(angle) * distance);
      cluster.add(structure);
      if (district === "residential" || district === "research") {
        const beacon = new THREE.Mesh(
          new THREE.SphereGeometry(width * 0.28, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0xaaf4e8 }),
        );
        beacon.position.set(structure.position.x, height + width * 0.12, structure.position.z);
        cluster.add(beacon);
      }
    }
  });
}

function buildMacroView() {
  clearWorld();
  addStars();
  const regionVertices = new Map(regions.map((region) => [region.id, []]));
  const regionColors = new Map(regions.map((region) => [region.id, []]));
  const longitudeSegments = 112;
  const latitudeSegments = 56;

  for (let row = 0; row < latitudeSegments; row += 1) {
    const latA = -Math.PI / 2 + (row / latitudeSegments) * Math.PI;
    const latB = -Math.PI / 2 + ((row + 1) / latitudeSegments) * Math.PI;
    for (let column = 0; column < longitudeSegments; column += 1) {
      const lonA = -Math.PI + (column / longitudeSegments) * Math.PI * 2;
      const lonB = -Math.PI + ((column + 1) / longitudeSegments) * Math.PI * 2;
      const center = sphericalPosition((latA + latB) / 2, (lonA + lonB) / 2, 1).normalize();
      const region = nearestRegion(center);
      const directions = [
        sphericalPosition(latA, lonA, 1).normalize(),
        sphericalPosition(latB, lonA, 1).normalize(),
        sphericalPosition(latB, lonB, 1).normalize(),
        sphericalPosition(latA, lonB, 1).normalize(),
      ];
      const samples = directions.map(samplePlanet);
      const [a, b, c, d] = directions.map((direction, index) => direction.multiplyScalar(planetSurfaceRadius(samples[index])));
      const colors = samples.map((sample) => terrainColor(sample, region.id));
      regionVertices.get(region.id).push(
        ...a.toArray(), ...b.toArray(), ...d.toArray(),
        ...b.toArray(), ...c.toArray(), ...d.toArray(),
      );
      regionColors.get(region.id).push(
        ...colors[0].toArray(), ...colors[1].toArray(), ...colors[3].toArray(),
        ...colors[1].toArray(), ...colors[2].toArray(), ...colors[3].toArray(),
      );
    }
  }

  for (const region of regions) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(regionVertices.get(region.id), 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(regionColors.get(region.id), 3));
    geometry.computeVertexNormals();
    const baseColor = new THREE.Color(0xffffff);
    const material = new THREE.MeshStandardMaterial({
      color: baseColor,
      vertexColors: true,
      roughness: 0.86,
      metalness: 0.02,
      flatShading: false,
      emissive: 0x000000,
      emissiveIntensity: 0,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = { pickType: "region", data: region, baseColor: baseColor.clone() };
    worldRoot.add(mesh);
    pickables.push(mesh);
  }

  const sea = new THREE.Mesh(
    new THREE.SphereGeometry(4.985, 112, 56),
    new THREE.MeshPhysicalMaterial({
      color: 0x20566e,
      transparent: true,
      opacity: 0.7,
      roughness: 0.22,
      metalness: 0.08,
      clearcoat: 0.65,
      clearcoatRoughness: 0.2,
    }),
  );
  worldRoot.add(sea);

  const atmosphere = new THREE.Mesh(
    new THREE.SphereGeometry(5.48, 64, 32),
    new THREE.MeshBasicMaterial({
      color: 0x70bfd2,
      transparent: true,
      opacity: 0.075,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
    }),
  );
  worldRoot.add(atmosphere);
  refreshMacroDevelopment();
  configureView(
    new THREE.Vector3(0, 1.8, 14.5),
    new THREE.Vector3(),
    { min: 7.2, max: 24, rotate: true, pan: false, autoRotate: true },
  );
}

function terrainSurfaceHeight(sample) {
  if (sample.elevation < 0) return 0.055;
  return 0.075 + sample.elevation * 2.25;
}

function addPlanarBase(size) {
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(size + 0.8, 0.3, size + 0.8),
    new THREE.MeshStandardMaterial({ color: 0x242a2c, roughness: 1 }),
  );
  base.position.y = -0.27;
  worldRoot.add(base);
}

function createTerrainTile(cell, tileSize, resolution, sampleAt, userData, tintSeed) {
  const positions = [];
  const colors = [];
  const indices = [];
  const plannedColor = cell.district === "none" ? null : new THREE.Color(DISTRICTS[cell.district].color);

  for (let row = 0; row <= resolution; row += 1) {
    for (let column = 0; column <= resolution; column += 1) {
      const u = column / resolution;
      const v = row / resolution;
      const sample = sampleAt(u, v);
      const color = plannedColor ? plannedColor.clone() : terrainColor(sample, tintSeed);
      if (plannedColor) color.offsetHSL(0, 0, sample.elevation * 0.08);
      positions.push((u - 0.5) * tileSize, terrainSurfaceHeight(sample), (v - 0.5) * tileSize);
      colors.push(...color.toArray());
    }
  }

  for (let row = 0; row < resolution; row += 1) {
    for (let column = 0; column < resolution; column += 1) {
      const a = row * (resolution + 1) + column;
      const b = a + 1;
      const d = (row + 1) * (resolution + 1) + column;
      const c = d + 1;
      indices.push(a, d, b, b, d, c);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.9,
    metalness: 0.01,
    emissive: 0x000000,
    side: THREE.DoubleSide,
  });
  const tile = new THREE.Mesh(geometry, material);
  const centerSample = sampleAt(0.5, 0.5);
  tile.userData = {
    ...userData,
    surfaceY: terrainSurfaceHeight(centerSample),
    baseColor: new THREE.Color(0xffffff),
  };
  return tile;
}

function addResourceMarker(cell, tile, tileSize) {
  if (!cell.resource) return;
  const resource = RESOURCES[cell.resource];
  const marker = new THREE.Mesh(
    new THREE.OctahedronGeometry(tileSize * 0.13, 0),
    new THREE.MeshStandardMaterial({
      color: resource.color,
      emissive: resource.color,
      emissiveIntensity: 0.75,
      roughness: 0.25,
    }),
  );
  marker.position.set(
    tile.position.x + tileSize * 0.25,
    tile.userData.surfaceY + 0.23,
    tile.position.z - tileSize * 0.25,
  );
  marker.userData = tile.userData;
  worldRoot.add(marker);
  pickables.push(marker);
}

function addHubMarker(cell, tile, tileSize) {
  if (!cell.hub) return;
  const hub = HUBS[cell.hub];
  const marker = new THREE.Mesh(
    cell.hub === "spaceport"
      ? new THREE.CylinderGeometry(tileSize * 0.14, tileSize * 0.24, tileSize * 0.32, 8)
      : new THREE.BoxGeometry(tileSize * 0.32, tileSize * 0.32, tileSize * 0.32),
    new THREE.MeshStandardMaterial({ color: hub.color, emissive: hub.color, emissiveIntensity: 0.28 }),
  );
  marker.position.set(
    tile.position.x - tileSize * 0.24,
    tile.userData.surfaceY + 0.22,
    tile.position.z + tileSize * 0.24,
  );
  marker.userData = tile.userData;
  worldRoot.add(marker);
  pickables.push(marker);
}

function addMesoDevelopment(cell, tile, tileSize) {
  const group = new THREE.Group();
  group.position.set(tile.position.x, tile.userData.surfaceY + 0.035, tile.position.z);
  worldRoot.add(group);

  const addProxy = (district, development, x, z, scale = 1) => {
    if (district === "none" || development <= 0) return;
    const stage = buildingStage(development);
    const color = DISTRICTS[district].color;
    const shell = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.12 + stage * 0.035,
      roughness: 0.62,
      metalness: 0.18,
    });
    const dark = new THREE.MeshStandardMaterial({ color: 0x283237, roughness: 0.72, metalness: 0.28 });
    const light = new THREE.MeshBasicMaterial({ color: 0xa8eee3 });
    const height = (0.22 + stage * 0.1) * scale;
    let body;

    if (district === "industrial") {
      body = new THREE.Mesh(new THREE.BoxGeometry(0.32 * scale, height * 0.62, 0.23 * scale), shell);
      const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.025 * scale, 0.035 * scale, height, 6), dark);
      stack.position.set(x - 0.1 * scale, height / 2, z - 0.06 * scale);
      group.add(stack);
    } else if (district === "research") {
      body = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * scale, 0.13 * scale, height * 1.2, 8), shell);
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.035 * scale, 8, 6), light);
      beacon.position.set(x, height * 1.25, z);
      group.add(beacon);
    } else if (district === "agriculture") {
      body = new THREE.Mesh(new THREE.BoxGeometry(0.38 * scale, height * 0.32, 0.18 * scale), shell);
      body.rotation.y = Math.PI / 8;
    } else if (district === "military") {
      body = new THREE.Mesh(new THREE.CylinderGeometry(0.11 * scale, 0.17 * scale, height * 0.72, 6), shell);
    } else {
      body = new THREE.Mesh(new THREE.BoxGeometry(0.15 * scale, height, 0.15 * scale), shell);
    }
    body.position.set(x, body.geometry.parameters.height / 2, z);
    group.add(body);
  };

  if (cell.district !== "none") {
    const stage = buildingStage(cell.development || 0);
    const foundation = new THREE.Mesh(
      new THREE.BoxGeometry(tileSize * 0.66, 0.045, tileSize * 0.58),
      new THREE.MeshStandardMaterial({ color: 0x283237, roughness: 0.8, metalness: 0.15 }),
    );
    foundation.position.y = 0.022;
    group.add(foundation);
    const count = Math.min(6, stage + 2);
    for (let index = 0; index < count; index += 1) {
      const angle = index / count * Math.PI * 2 + seededNoise(cell.id, index, 112) * 0.5;
      const distance = index === 0 ? 0 : tileSize * (0.13 + (index % 2) * 0.08);
      addProxy(
        cell.district,
        cell.development || 0,
        Math.cos(angle) * distance,
        Math.sin(angle) * distance,
        0.9 + seededNoise(cell.id, index, 118) * 0.45,
      );
    }
    return;
  }

  cell.micro.forEach((micro) => {
    if (micro.district === "none") return;
    const localX = (micro.x - 3.5) / 8 * tileSize;
    const localZ = (micro.y - 3.5) / 8 * tileSize;
    addProxy(micro.district, micro.development || 0, localX, localZ, 0.42);
  });
}

function buildMesoView() {
  clearWorld();
  const region = state.selectedRegion;
  addPlanarBase(9.4);
  const tileSize = 1.08;
  const offset = 3.5;
  region.meso.forEach((cell) => {
    const tile = createTerrainTile(
      cell,
      tileSize,
      5,
      (u, v) => sampleRegionTerrain(region.id, (cell.x + u) / 8, (cell.y + v) / 8, region.terrain),
      { pickType: "meso", data: cell, region },
      region.id,
    );
    tile.position.set((cell.x - offset) * tileSize, 0, (cell.y - offset) * tileSize);
    worldRoot.add(tile);
    pickables.push(tile);
    addResourceMarker(cell, tile, tileSize);
    addHubMarker(cell, tile, tileSize);
    addMesoDevelopment(cell, tile, tileSize);
  });
  configureView(
    new THREE.Vector3(8.8, 11.2, 10.8),
    new THREE.Vector3(0, 0, 0),
    { min: 8, max: 22, rotate: true, pan: true, autoRotate: false },
  );
}

function addRoads(cells, tileSize) {
  const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x30383b, roughness: 1 });
  const railMaterial = new THREE.MeshStandardMaterial({ color: 0x8aafb2, metalness: 0.5, roughness: 0.45 });
  const hasRail = cells.some((cell) => cell.hub === "rail");
  cells.forEach((cell) => {
    const elevation = terrainSurfaceHeight(cell);
    const material = hasRail && (cell.x === 3 || cell.y === 3) ? railMaterial : roadMaterial;
    const width = material === railMaterial ? tileSize * 0.09 : tileSize * 0.055;
    const horizontal = new THREE.Mesh(new THREE.BoxGeometry(tileSize * 0.92, 0.025, width), material);
    horizontal.position.set((cell.x - 3.5) * tileSize, elevation + 0.035, (cell.y - 3.5) * tileSize - tileSize * 0.46);
    worldRoot.add(horizontal);
    const vertical = new THREE.Mesh(new THREE.BoxGeometry(width, 0.027, tileSize * 0.92), material);
    vertical.position.set((cell.x - 3.5) * tileSize - tileSize * 0.46, elevation + 0.037, (cell.y - 3.5) * tileSize);
    worldRoot.add(vertical);
  });
}

function buildingStage(development) {
  return SIMULATION.buildingStageThresholds.reduce((stage, threshold) => (
    development >= threshold ? stage + 1 : stage
  ), 1);
}

function addBuildingPart(group, geometry, material, position, userData, rotation = null) {
  const part = new THREE.Mesh(geometry, material);
  part.position.set(position[0], position[1], position[2]);
  if (rotation) part.rotation.set(rotation[0], rotation[1], rotation[2]);
  part.userData = userData;
  group.add(part);
  pickables.push(part);
  return part;
}

function addBuilding(cell, tile, tileSize, parentId) {
  if (cell.district === "none") return;
  const stage = buildingStage(cell.development || 0);
  const seed = seededNoise(parentId, cell.id, 41);
  const group = new THREE.Group();
  group.position.set(tile.position.x, tile.userData.surfaceY + 0.035, tile.position.z);
  group.rotation.y = Math.floor(seed * 4) * Math.PI / 2;
  worldRoot.add(group);

  const userData = tile.userData;
  const baseColor = DISTRICTS[cell.district].color;
  const shell = new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.62, metalness: 0.12 });
  const structure = new THREE.MeshStandardMaterial({ color: 0x354046, roughness: 0.76, metalness: 0.22 });
  const roof = new THREE.MeshStandardMaterial({ color: 0x232b31, roughness: 0.52, metalness: 0.35 });
  const light = new THREE.MeshStandardMaterial({
    color: 0xa8e5df,
    emissive: 0x62cfc5,
    emissiveIntensity: 0.65,
    roughness: 0.28,
    metalness: 0.18,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x82bfc1,
    transparent: true,
    opacity: 0.58,
    roughness: 0.18,
    metalness: 0.08,
  });
  const s = tileSize;

  if (cell.district === "residential") {
    addBuildingPart(group, new THREE.BoxGeometry(s * 0.68, 0.11, s * 0.62), structure, [0, 0.055, 0], userData);
    const towerCount = stage >= 3 ? 3 : stage >= 2 ? 2 : 1;
    for (let index = 0; index < towerCount; index += 1) {
      const height = 0.28 + stage * 0.12 + seededNoise(cell.id, index, parentId) * 0.14;
      const x = towerCount === 1 ? 0 : (index - (towerCount - 1) / 2) * s * 0.22;
      const z = index % 2 ? s * 0.12 : -s * 0.08;
      addBuildingPart(group, new THREE.BoxGeometry(s * 0.18, height, s * 0.18), shell, [x, 0.11 + height / 2, z], userData);
      addBuildingPart(group, new THREE.BoxGeometry(s * 0.19, 0.025, s * 0.19), roof, [x, 0.12 + height, z], userData);
      if (stage >= 2) {
        for (let floor = 0; floor < Math.min(4, stage + 1); floor += 1) {
          addBuildingPart(group, new THREE.BoxGeometry(s * 0.185, 0.018, s * 0.012), light, [x, 0.19 + floor * height * 0.16, z + s * 0.096], userData);
        }
      }
    }
  }

  if (cell.district === "industrial") {
    addBuildingPart(group, new THREE.BoxGeometry(s * 0.62, 0.22 + stage * 0.035, s * 0.42), shell, [-s * 0.05, 0.13 + stage * 0.017, 0], userData);
    addBuildingPart(group, new THREE.CylinderGeometry(s * 0.14, s * 0.14, 0.22, 16), roof, [s * 0.23, 0.12, s * 0.18], userData);
    const stacks = stage >= 3 ? 3 : stage >= 2 ? 2 : 1;
    for (let index = 0; index < stacks; index += 1) {
      const height = 0.28 + index * 0.06 + stage * 0.04;
      addBuildingPart(group, new THREE.CylinderGeometry(s * 0.035, s * 0.045, height, 10), structure, [-s * 0.24 + index * s * 0.18, 0.24 + height / 2, -s * 0.12], userData);
      addBuildingPart(group, new THREE.CylinderGeometry(s * 0.044, s * 0.044, 0.035, 10), light, [-s * 0.24 + index * s * 0.18, 0.25 + height, -s * 0.12], userData);
    }
  }

  if (cell.district === "research") {
    addBuildingPart(group, new THREE.CylinderGeometry(s * 0.28, s * 0.34, 0.12, 12), structure, [0, 0.06, 0], userData);
    const height = 0.34 + stage * 0.13;
    addBuildingPart(group, new THREE.CylinderGeometry(s * 0.11, s * 0.2, height, 12), glass, [0, 0.12 + height / 2, 0], userData);
    addBuildingPart(group, new THREE.SphereGeometry(s * (0.14 + stage * 0.012), 16, 10), light, [0, 0.15 + height, 0], userData);
    if (stage >= 2) {
      addBuildingPart(group, new THREE.TorusGeometry(s * 0.25, s * 0.025, 8, 24), light, [0, 0.28 + stage * 0.09, 0], userData, [Math.PI / 2, 0, 0]);
    }
    if (stage >= 4) {
      addBuildingPart(group, new THREE.CylinderGeometry(s * 0.012, s * 0.012, 0.32, 6), roof, [0, 0.58 + height, 0], userData);
    }
  }

  if (cell.district === "agriculture") {
    const rows = 3 + stage;
    for (let index = 0; index < rows; index += 1) {
      const z = (index - (rows - 1) / 2) * s * 0.1;
      addBuildingPart(group, new THREE.BoxGeometry(s * 0.66, 0.035, s * 0.055), shell, [0, 0.025, z], userData);
    }
    const greenhouseCount = stage >= 3 ? 2 : 1;
    for (let index = 0; index < greenhouseCount; index += 1) {
      addBuildingPart(group, new THREE.BoxGeometry(s * 0.2, 0.16, s * 0.42), glass, [(index ? 1 : -1) * s * 0.24, 0.09, 0], userData);
      addBuildingPart(group, new THREE.ConeGeometry(s * 0.145, 0.11, 4), glass, [(index ? 1 : -1) * s * 0.24, 0.225, 0], userData, [0, Math.PI / 4, 0]);
    }
  }

  if (cell.district === "military") {
    addBuildingPart(group, new THREE.BoxGeometry(s * 0.64, 0.2, s * 0.55), shell, [0, 0.1, 0], userData);
    addBuildingPart(group, new THREE.BoxGeometry(s * 0.48, 0.08, s * 0.4), roof, [0, 0.24, 0], userData);
    const towers = stage >= 3 ? 4 : 2;
    for (let index = 0; index < towers; index += 1) {
      const x = index % 2 ? s * 0.28 : -s * 0.28;
      const z = index < 2 ? -s * 0.23 : s * 0.23;
      addBuildingPart(group, new THREE.CylinderGeometry(s * 0.055, s * 0.07, 0.25 + stage * 0.035, 8), structure, [x, 0.2, z], userData);
    }
    if (stage >= 2) {
      addBuildingPart(group, new THREE.CylinderGeometry(s * 0.012, s * 0.012, 0.38, 6), structure, [0, 0.47, 0], userData);
      addBuildingPart(group, new THREE.SphereGeometry(s * 0.045, 10, 8), light, [0, 0.68, 0], userData);
    }
  }
}

function buildMicroView() {
  clearWorld();
  const meso = state.selectedMeso;
  addPlanarBase(9);
  const tileSize = 1;
  const offset = 3.5;
  meso.micro.forEach((cell) => {
    if (cell.district === "none" && meso.district !== "none") cell.district = meso.district;
    const tile = createTerrainTile(
      cell,
      tileSize,
      5,
      (u, v) => sampleMicroTerrain(
        state.selectedRegion.id,
        meso.x,
        meso.y,
        (cell.x + u) / 8,
        (cell.y + v) / 8,
        state.selectedRegion.terrain,
      ),
      { pickType: "micro", data: cell, meso, region: state.selectedRegion },
      state.selectedRegion.id,
    );
    tile.position.set((cell.x - offset) * tileSize, 0, (cell.y - offset) * tileSize);
    worldRoot.add(tile);
    pickables.push(tile);
    addBuilding(cell, tile, tileSize, meso.id);
    addResourceMarker(cell, tile, tileSize);
    addHubMarker(cell, tile, tileSize);
  });
  addRoads(meso.micro, tileSize);
  configureView(
    new THREE.Vector3(7.8, 9.6, 9.4),
    new THREE.Vector3(0, 0.3, 0),
    { min: 6.8, max: 18, rotate: true, pan: true, autoRotate: false },
  );
}

function configureView(position, target, options) {
  cameraTween = {
    start: performance.now(),
    duration: 620,
    fromPosition: camera.position.clone(),
    toPosition: position.clone(),
    fromTarget: controls.target.clone(),
    toTarget: target.clone(),
  };
  controls.minDistance = options.min;
  controls.maxDistance = options.max;
  controls.enableRotate = options.rotate;
  controls.enablePan = options.pan;
  controls.autoRotate = options.autoRotate;
}

function switchView(view) {
  state.view = view;
  state.hoveredObject = null;
  state.selectedObject = null;
  hideTooltip();
  closeContextMenu();
  if (view === "macro") buildMacroView();
  if (view === "meso") buildMesoView();
  if (view === "micro") buildMicroView();
  updateUI();
}

function currentRegion() {
  return state.selectedRegion;
}

function currentCell() {
  return state.selectedObject?.data || state.selectedMeso || null;
}

function totalHubs() {
  return regions.reduce((sum, region) => sum + region.meso.reduce((regionSum, cell) => (
    regionSum + (cell.hub ? 1 : 0) + cell.micro.filter((micro) => micro.hub).length
  ), 0), 0);
}

function formatEconomyValue(value) {
  if (Math.abs(value) >= 10000) return `${(value / 1000).toFixed(1)}k`;
  if (Math.abs(value) >= 100) return Math.round(value).toLocaleString("zh-CN");
  return value.toFixed(Math.abs(value) < 10 ? 1 : 0);
}

function scaledCost(cost, scale = 1) {
  return Object.fromEntries(Object.entries(cost).map(([resource, amount]) => [resource, amount * scale]));
}

function formatCost(cost, scale = 1) {
  return Object.entries(scaledCost(cost, scale)).map(([resource, amount]) => (
    `${ECONOMY_RESOURCES[resource].name} ${formatEconomyValue(amount)}`
  )).join(" · ");
}

function formatDistrictOutput(district, scale) {
  const economy = DISTRICT_ECONOMY[district];
  const hourly = Object.entries(economy.hourly).map(([resource, amount]) => {
    const scaled = amount * scale;
    return `${ECONOMY_RESOURCES[resource].name} ${scaled >= 0 ? "+" : ""}${formatEconomyValue(scaled)}/h`;
  });
  if (economy.housing > 0) hourly.push(`住房 +${formatEconomyValue(economy.housing * scale)}`);
  if (economy.defense > 0) hourly.push(`防御 +${formatEconomyValue(economy.defense * scale)}`);
  return hourly.join(" · ");
}

function canAfford(cost, scale = 1) {
  return Object.entries(cost).every(([resource, amount]) => state.economy[resource] >= amount * scale);
}

function payCost(cost, scale = 1) {
  if (!canAfford(cost, scale)) return false;
  Object.entries(cost).forEach(([resource, amount]) => {
    state.economy[resource] -= amount * scale;
  });
  renderEconomy();
  return true;
}

function applyResourceBonus(hourly, district, resource) {
  const result = { ...hourly };
  const bonus = MODIFIERS.resource;
  if (resource === "mineral" && district === "industrial" && result.materials > 0) result.materials *= bonus.mineralIndustrialMaterials;
  if (resource === "energy" && district === "research") {
    if (result.research > 0) result.research *= bonus.energyResearchOutput;
    if (result.energy < 0) result.energy *= bonus.energyResearchConsumption;
  }
  if (resource === "fertile" && district === "agriculture" && result.food > 0) result.food *= bonus.fertileAgricultureFood;
  if (resource === "fertile" && district === "residential" && result.food < 0) result.food *= bonus.fertileResidentialFoodConsumption;
  if (resource === "relic" && district === "research" && result.research > 0) result.research *= bonus.relicResearchOutput;
  return result;
}

function calculateEconomySnapshot() {
  const delta = {
    ...SIMULATION.baseHourly,
    food: SIMULATION.baseHourly.food - state.population / SIMULATION.foodConsumptionPopulationDivisor,
  };
  let housing = SIMULATION.initialHousing;
  let jobs = 0;
  let defense = SIMULATION.initialDefense;
  const policy = document.querySelector("#policySelect").value;
  const operationEfficiency = state.economy.energy <= 0 ? SIMULATION.energyShortageEfficiency : 1;

  const applyUnit = (district, development, resource, scale, hub = null) => {
    if (district === "none") return;
    const economy = DISTRICT_ECONOMY[district];
    const completion = clamp(development || 0);
    let hourly = applyResourceBonus(economy.hourly, district, resource);
    hourly = { ...hourly };
    if (policy === "industrial" && hourly.materials > 0) hourly.materials *= MODIFIERS.policy.industrialMaterials;
    if (policy === "research" && hourly.research > 0) hourly.research *= MODIFIERS.policy.researchOutput;
    if (policy === "ecology" && hourly.food > 0) hourly.food *= MODIFIERS.policy.ecologyFood;
    if (policy === "ecology" && hourly.energy < 0) hourly.energy *= MODIFIERS.policy.ecologyEnergyConsumption;
    if (hub === "rail" && district === "industrial" && hourly.materials > 0) hourly.materials *= MODIFIERS.hub.railIndustrialMaterials;
    if (hub === "spaceport" && hourly.credits > 0) hourly.credits *= MODIFIERS.hub.spaceportPositiveCredits;
    Object.entries(hourly).forEach(([resourceKey, amount]) => {
      const efficiency = amount > 0 && resourceKey !== "energy" ? operationEfficiency : 1;
      delta[resourceKey] += amount * completion * scale * efficiency;
    });
    housing += economy.housing * completion * scale;
    jobs += economy.jobs * completion * scale;
    const defenseMultiplier = policy === "military" ? MODIFIERS.policy.militaryDefense : 1;
    defense += economy.defense * completion * scale * defenseMultiplier;
  };

  regions.forEach((region) => {
    region.meso.forEach((meso) => {
      if (meso.district !== "none") {
        applyUnit(meso.district, meso.development, meso.resource, 1, meso.hub);
      } else {
        meso.micro.forEach((cell) => applyUnit(
          cell.district,
          cell.development,
          cell.resource,
          SIMULATION.scale.microEconomy,
          cell.hub,
        ));
      }
    });
  });
  return { delta, housing, jobs, defense };
}

function renderEconomy() {
  const snapshot = calculateEconomySnapshot();
  state.economyDelta = snapshot.delta;
  economyPanel.innerHTML = Object.entries(ECONOMY_RESOURCES).map(([key, resource]) => {
    const delta = snapshot.delta[key];
    const deltaLabel = `${delta >= 0 ? "+" : ""}${formatEconomyValue(delta)}/h`;
    return `
      <div class="economy-item">
        <span class="resource-mark" style="background:${resource.color}"></span>
        <span><strong>${formatEconomyValue(state.economy[key])}</strong><small>${resource.name} · ${resource.unit}</small></span>
        <em class="${delta < 0 ? "negative" : ""}">${deltaLabel}</em>
      </div>
    `;
  }).join("");
  const shortages = [];
  if (state.economy.energy <= 0) shortages.push(`能源短缺：生产效率降至 ${Math.round(SIMULATION.energyShortageEfficiency * 100)}%`);
  if (state.economy.food <= 0) shortages.push("食物短缺：人口停止增长");
  economyStatus.textContent = shortages.length ? "供应短缺" : "供应稳定";
  economyFoot.textContent = shortages.length
    ? shortages.join(" · ")
    : `人口 ${Math.round(state.population).toLocaleString("zh-CN")} / 住房 ${Math.round(snapshot.housing).toLocaleString("zh-CN")} · 岗位 ${Math.round(snapshot.jobs).toLocaleString("zh-CN")} · 防御 ${Math.round(snapshot.defense)}`;
}

function updateUI() {
  const region = currentRegion();
  document.querySelectorAll(".level-row").forEach((button) => {
    button.classList.toggle("active", button.dataset.level === state.view);
    if (button.dataset.level === "macro") button.disabled = false;
    if (button.dataset.level === "meso") button.disabled = !region;
    if (button.dataset.level === "micro") button.disabled = !state.selectedMeso;
  });

  const labels = {
    macro: "宏观 · 星球全景",
    meso: `中观 · ${region?.name || "区域"}`,
    micro: `微观 · ${region?.name || "区域"} / 地块 ${state.selectedMeso ? `${state.selectedMeso.x + 1}-${state.selectedMeso.y + 1}` : ""}`,
  };
  const scales = {
    macro: "1 区块 ≈ 2,400 km",
    meso: "1 地块 ≈ 24 km",
    micro: "1 单元 ≈ 300 m",
  };
  const hints = {
    macro: "拖动旋转 · 滚轮缩放 · 悬浮高亮地貌区 · 双击进入",
    meso: "悬浮查看 · 单击规划 · 双击展开局部微观布局",
    micro: "单击单元规划建筑与交通 · 使用面包屑返回",
  };
  viewIndicator.textContent = labels[state.view];
  levelScale.textContent = scales[state.view];
  interactionHint.textContent = hints[state.view];
  hubCount.textContent = `${totalHubs()} 个枢纽`;
  renderBreadcrumb();
  renderSelectedPanel();
  renderStats();
  renderEvents();
  renderEconomy();
}

function renderBreadcrumb() {
  const pieces = [{ view: "macro", label: "泰洛斯 IV" }];
  if (state.selectedRegion) pieces.push({ view: "meso", label: state.selectedRegion.name });
  if (state.selectedMeso) pieces.push({
    view: "micro",
    label: `地块 ${state.selectedMeso.x + 1}-${state.selectedMeso.y + 1}`,
  });
  breadcrumb.innerHTML = pieces.map((piece, index) => {
    const isCurrent = piece.view === state.view;
    const separator = index ? '<span class="crumb-separator">/</span>' : "";
    return `${separator}<button class="crumb ${isCurrent ? "current" : ""}" data-view="${piece.view}" type="button">${piece.label}</button>`;
  }).join("");
}

function renderSelectedPanel() {
  const hovered = state.hoveredObject;
  if (!hovered) {
    const defaultCopy = state.view === "macro"
      ? "移动指针可高亮整片连续地貌区。区域颜色表示主导地形，双击后展开其 8×8 中观规划地图。"
      : "选择一个地块查看地形、资源和规划状态。资源点只对所在区划提供定向加成。";
    selectedPanel.innerHTML = `
      <div class="selection-kicker">${state.view === "macro" ? "行星勘测" : "局部规划"}</div>
      <div class="selection-title">${state.view === "macro" ? "等待选择区域" : currentRegion()?.name}</div>
      <p class="selection-copy">${defaultCopy}</p>
    `;
    return;
  }
  const data = hovered.data;
  const terrain = TERRAIN[data.terrain];
  const isRegion = hovered.pickType === "region";
  const district = isRegion ? null : DISTRICTS[data.district];
  const resource = data.resource ? RESOURCES[data.resource] : null;
  const regionProfile = isRegion ? regionDevelopmentProfile(data) : null;
  const dominantDistrict = regionProfile?.districts[0]?.[0] || null;
  const elevationText = isRegion ? null : `${Math.round(data.elevation * 2200)} m`;
  const stageText = !isRegion && data.district !== "none"
    ? `建设阶段 ${buildingStage(data.development || 0)} · ${Math.round((data.development || 0) * 100)}%`
    : null;
  selectedPanel.innerHTML = `
    <div class="selection-kicker">${isRegion ? "宏观地貌区" : hovered.pickType === "meso" ? "中观地块" : "微观单元"}</div>
    <div class="selection-title">${isRegion ? data.name : `${currentRegion().name} · ${data.x + 1}-${data.y + 1}`}</div>
    <p class="selection-copy">
      ${terrain.name}：${terrain.description}。
      ${elevationText ? `局部海拔约 ${elevationText}。` : ""}
      ${district ? `${district.name}：${district.bonus}。` : ""}
      ${stageText ? `${stageText}。` : ""}
      ${isRegion && regionProfile.total > 0 ? `已形成 ${regionProfile.total.toFixed(1)} 个标准建设规模，${DISTRICTS[dominantDistrict].name}为主要地表特征。` : ""}
      ${resource ? `${resource.name}：${resource.effect}。` : "当前未探测到特殊资源点。"}
    </p>
    <div class="selection-metrics">
      <div class="metric"><strong>${terrain.name}</strong><span>主导地形</span></div>
      <div class="metric"><strong>${isRegion ? `${data.population} 亿` : elevationText}</strong><span>${isRegion ? "区域人口" : "局部海拔"}</span></div>
      <div class="metric"><strong>${isRegion && regionProfile.total > 0 ? regionProfile.total.toFixed(1) : resource?.name || "无"}</strong><span>${isRegion && regionProfile.total > 0 ? "建设规模" : "资源点"}</span></div>
    </div>
  `;
}

function renderStats() {
  const developed = regions.reduce((sum, region) => sum + regionDevelopmentProfile(region).total, 0);
  planetStats.innerHTML = `
    <div class="stat-chip"><strong>22</strong><span>连续地貌区</span></div>
    <div class="stat-chip"><strong>${developed.toFixed(1)}</strong><span>建设规模</span></div>
    <div class="stat-chip"><strong>${totalHubs()}</strong><span>物流枢纽</span></div>
  `;
}

function renderEvents() {
  eventLog.innerHTML = state.events.slice(0, 4).map((event) => `
    <div class="event-item"><strong>${event.title}</strong>${event.text}</div>
  `).join("");
}

function addEvent(title, text) {
  state.events.unshift({ title, text });
  renderEvents();
}

function setHovered(objectData) {
  if (state.hoveredObject?.mesh) restoreMaterial(state.hoveredObject.mesh);
  state.hoveredObject = objectData;
  if (objectData?.mesh) highlightMaterial(objectData.mesh);
  renderSelectedPanel();
}

function highlightMaterial(mesh) {
  if (!mesh.material?.emissive) return;
  mesh.material.emissive.set(0x8ee7da);
  mesh.material.emissiveIntensity = 0.72;
  mesh.material.color.offsetHSL(0, 0, 0.08);
}

function restoreMaterial(mesh) {
  if (!mesh.material?.emissive) return;
  mesh.material.emissive.set(0x000000);
  mesh.material.emissiveIntensity = 0;
  const data = mesh.userData.data;
  const color = mesh.material.vertexColors
    ? new THREE.Color(0xffffff)
    : mesh.userData.pickType === "region"
      ? mesh.userData.baseColor
      : new THREE.Color(data.district === "none" ? TERRAIN[data.terrain].color : DISTRICTS[data.district].color);
  mesh.material.color.copy(color);
}

function objectFromIntersection(intersection) {
  let object = intersection.object;
  while (object && !object.userData.pickType) object = object.parent;
  if (!object?.userData.pickType) return null;
  const primaryMesh = pickables.find((candidate) => (
    candidate.userData.pickType === object.userData.pickType
    && candidate.userData.data === object.userData.data
    && candidate.material?.emissive
  )) || object;
  return { ...object.userData, mesh: primaryMesh };
}

function updatePointer(event) {
  const rect = canvas.getBoundingClientRect();
  state.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  state.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function hitTest(event) {
  updatePointer(event);
  raycaster.setFromCamera(state.pointer, camera);
  const intersections = raycaster.intersectObjects(pickables, true);
  return intersections.length ? objectFromIntersection(intersections[0]) : null;
}

function showTooltip(event, hit) {
  const data = hit.data;
  const resource = data.resource ? RESOURCES[data.resource] : null;
  const title = hit.pickType === "region" ? data.name : `地块 ${data.x + 1}-${data.y + 1}`;
  const elevation = hit.pickType === "region" ? "" : ` · ${Math.round(data.elevation * 2200)} m`;
  tooltip.innerHTML = `
    <div class="tooltip-title">${title}</div>
    <div class="tooltip-meta">${TERRAIN[data.terrain].name}${elevation}${data.district && data.district !== "none" ? ` · ${DISTRICTS[data.district].name}` : ""}</div>
    <div>${resource ? `<strong style="color:${resource.color}">${resource.name}</strong>：${resource.effect}` : "无特殊资源点"}</div>
    <div class="tooltip-action">${hit.pickType === "macro" || hit.pickType === "region" ? "双击展开中观地图" : hit.pickType === "meso" ? "单击规划 · 双击查看微观" : "单击规划此单元"}</div>
  `;
  const rect = stage.getBoundingClientRect();
  const left = Math.min(event.clientX - rect.left + 15, rect.width - 232);
  const top = Math.min(event.clientY - rect.top + 15, rect.height - 145);
  tooltip.style.left = `${Math.max(8, left)}px`;
  tooltip.style.top = `${Math.max(8, top)}px`;
  tooltip.hidden = false;
}

function hideTooltip() {
  tooltip.hidden = true;
}

function positionContextMenu(event) {
  const rect = stage.getBoundingClientRect();
  const width = Math.min(340, rect.width - 24);
  const left = Math.min(event.clientX - rect.left + 12, rect.width - width - 12);
  const top = Math.min(event.clientY - rect.top + 12, rect.height - 430);
  contextMenu.style.left = `${Math.max(12, left)}px`;
  contextMenu.style.top = `${Math.max(12, top)}px`;
}

function openContextMenu(event, hit) {
  if (hit.pickType === "region") return;
  state.selectedObject = hit;
  const cell = hit.data;
  const resource = cell.resource ? RESOURCES[cell.resource] : null;
  const costScale = hit.pickType === "meso" ? SIMULATION.scale.mesoCost : 1;
  const economicScale = hit.pickType === "meso" ? SIMULATION.scale.mesoEconomy : SIMULATION.scale.microEconomy;
  const districtActions = Object.entries(DISTRICTS).filter(([key]) => key !== "none").map(([key, district]) => `
    <button class="action-button ${cell.district === key ? "current" : ""}" data-district="${key}" type="button" ${cell.district === key || !canAfford(DISTRICT_ECONOMY[key].cost, costScale) ? "disabled" : ""}>
      <span class="district-swatch" style="background:#${new THREE.Color(district.color).getHexString()}"></span>
      <span>${district.name}<small class="context-cost">花费：${formatCost(DISTRICT_ECONOMY[key].cost, costScale)}</small><small class="context-output">满负荷：${formatDistrictOutput(key, economicScale)}</small><small>${resourceBonusLabel(key, cell.resource)}</small></span>
    </button>
  `).join("");
  const hubActions = Object.entries(HUBS).map(([key, hub]) => `
    <button class="wide-action" data-hub="${key}" type="button" ${cell.hub !== key && !canAfford(hub.cost, costScale) ? "disabled" : ""}>
      <span><strong>${hub.name}</strong><small>${hub.effect}</small><small class="context-cost">花费：${formatCost(hub.cost, costScale)}</small></span>
      <span>${cell.hub === key ? "已建" : "建设"}</span>
    </button>
  `).join("");
  contextMenu.innerHTML = `
    <div class="context-head">
      <div>
        <div class="context-title">${currentRegion().name} · ${cell.x + 1}-${cell.y + 1}</div>
        <div class="context-meta">${TERRAIN[cell.terrain].name} · ${cell.district === "none" ? "未开始建设" : `建设阶段 ${buildingStage(cell.development || 0)} · ${Math.round((cell.development || 0) * 100)}%`}<br>${resource ? `${resource.name}：${resource.effect}` : "无特殊资源加成"}</div>
      </div>
      <button class="icon-button" data-close type="button" title="关闭">×</button>
    </div>
    <div class="context-section">
      <div class="context-label">指定区划</div>
      <div class="action-grid">${districtActions}</div>
      ${cell.district !== "none" ? '<button class="wide-action" data-clear type="button"><span>清除当前规划</span><span>恢复地貌</span></button>' : ""}
    </div>
    <div class="context-section">
      <div class="context-label">建设交通枢纽</div>
      ${hubActions}
      ${cell.hub ? '<button class="wide-action" data-remove-hub type="button"><span>拆除枢纽</span><span>停止覆盖</span></button>' : ""}
    </div>
  `;
  positionContextMenu(event);
  contextMenu.hidden = false;
}

function resourceBonusLabel(district, resource) {
  if (!resource) return DISTRICTS[district].bonus;
  const percentage = (multiplier) => `${Math.round(Math.abs(multiplier - 1) * 100)}%`;
  const matches = {
    mineral: district === "industrial" ? `富矿适配 · +${percentage(MODIFIERS.resource.mineralIndustrialMaterials)} 产能` : "无定向加成",
    energy: district === "research" ? `能源适配 · +${percentage(MODIFIERS.resource.energyResearchOutput)} 科研` : "无定向加成",
    fertile: district === "agriculture" ? `沃土适配 · +${percentage(MODIFIERS.resource.fertileAgricultureFood)} 产出` : district === "residential" ? `补给稳定 · +${percentage(MODIFIERS.resource.fertileResidentialFoodConsumption)} 节省` : "无定向加成",
    relic: district === "research" ? `遗迹适配 · +${percentage(MODIFIERS.resource.relicResearchOutput)} 科研` : "无定向加成",
  };
  return matches[resource];
}

function closeContextMenu() {
  contextMenu.hidden = true;
}

function applyDistrict(key) {
  const hit = state.selectedObject;
  if (!hit) return;
  if (hit.data.district === key) return;
  const costScale = hit.pickType === "meso" ? SIMULATION.scale.mesoCost : 1;
  if (!payCost(DISTRICT_ECONOMY[key].cost, costScale)) {
    addEvent("建设资源不足", `${DISTRICTS[key].name}需要 ${formatCost(DISTRICT_ECONOMY[key].cost, costScale)}。`);
    return;
  }
  hit.data.district = key;
  hit.data.development = Math.max(hit.data.development || 0, SIMULATION.developmentGrowth.initialMeso);
  if (hit.pickType === "meso") {
    hit.data.micro.forEach((cell) => {
      if (cell.district === "none") {
        cell.district = key;
        cell.development = Math.max(cell.development || 0, SIMULATION.developmentGrowth.initialMicro);
      }
    });
    hit.region.districts = hit.region.meso.filter((cell) => cell.district !== "none").length;
  }
  addEvent("区划方案更新", `${currentRegion().name} 的 ${hit.data.x + 1}-${hit.data.y + 1} 已指定为${DISTRICTS[key].name}，投入 ${formatCost(DISTRICT_ECONOMY[key].cost, costScale)}。`);
  closeContextMenu();
  switchView(state.view);
}

function applyHub(key) {
  const hit = state.selectedObject;
  if (!hit) return;
  if (hit.data.hub === key) {
    hit.data.hub = null;
    addEvent("物流网络更新", `${HUBS[key].name}已停止运行。`);
  } else {
    const costScale = hit.pickType === "meso" ? SIMULATION.scale.mesoCost : 1;
    if (!payCost(HUBS[key].cost, costScale)) {
      addEvent("建设资源不足", `${HUBS[key].name}需要 ${formatCost(HUBS[key].cost, costScale)}。`);
      return;
    }
    hit.data.hub = key;
    addEvent("物流网络更新", `${HUBS[key].name}已在 ${currentRegion().name} 建立，投入 ${formatCost(HUBS[key].cost, costScale)}。`);
  }
  closeContextMenu();
  switchView(state.view);
}

function onPointerMove(event) {
  if (!contextMenu.hidden) return;
  const hit = hitTest(event);
  if (!hit) {
    setHovered(null);
    hideTooltip();
    return;
  }
  if (state.hoveredObject?.data !== hit.data || state.hoveredObject?.pickType !== hit.pickType) {
    setHovered(hit);
  }
  showTooltip(event, hit);
}

function onCanvasClick(event) {
  const hit = hitTest(event);
  if (!hit) {
    closeContextMenu();
    return;
  }
  if (state.view === "macro") {
    state.selectedObject = hit;
    return;
  }
  clearTimeout(clickTimer);
  clickTimer = window.setTimeout(() => openContextMenu(event, hit), 230);
}

function onCanvasDoubleClick(event) {
  clearTimeout(clickTimer);
  const hit = hitTest(event);
  if (!hit) return;
  if (state.view === "macro" && hit.pickType === "region") {
    state.selectedRegion = hit.data;
    state.selectedMeso = null;
    addEvent("进入区域地图", `${hit.data.name} 已展开为 8×8 中观地块。`);
    switchView("meso");
  } else if (state.view === "meso" && hit.pickType === "meso") {
    state.selectedMeso = hit.data;
    addEvent("进入微观布局", `地块 ${hit.data.x + 1}-${hit.data.y + 1} 已展开为 8×8 建设单元。`);
    switchView("micro");
  }
}

function onResize() {
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function formatGameTime() {
  const date = new Date(Date.parse(SIMULATION.startDate) + state.currentHour * 60 * 60 * 1000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  return { date, dateLabel: `${year}年${month}月${day}日`, hourLabel: `${hour}:00` };
}

function updateClockUI() {
  const formatted = formatGameTime();
  gameClock.dateTime = formatted.date.toISOString();
  gameClock.innerHTML = `<strong>${formatted.dateLabel}</strong><span>${formatted.hourLabel}</span>`;
  speedControls.querySelectorAll("[data-speed]").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.speed) === state.speed);
  });
  timeRate.textContent = state.speed === 0 ? "时间已暂停" : `${state.speed} 游戏小时 / 现实秒`;
}

function advanceSimulationHour() {
  state.currentHour += 1;
  const policy = document.querySelector("#policySelect").value;
  const growthMultiplier = SIMULATION.developmentGrowth.policyMultiplier[policy]
    ?? SIMULATION.developmentGrowth.policyMultiplier.default;
  let rebuildMicro = false;
  let rebuildMeso = false;

  regions.forEach((region) => {
    region.meso.forEach((meso) => {
      if (meso.district !== "none") {
        const oldStage = buildingStage(meso.development || 0);
        meso.development = clamp((meso.development || 0) + SIMULATION.developmentGrowth.mesoPerHour * growthMultiplier);
        if (state.view === "meso" && state.selectedRegion === region && buildingStage(meso.development) !== oldStage) {
          rebuildMeso = true;
        }
      }
      meso.micro.forEach((cell) => {
        if (cell.district === "none") return;
        const oldStage = buildingStage(cell.development || 0);
        const terrainPenalty = SIMULATION.developmentGrowth.terrainPenalty[cell.terrain]
          ?? SIMULATION.developmentGrowth.terrainPenalty.default;
        cell.development = clamp((cell.development || 0) + SIMULATION.developmentGrowth.microPerHour * growthMultiplier * terrainPenalty);
        if (state.view === "micro" && state.selectedMeso === meso && buildingStage(cell.development) !== oldStage) {
          rebuildMicro = true;
        }
      });
    });
  });

  const economySnapshot = calculateEconomySnapshot();
  state.economyDelta = economySnapshot.delta;
  Object.entries(economySnapshot.delta).forEach(([resource, amount]) => {
    state.economy[resource] = Math.max(0, state.economy[resource] + amount);
  });

  if (state.currentHour % 24 === 0) {
    const formatted = formatGameTime();
    if (state.economy.food > 0 && state.economy.energy > 0 && state.population < economySnapshot.housing) {
      state.population += Math.min(
        economySnapshot.housing - state.population,
        state.population * SIMULATION.dailyPopulationGrowth,
      );
    }
    const shortage = state.economy.energy <= 0 || state.economy.food <= 0;
    addEvent(
      shortage ? "供应短缺" : "建设周期结算",
      shortage
        ? `${formatted.dateLabel} 00:00，基础供应不足，人口增长暂停且部分产能受限。`
        : `${formatted.dateLabel} 00:00，建设、人口与资源收支已完成日结算。`,
    );
  }
  updateClockUI();
  renderEconomy();
  if (rebuildMicro) buildMicroView();
  else if (rebuildMeso) buildMesoView();
  if (state.view === "macro" && state.currentHour % 24 === 0) refreshMacroDevelopment();
}

function updateSimulation(time) {
  if (state.lastSimulationTime === null) {
    state.lastSimulationTime = time;
    return;
  }
  const elapsedSeconds = Math.min(0.25, (time - state.lastSimulationTime) / 1000);
  state.lastSimulationTime = time;
  if (state.speed === 0) return;
  state.simulationAccumulator += elapsedSeconds * state.speed;
  while (state.simulationAccumulator >= 1) {
    state.simulationAccumulator -= 1;
    advanceSimulationHour();
  }
}

function animate(time) {
  requestAnimationFrame(animate);
  updateSimulation(time);
  if (cameraTween) {
    const progress = Math.min(1, (time - cameraTween.start) / cameraTween.duration);
    const eased = 1 - (1 - progress) ** 3;
    camera.position.lerpVectors(cameraTween.fromPosition, cameraTween.toPosition, eased);
    controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.toTarget, eased);
    if (progress === 1) cameraTween = null;
  }
  controls.update();
  renderer.render(scene, camera);
}

resourceLegend.innerHTML = Object.entries(RESOURCES).map(([key, resource]) => `
  <div class="resource-item">
    <span class="resource-mark" style="background:${resource.color}"></span>
    <span><strong>${resource.name}</strong><small>${resource.effect}</small></span>
  </div>
`).join("");

terrainKey.innerHTML = Object.entries(TERRAIN).map(([, terrain]) => `
  <span><i class="terrain-dot" style="background:#${new THREE.Color(terrain.color).getHexString()}"></i>${terrain.name}</span>
`).join("");

canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerleave", () => {
  setHovered(null);
  hideTooltip();
});
canvas.addEventListener("click", onCanvasClick);
canvas.addEventListener("dblclick", onCanvasDoubleClick);
canvas.addEventListener("pointerdown", () => {
  controls.autoRotate = false;
});
window.addEventListener("resize", onResize);

breadcrumb.addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (!button || button.classList.contains("current")) return;
  if (button.dataset.view === "macro") {
    state.selectedRegion = null;
    state.selectedMeso = null;
  }
  if (button.dataset.view === "meso") state.selectedMeso = null;
  switchView(button.dataset.view);
});

document.querySelector(".level-stack").addEventListener("click", (event) => {
  const button = event.target.closest("[data-level]");
  if (!button || button.disabled || button.dataset.level === state.view) return;
  switchView(button.dataset.level);
});

contextMenu.addEventListener("click", (event) => {
  const districtButton = event.target.closest("[data-district]");
  const hubButton = event.target.closest("[data-hub]");
  if (event.target.closest("[data-close]")) closeContextMenu();
  if (districtButton) applyDistrict(districtButton.dataset.district);
  if (hubButton) applyHub(hubButton.dataset.hub);
  if (event.target.closest("[data-clear]")) {
    state.selectedObject.data.district = "none";
    state.selectedObject.data.development = 0;
    if (state.selectedObject.pickType === "meso") {
      state.selectedObject.data.micro.forEach((cell) => {
        cell.district = "none";
        cell.development = 0;
      });
    }
    closeContextMenu();
    switchView(state.view);
  }
  if (event.target.closest("[data-remove-hub]")) {
    state.selectedObject.data.hub = null;
    closeContextMenu();
    switchView(state.view);
  }
});

speedControls.addEventListener("click", (event) => {
  const button = event.target.closest("[data-speed]");
  if (!button) return;
  state.speed = Number(button.dataset.speed);
  state.simulationAccumulator = 0;
  updateClockUI();
});

document.querySelector("#policySelect").addEventListener("change", (event) => {
  addEvent("星球政策调整", `发展方向已切换为“${event.target.selectedOptions[0].textContent}”。`);
});

document.querySelector("#transportSelect").addEventListener("change", (event) => {
  addEvent("运输策略调整", `物流调度已切换为“${event.target.selectedOptions[0].textContent}”。`);
});

buildMacroView();
updateUI();
updateClockUI();
animate(performance.now());
