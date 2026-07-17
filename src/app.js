"use strict";

const canvas = document.getElementById("planetCanvas");
const ctx = canvas.getContext("2d");

const ui = {
  viewModes: document.getElementById("viewModes"),
  toolModes: document.getElementById("toolModes"),
  districtTypes: document.getElementById("districtTypes"),
  policySelect: document.getElementById("policySelect"),
  transportSelect: document.getElementById("transportSelect"),
  speedControls: document.getElementById("speedControls"),
  selectedPanel: document.getElementById("selectedPanel"),
  eventLog: document.getElementById("eventLog"),
  planetStats: document.getElementById("planetStats"),
};

const terrainTypes = {
  plain: { name: "平原", color: "#405d43", accent: "#6f9b62", build: { housing: 1.12, agriculture: 1.2 } },
  mountain: { name: "山地", color: "#575d63", accent: "#929aa1", build: { industrial: 1.22, military: 1.18, research: 1.08 } },
  hill: { name: "丘陵", color: "#536746", accent: "#7f965f", build: { housing: 1.05, research: 1.12 } },
  ocean: { name: "海洋", color: "#214b62", accent: "#3a7d9b", build: { agriculture: 0.45, industrial: 0.8, research: 1.1 } },
  desert: { name: "沙漠", color: "#856d42", accent: "#b59a61", build: { military: 1.08, research: 1.05, housing: 0.78 } },
  ice: { name: "冰原", color: "#6a8792", accent: "#b0d2dc", build: { research: 1.18, agriculture: 0.55, housing: 0.74 } },
  jungle: { name: "丛林", color: "#285f3f", accent: "#63a05f", build: { agriculture: 1.1, research: 1.08, industrial: 0.78 } },
  volcanic: { name: "火山", color: "#5c3636", accent: "#d46a46", build: { industrial: 1.2, military: 1.08, housing: 0.62 } },
};

const districtTypes = {
  housing: { name: "住宅", color: "#62a6d9", short: "住" },
  industrial: { name: "工业", color: "#d19252", short: "工" },
  agriculture: { name: "农业", color: "#8fc65f", short: "农" },
  research: { name: "科研", color: "#a57adc", short: "研" },
  military: { name: "军事", color: "#d86b72", short: "军" },
};

const policies = {
  balanced: { name: "均衡发展", growth: 1, pollution: 1, happiness: 1, production: 1 },
  industrial: { name: "快速工业化", growth: 1.16, pollution: 1.24, happiness: 0.94, production: 1.16 },
  ecology: { name: "生态优先", growth: 0.95, pollution: 0.72, happiness: 1.12, production: 0.92 },
  research: { name: "科研特区", growth: 1.03, pollution: 0.98, happiness: 1, production: 1.06, research: 1.22 },
  military: { name: "军事管制", growth: 0.98, pollution: 1.04, happiness: 0.9, production: 1.04, military: 1.2 },
  automation: { name: "自动化优先", growth: 1.08, pollution: 1.02, happiness: 0.97, production: 1.14, jobs: 0.82 },
};

const transportStrategies = {
  balanced: { name: "稳定优先", logistics: 1.04, cost: 1.04 },
  speed: { name: "速度优先", logistics: 1.16, cost: 1.18 },
  cost: { name: "成本优先", logistics: 0.9, cost: 0.82 },
  military: { name: "军事优先", logistics: 1.02, military: 1.18, civilian: 0.93 },
  civilian: { name: "民生优先", logistics: 1.02, housing: 1.12, industry: 0.94 },
};

const state = {
  cols: 22,
  rows: 15,
  cells: [],
  hubs: [],
  selectedType: "housing",
  view: "macro",
  tool: "zone",
  selectedCell: null,
  hoverCell: null,
  isPainting: false,
  speed: 1,
  day: 1,
  tickRemainder: 0,
  lastTime: 0,
  events: [],
  layout: {
    cell: 32,
    gap: 3,
    left: 0,
    top: 0,
    mapW: 0,
    mapH: 0,
  },
};

function seededNoise(x, y, salt = 0) {
  const n = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mixColor(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const r = Math.round(lerp(a.r, b.r, t));
  const g = Math.round(lerp(a.g, b.g, t));
  const bl = Math.round(lerp(a.b, b.b, t));
  return `rgb(${r}, ${g}, ${bl})`;
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function formatPct(value) {
  return `${Math.round(clamp(value) * 100)}%`;
}

function formatInt(value) {
  return Math.round(value).toLocaleString("zh-CN");
}

function determineTerrain(x, y) {
  const nx = x / (state.cols - 1);
  const ny = y / (state.rows - 1);
  const lat = Math.abs(ny - 0.5) * 2;
  const ocean = seededNoise(x, y, 1);
  const rough = seededNoise(x, y, 2);
  const hot = seededNoise(x, y, 3);

  if (lat > 0.84) return "ice";
  if (ocean < 0.14 || (ny > 0.67 && ocean < 0.26)) return "ocean";
  if (rough > 0.86) return hot > 0.62 ? "volcanic" : "mountain";
  if (rough > 0.72) return "hill";
  if (hot > 0.8 && lat < 0.62) return "desert";
  if (hot < 0.24 && lat < 0.58) return "jungle";
  return "plain";
}

function createResource(x, y, terrain) {
  const r = seededNoise(x, y, 9);
  if (terrain === "mountain" && r > 0.63) return "矿";
  if (terrain === "volcanic" && r > 0.55) return "能";
  if (terrain === "jungle" && r > 0.7) return "生";
  if (terrain === "desert" && r > 0.76) return "能";
  if (terrain === "ice" && r > 0.82) return "遗";
  if (terrain === "plain" && r > 0.88) return "稀";
  return "";
}

function makeCell(x, y) {
  const terrain = determineTerrain(x, y);
  const terrainInfo = terrainTypes[terrain];
  const resource = createResource(x, y, terrain);
  const risk = terrain === "volcanic" ? 0.52 : seededNoise(x, y, 5) > 0.88 ? 0.34 : seededNoise(x, y, 6) * 0.18;
  return {
    id: `${x}-${y}`,
    x,
    y,
    terrain,
    terrainName: terrainInfo.name,
    resource,
    risk,
    district: null,
    stage: 0,
    growth: 0,
    population: 0,
    jobsAvailable: 0,
    jobsFilled: 0,
    production: 0,
    logistics: 0,
    happiness: 0.5,
    pollution: 0,
    stability: 0.8,
    damage: 0,
    hub: null,
    activity: seededNoise(x, y, 11),
  };
}

function initWorld() {
  for (let y = 0; y < state.rows; y += 1) {
    for (let x = 0; x < state.cols; x += 1) {
      state.cells.push(makeCell(x, y));
    }
  }

  seedDistrict(3, 6, "housing");
  seedDistrict(4, 6, "housing");
  seedDistrict(5, 6, "agriculture");
  seedDistrict(7, 5, "industrial");
  seedDistrict(8, 5, "industrial");
  seedDistrict(12, 7, "research");
  seedDistrict(15, 4, "military");
  placeHub(cellAt(6, 6), "spaceport");
  placeHub(cellAt(10, 6), "rail");

  state.selectedCell = cellAt(7, 5);
  pushEvent("殖民前哨完成，星球规划权限开放。");
  pushEvent("山地矿脉已标记，工业区获得资源适配加成。");
}

function seedDistrict(x, y, type) {
  const cell = cellAt(x, y);
  if (!cell) return;
  assignDistrict(cell, type, true);
  cell.stage = 1 + Math.floor(seededNoise(x, y, 20) * 2);
  cell.growth = seededNoise(x, y, 21) * 0.5;
  recalcCell(cell, 1);
}

function cellAt(x, y) {
  return state.cells.find((cell) => cell.x === x && cell.y === y);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.floor(rect.width * scale);
  canvas.height = Math.floor(rect.height * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);

  const usableW = Math.max(320, rect.width - 72);
  const usableH = Math.max(300, rect.height - 140);
  const cell = Math.floor(Math.min(usableW / state.cols, usableH / state.rows));
  state.layout.cell = Math.max(20, Math.min(44, cell));
  state.layout.gap = Math.max(2, Math.floor(state.layout.cell * 0.08));
  state.layout.mapW = state.cols * state.layout.cell;
  state.layout.mapH = state.rows * state.layout.cell;
  state.layout.left = Math.floor((rect.width - state.layout.mapW) / 2);
  state.layout.top = Math.floor((rect.height - state.layout.mapH) / 2 + 28);
}

function buildDistrictButtons() {
  ui.districtTypes.innerHTML = Object.entries(districtTypes)
    .map(([key, type]) => {
      const active = key === state.selectedType ? " active" : "";
      return `<button class="district-button${active}" data-type="${key}" type="button">
        <span class="swatch" style="background:${type.color}"></span>
        <span>${type.name}</span>
      </button>`;
    })
    .join("");
}

function bindEvents() {
  window.addEventListener("resize", resizeCanvas);

  ui.districtTypes.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-type]");
    if (!button) return;
    state.selectedType = button.dataset.type;
    buildDistrictButtons();
  });

  ui.viewModes.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-view]");
    if (!button) return;
    state.view = button.dataset.view;
    setActiveButton(ui.viewModes, button);
  });

  ui.toolModes.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-tool]");
    if (!button) return;
    state.tool = button.dataset.tool;
    setActiveButton(ui.toolModes, button);
    canvas.style.cursor = state.tool === "inspect" ? "default" : "crosshair";
  });

  ui.speedControls.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-speed]");
    if (!button) return;
    state.speed = Number(button.dataset.speed);
    setActiveButton(ui.speedControls, button);
  });

  ui.policySelect.addEventListener("change", () => {
    pushEvent(`${policies[ui.policySelect.value].name} 已生效。`);
  });

  ui.transportSelect.addEventListener("change", () => {
    pushEvent(`运输策略切换为 ${transportStrategies[ui.transportSelect.value].name}。`);
  });

  canvas.addEventListener("pointerdown", (event) => {
    const cell = pickCell(event);
    if (!cell) return;
    state.isPainting = true;
    handleCellAction(cell);
  });

  canvas.addEventListener("pointermove", (event) => {
    state.hoverCell = pickCell(event);
    if (state.isPainting && state.tool === "zone" && state.hoverCell) {
      handleCellAction(state.hoverCell);
    }
  });

  window.addEventListener("pointerup", () => {
    state.isPainting = false;
  });

  canvas.addEventListener("mouseleave", () => {
    state.hoverCell = null;
    state.isPainting = false;
  });
}

function setActiveButton(container, activeButton) {
  container.querySelectorAll("button").forEach((button) => button.classList.remove("active"));
  activeButton.classList.add("active");
}

function pickCell(event) {
  const rect = canvas.getBoundingClientRect();
  const px = event.clientX - rect.left;
  const py = event.clientY - rect.top;
  const x = Math.floor((px - state.layout.left) / state.layout.cell);
  const y = Math.floor((py - state.layout.top) / state.layout.cell);
  if (x < 0 || y < 0 || x >= state.cols || y >= state.rows) return null;
  return cellAt(x, y);
}

function handleCellAction(cell) {
  state.selectedCell = cell;
  if (state.tool === "zone") {
    assignDistrict(cell, state.selectedType);
  }
  if (state.tool === "hub") {
    placeHub(cell);
  }
  renderSelectedPanel();
}

function assignDistrict(cell, type, silent = false) {
  if (cell.terrain === "ocean" && type !== "research" && type !== "industrial") {
    return;
  }

  const changed = cell.district !== type;
  cell.district = type;
  cell.stage = Math.max(cell.stage, 1);
  cell.growth = changed ? 0.08 : cell.growth;
  cell.damage = Math.max(0, cell.damage - 0.12);
  recalcCell(cell, 1);

  if (changed && !silent) {
    pushEvent(`${cell.terrainName} 区块指定为${districtTypes[type].name}区。`);
  }
}

function placeHub(cell, forcedType = "") {
  if (!cell || cell.terrain === "ocean") return;
  if (cell.hub) {
    state.hubs = state.hubs.filter((hub) => hub.id !== cell.hub);
    cell.hub = null;
    pushEvent("交通枢纽已撤销。");
    return;
  }

  const hubType = forcedType || (cell.terrain === "mountain" || cell.terrain === "hill" ? "rail" : "road");
  const hub = {
    id: `hub-${Date.now()}-${cell.id}`,
    type: hubType,
    cellId: cell.id,
    capacity: hubType === "spaceport" ? 120 : hubType === "rail" ? 82 : 58,
    load: 0,
    damage: 0,
  };
  state.hubs.push(hub);
  cell.hub = hub.id;
  pushEvent(`${hubName(hub.type)} 枢纽已部署。`);
}

function hubName(type) {
  return {
    road: "公路",
    rail: "轨道",
    spaceport: "太空港",
  }[type] || "交通";
}

function simulate(deltaSeconds) {
  if (state.speed <= 0) return;
  state.tickRemainder += deltaSeconds * state.speed;
  while (state.tickRemainder >= 0.5) {
    state.tickRemainder -= 0.5;
    state.day += 0.5;
    runSimulationStep(0.5);
  }
}

function runSimulationStep(step) {
  state.cells.forEach((cell) => {
    if (cell.district) {
      recalcCell(cell, step);
    }
  });

  state.hubs.forEach((hub) => {
    const nearby = getCellsNear(hub.cellId, 4).filter((cell) => cell.district);
    hub.load = nearby.reduce((sum, cell) => sum + (cell.jobsAvailable + cell.population) / 1400, 0);
    hub.damage = Math.max(0, hub.damage - 0.002 * step);
  });

  if (Math.floor(state.day) % 31 === 0 && seededNoise(Math.floor(state.day), state.events.length, 40) > 0.84) {
    triggerEvent();
  }
}

function recalcCell(cell, step) {
  const type = districtTypes[cell.district];
  if (!type) return;

  const policy = policies[ui.policySelect.value];
  const transport = transportStrategies[ui.transportSelect.value];
  const terrain = terrainTypes[cell.terrain];
  const terrainFit = terrain.build[cell.district] || 1;
  const resourceFit = getResourceFit(cell);
  const nearbyHubs = getNearbyHubs(cell, 4);
  const hubBoost = nearbyHubs.length ? 0.22 + Math.min(0.34, nearbyHubs.length * 0.11) : 0;
  const damagePenalty = 1 - cell.damage * 0.72;
  const baseStage = Math.max(1, cell.stage);

  const logistics = clamp((0.42 + hubBoost + resourceFit * 0.09 + transport.logistics * 0.15) * damagePenalty - cell.risk * 0.08);
  const pollutionBase = {
    housing: 0.16,
    industrial: 0.62,
    agriculture: 0.22,
    research: 0.28,
    military: 0.34,
  }[cell.district];

  const capacity = {
    housing: 2400,
    industrial: 420,
    agriculture: 340,
    research: 520,
    military: 460,
  }[cell.district] * baseStage;

  const jobsBase = {
    housing: 220,
    industrial: 1200,
    agriculture: 820,
    research: 920,
    military: 760,
  }[cell.district] * baseStage * (policy.jobs || 1);

  const localPopTarget = cell.district === "housing" ? capacity * (0.4 + logistics * 0.5) : capacity * 0.22;
  const neighborHousing = getCellsNear(cell.id, 4).filter((near) => near.district === "housing");
  const workforce = neighborHousing.reduce((sum, near) => sum + near.population * 0.52, 0) / Math.max(1, neighborHousing.length || 1);

  cell.population = lerp(cell.population, localPopTarget, 0.035 * step);
  cell.jobsAvailable = lerp(cell.jobsAvailable, jobsBase, 0.08 * step);
  cell.jobsFilled = Math.min(cell.jobsAvailable, cell.district === "housing" ? cell.population * 0.34 : workforce * (0.55 + logistics * 0.38));
  cell.logistics = lerp(cell.logistics, logistics, 0.12 * step);
  cell.pollution = lerp(cell.pollution, clamp(pollutionBase * policy.pollution * baseStage * 0.32 + cell.damage * 0.24), 0.08 * step);

  const employmentRate = cell.jobsAvailable > 0 ? cell.jobsFilled / cell.jobsAvailable : 0.8;
  const happinessTarget = clamp(
    0.55 +
      employmentRate * 0.18 +
      cell.logistics * 0.12 -
      cell.pollution * 0.22 -
      cell.risk * 0.12 -
      cell.damage * 0.34,
  );
  cell.happiness = lerp(cell.happiness, happinessTarget * policy.happiness, 0.08 * step);
  cell.stability = lerp(cell.stability, clamp(0.45 + cell.happiness * 0.44 + (cell.district === "military" ? 0.16 : 0) - cell.damage * 0.3), 0.08 * step);

  const outputBias = {
    housing: 0.44,
    industrial: 1.2,
    agriculture: 0.86,
    research: 1.02,
    military: 0.78,
  }[cell.district];
  const policyTypeBoost =
    (cell.district === "research" && policy.research) ||
    (cell.district === "military" && policy.military) ||
    1;

  cell.production = lerp(
    cell.production,
    100 * outputBias * baseStage * terrainFit * resourceFit * cell.logistics * employmentRate * policy.production * policyTypeBoost * damagePenalty,
    0.08 * step,
  );

  const growthScore =
    cell.happiness * 0.2 +
    employmentRate * 0.15 +
    cell.logistics * 0.2 +
    terrainFit * 0.1 +
    resourceFit * 0.08 +
    policy.growth * 0.12 +
    cell.stability * 0.1 -
    cell.pollution * 0.08 -
    cell.damage * 0.18;

  if (growthScore > 0.66 && cell.stage < 3) {
    cell.growth += (growthScore - 0.58) * 0.012 * step * state.speed;
    if (cell.growth >= 1) {
      cell.stage += 1;
      cell.growth = 0.08;
      pushEvent(`${districtTypes[cell.district].name}区进入阶段 ${cell.stage}。`);
    }
  } else {
    cell.growth = Math.max(0, cell.growth - 0.002 * step);
  }
}

function getResourceFit(cell) {
  if (!cell.resource) return 1;
  const table = {
    "矿": { industrial: 1.26, military: 1.08 },
    "能": { industrial: 1.12, research: 1.16, military: 1.08 },
    "稀": { research: 1.28, industrial: 1.1 },
    "生": { agriculture: 1.24, research: 1.1 },
    "遗": { research: 1.34, military: 1.06 },
  };
  return table[cell.resource]?.[cell.district] || 1.04;
}

function getNearbyHubs(cell, distance) {
  return state.hubs
    .map((hub) => ({ hub, cell: state.cells.find((candidate) => candidate.id === hub.cellId) }))
    .filter((entry) => entry.cell && manhattan(cell, entry.cell) <= distance)
    .map((entry) => entry.hub);
}

function getCellsNear(cellId, distance) {
  const origin = state.cells.find((cell) => cell.id === cellId);
  if (!origin) return [];
  return state.cells.filter((cell) => manhattan(origin, cell) <= distance && cell.id !== origin.id);
}

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function triggerEvent() {
  const candidates = state.cells.filter((cell) => cell.district && cell.risk > 0.25);
  if (!candidates.length) return;
  const cell = candidates[Math.floor(seededNoise(state.day, candidates.length, 71) * candidates.length)];
  cell.damage = clamp(cell.damage + 0.28 + cell.risk * 0.28);
  pushEvent(`${cell.terrainName} 灾害冲击 ${districtTypes[cell.district].name}区，修复流程启动。`, "danger");
}

function pushEvent(text, level = "") {
  state.events.unshift({ text, level, day: Math.floor(state.day) });
  state.events = state.events.slice(0, 7);
  renderEventLog();
}

function render() {
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  drawBackdrop(rect);
  drawPlanetFrame(rect);
  drawTransport();
  drawCells();
  drawParticles();
  renderStats();
  renderSelectedPanel();
  requestAnimationFrame(loop);
}

function loop(time) {
  const delta = state.lastTime ? Math.min(0.05, (time - state.lastTime) / 1000) : 0;
  state.lastTime = time;
  simulate(delta);
  render();
}

function drawBackdrop(rect) {
  const g = ctx.createLinearGradient(0, 0, rect.width, rect.height);
  g.addColorStop(0, "#141923");
  g.addColorStop(0.52, "#0d1118");
  g.addColorStop(1, "#151815");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, rect.width, rect.height);

  ctx.save();
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 90; i += 1) {
    const x = seededNoise(i, 0, 91) * rect.width;
    const y = seededNoise(i, 0, 92) * rect.height;
    const r = 0.7 + seededNoise(i, 0, 93) * 1.2;
    ctx.fillStyle = "#d7f3ff";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPlanetFrame(rect) {
  const { left, top, mapW, mapH } = state.layout;
  const cx = left + mapW / 2;
  const cy = top + mapH / 2;
  const rx = mapW * 0.58;
  const ry = mapH * 0.64;

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#17242b";
  ctx.fill();
  ctx.strokeStyle = "rgba(190, 230, 232, 0.2)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function cellRect(cell) {
  const { left, top, cell: size, gap } = state.layout;
  return {
    x: left + cell.x * size + gap,
    y: top + cell.y * size + gap,
    w: size - gap * 2,
    h: size - gap * 2,
  };
}

function cellCenter(cell) {
  const rect = cellRect(cell);
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

function drawCells() {
  state.cells.forEach((cell) => {
    const rect = cellRect(cell);
    drawTerrain(cell, rect);
    if (cell.district) drawDistrict(cell, rect);
    if (state.view !== "macro" && cell.district) drawBuildings(cell, rect);
    if (state.view === "macro") drawMacroOverlay(cell, rect);
    if (cell.resource) drawResource(cell, rect);
    if (cell.hub) drawHub(cell, rect);
    if (cell.damage > 0.1) drawDamage(cell, rect);
    drawCellOutline(cell, rect);
  });
}

function drawTerrain(cell, rect) {
  const terrain = terrainTypes[cell.terrain];
  ctx.fillStyle = terrain.color;
  roundRect(rect.x, rect.y, rect.w, rect.h, 6);
  ctx.fill();

  if (cell.terrain === "plain" || cell.terrain === "agriculture") {
    drawChecker(rect, terrain.accent, 0.11);
  }
  if (cell.terrain === "ocean") {
    drawWaves(rect, terrain.accent);
  }
  if (cell.terrain === "mountain" || cell.terrain === "hill") {
    drawRidges(rect, terrain.accent);
  }
  if (cell.terrain === "desert" || cell.terrain === "ice") {
    drawBands(rect, terrain.accent, cell.terrain === "ice" ? 0.2 : 0.13);
  }
  if (cell.terrain === "jungle") {
    drawDots(rect, terrain.accent, 5, 0.24);
  }
  if (cell.terrain === "volcanic") {
    drawCracks(rect, terrain.accent);
  }
}

function drawDistrict(cell, rect) {
  const info = districtTypes[cell.district];
  const stageAlpha = 0.2 + cell.stage * 0.13;
  ctx.fillStyle = withAlpha(info.color, stageAlpha);
  roundRect(rect.x + 2, rect.y + 2, rect.w - 4, rect.h - 4, 5);
  ctx.fill();

  if (cell.district === "agriculture") {
    drawChecker({ x: rect.x + 3, y: rect.y + 3, w: rect.w - 6, h: rect.h - 6 }, "#e1f1aa", 0.18);
  }

  if (state.view === "macro") {
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 12px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(info.short, rect.x + rect.w / 2, rect.y + rect.h / 2);
  }
}

function drawBuildings(cell, rect) {
  const count = Math.max(1, cell.stage * 2 + (state.view === "micro" ? 2 : 0));
  for (let i = 0; i < count; i += 1) {
    const seed = seededNoise(cell.x + i, cell.y, 30);
    const bw = rect.w * (0.16 + seededNoise(cell.x, i, 31) * 0.1);
    const bh = rect.h * (0.16 + seededNoise(cell.y, i, 32) * 0.18) * (cell.stage * 0.42);
    const bx = rect.x + 5 + seed * Math.max(2, rect.w - bw - 10);
    const by = rect.y + rect.h - 5 - bh - seededNoise(i, cell.x, 33) * rect.h * 0.4;
    drawBuildingShape(cell, bx, by, bw, bh, i);
  }
}

function drawBuildingShape(cell, x, y, w, h, i) {
  const color = districtTypes[cell.district].color;
  ctx.fillStyle = mixColor(color, "#f4f7f8", 0.22);

  if (cell.district === "agriculture") {
    ctx.fillStyle = i % 2 ? "#b9d778" : "#719f4e";
    ctx.fillRect(x, y + h * 0.5, w * 1.3, h * 0.5);
    return;
  }

  if (cell.district === "military") {
    ctx.fillRect(x, y, w, h);
    ctx.fillRect(x - w * 0.25, y + h * 0.42, w * 1.5, h * 0.18);
    return;
  }

  if (cell.district === "research") {
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h / 2, Math.max(w, h) * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = withAlpha("#ffffff", 0.5);
    ctx.stroke();
    return;
  }

  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = withAlpha("#ffffff", 0.38);
  const floors = Math.max(1, Math.floor(h / 7));
  for (let f = 1; f < floors; f += 1) {
    ctx.fillRect(x + 2, y + f * 6, Math.max(2, w - 4), 1);
  }
}

function drawMacroOverlay(cell, rect) {
  if (!cell.district) return;
  let value = cell.production / 330;
  let color = "#70d6c5";
  if (cell.happiness < 0.42 || cell.logistics < 0.42) {
    value = Math.max(0.14, 1 - Math.min(cell.happiness, cell.logistics));
    color = cell.happiness < 0.42 ? "#df6b71" : "#f2bc5e";
  }
  ctx.fillStyle = withAlpha(color, 0.55);
  ctx.fillRect(rect.x + 4, rect.y + rect.h - 7, (rect.w - 8) * clamp(value), 3);
}

function drawResource(cell, rect) {
  ctx.fillStyle = "#11171d";
  ctx.beginPath();
  ctx.arc(rect.x + rect.w - 8, rect.y + 8, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.stroke();
  ctx.fillStyle = "#f3e8b4";
  ctx.font = "700 10px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(cell.resource, rect.x + rect.w - 8, rect.y + 8);
}

function drawHub(cell, rect) {
  const hub = state.hubs.find((candidate) => candidate.id === cell.hub);
  if (!hub) return;
  ctx.fillStyle = "#eff7fb";
  ctx.strokeStyle = "#0c1117";
  ctx.lineWidth = 2;
  const cx = rect.x + rect.w * 0.28;
  const cy = rect.y + rect.h * 0.28;
  ctx.beginPath();
  ctx.arc(cx, cy, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#0d1218";
  ctx.font = "700 9px system-ui";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(hub.type === "spaceport" ? "港" : hub.type === "rail" ? "轨" : "路", cx, cy);
}

function drawDamage(cell, rect) {
  ctx.save();
  ctx.globalAlpha = clamp(cell.damage, 0.12, 0.72);
  ctx.strokeStyle = "#f17665";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(rect.x + rect.w * 0.25, rect.y + rect.h * 0.2);
  ctx.lineTo(rect.x + rect.w * 0.52, rect.y + rect.h * 0.48);
  ctx.lineTo(rect.x + rect.w * 0.38, rect.y + rect.h * 0.78);
  ctx.stroke();
  ctx.restore();
}

function drawCellOutline(cell, rect) {
  const selected = state.selectedCell?.id === cell.id;
  const hovered = state.hoverCell?.id === cell.id;
  ctx.strokeStyle = selected ? "#ffffff" : hovered ? "rgba(255,255,255,0.58)" : "rgba(255,255,255,0.08)";
  ctx.lineWidth = selected ? 2 : 1;
  roundRect(rect.x, rect.y, rect.w, rect.h, 6);
  ctx.stroke();
}

function drawTransport() {
  ctx.save();
  state.hubs.forEach((hub) => {
    const hubCell = state.cells.find((cell) => cell.id === hub.cellId);
    if (!hubCell) return;
    const start = cellCenter(hubCell);
    getCellsNear(hub.cellId, 4)
      .filter((cell) => cell.district)
      .forEach((cell) => {
        const end = cellCenter(cell);
        const alpha = state.view === "macro" ? 0.18 : 0.32;
        ctx.strokeStyle = withAlpha(hub.type === "rail" ? "#bfe4ff" : "#f4d382", alpha);
        ctx.lineWidth = hub.type === "rail" ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      });
  });
  ctx.restore();
}

function drawParticles() {
  if (state.view === "macro") return;
  const time = performance.now() / 1000;
  state.hubs.forEach((hub) => {
    const hubCell = state.cells.find((cell) => cell.id === hub.cellId);
    if (!hubCell) return;
    const start = cellCenter(hubCell);
    const targets = getCellsNear(hub.cellId, 4).filter((cell) => cell.district && cell.logistics > 0.35);
    targets.slice(0, state.view === "micro" ? 10 : 5).forEach((cell, i) => {
      const end = cellCenter(cell);
      const t = (time * 0.22 + i * 0.17 + cell.activity) % 1;
      const x = lerp(start.x, end.x, t);
      const y = lerp(start.y, end.y, t);
      ctx.fillStyle = hub.type === "rail" ? "#d6efff" : "#ffe3a3";
      ctx.beginPath();
      ctx.arc(x, y, state.view === "micro" ? 3 : 2, 0, Math.PI * 2);
      ctx.fill();
    });
  });
}

function drawChecker(rect, color, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  const step = Math.max(7, Math.floor(rect.w / 4));
  for (let y = rect.y; y < rect.y + rect.h; y += step) {
    for (let x = rect.x; x < rect.x + rect.w; x += step) {
      if ((Math.floor((x - rect.x) / step) + Math.floor((y - rect.y) / step)) % 2 === 0) {
        ctx.fillRect(x, y, step, step);
      }
    }
  }
  ctx.restore();
}

function drawWaves(rect, color) {
  ctx.save();
  ctx.strokeStyle = withAlpha(color, 0.32);
  ctx.lineWidth = 1;
  for (let y = rect.y + 8; y < rect.y + rect.h; y += 10) {
    ctx.beginPath();
    ctx.moveTo(rect.x + 3, y);
    ctx.quadraticCurveTo(rect.x + rect.w * 0.28, y - 4, rect.x + rect.w * 0.55, y);
    ctx.quadraticCurveTo(rect.x + rect.w * 0.78, y + 4, rect.x + rect.w - 3, y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRidges(rect, color) {
  ctx.strokeStyle = withAlpha(color, 0.32);
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.moveTo(rect.x + 5 + i * 7, rect.y + rect.h - 6);
    ctx.lineTo(rect.x + rect.w * 0.42 + i * 4, rect.y + 7);
    ctx.lineTo(rect.x + rect.w - 5, rect.y + rect.h - 8 - i * 5);
    ctx.stroke();
  }
}

function drawBands(rect, color, alpha) {
  ctx.save();
  ctx.strokeStyle = withAlpha(color, alpha);
  ctx.lineWidth = 2;
  for (let y = rect.y + 8; y < rect.y + rect.h; y += 10) {
    ctx.beginPath();
    ctx.moveTo(rect.x + 4, y);
    ctx.lineTo(rect.x + rect.w - 4, y + 4);
    ctx.stroke();
  }
  ctx.restore();
}

function drawDots(rect, color, size, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let i = 0; i < 7; i += 1) {
    const x = rect.x + seededNoise(rect.x, i, 50) * rect.w;
    const y = rect.y + seededNoise(rect.y, i, 51) * rect.h;
    ctx.beginPath();
    ctx.arc(x, y, size * seededNoise(i, rect.x, 52), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawCracks(rect, color) {
  ctx.strokeStyle = withAlpha(color, 0.45);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(rect.x + rect.w * 0.18, rect.y + rect.h * 0.25);
  ctx.lineTo(rect.x + rect.w * 0.48, rect.y + rect.h * 0.42);
  ctx.lineTo(rect.x + rect.w * 0.38, rect.y + rect.h * 0.72);
  ctx.lineTo(rect.x + rect.w * 0.74, rect.y + rect.h * 0.84);
  ctx.stroke();
}

function roundRect(x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function withAlpha(hex, alpha) {
  const rgb = hexToRgb(hex);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function renderStats() {
  const districts = state.cells.filter((cell) => cell.district);
  const population = districts.reduce((sum, cell) => sum + cell.population, 0);
  const production = districts.reduce((sum, cell) => sum + cell.production, 0);
  const logistics = avg(districts.map((cell) => cell.logistics));
  const happiness = avg(districts.map((cell) => cell.happiness));
  ui.planetStats.innerHTML = [
    ["人口", formatInt(population)],
    ["产能", formatInt(production)],
    ["物流", formatPct(logistics)],
    ["幸福", formatPct(happiness)],
  ]
    .map(
      ([label, value]) => `<div class="stat-chip">
        <div class="stat-label">${label}</div>
        <div class="stat-value">${value}</div>
      </div>`,
    )
    .join("");
}

function renderSelectedPanel() {
  const cell = state.selectedCell;
  if (!cell) {
    ui.selectedPanel.innerHTML = `<div class="section-title">区块详情</div><div class="empty-state">未选择区块</div>`;
    return;
  }

  const districtName = cell.district ? `${districtTypes[cell.district].name}区` : "未开发区";
  const rows = [
    ["成长", cell.growth, ""],
    ["物流", cell.logistics, cell.logistics < 0.42 ? "warn" : ""],
    ["幸福", cell.happiness, cell.happiness < 0.42 ? "danger" : ""],
    ["就业", cell.jobsAvailable ? cell.jobsFilled / cell.jobsAvailable : 0, ""],
    ["污染", cell.pollution, cell.pollution > 0.58 ? "danger" : ""],
    ["稳定", cell.stability, cell.stability < 0.52 ? "warn" : ""],
    ["损毁", cell.damage, cell.damage > 0.2 ? "danger" : ""],
  ];

  ui.selectedPanel.innerHTML = `
    <div class="section-title">区块详情</div>
    <div class="district-heading">
      <div class="district-name">${districtName}</div>
      <div class="stage-pill">阶段 ${cell.stage}</div>
    </div>
    <div class="metric-list">
      ${rows
        .map(
          ([label, value, level]) => `<div class="metric-row ${level}">
            <span>${label}</span>
            <div class="meter"><span style="width:${formatPct(value)}"></span></div>
            <b>${formatPct(value)}</b>
          </div>`,
        )
        .join("")}
    </div>
    <div class="empty-state" style="margin-top:12px">
      ${cell.terrainName} · ${cell.resource ? `资源 ${cell.resource}` : "无显著资源"} · 人口 ${formatInt(cell.population)} · 产能 ${formatInt(cell.production)}
    </div>
  `;
}

function renderEventLog() {
  ui.eventLog.innerHTML = state.events
    .map((event) => `<div class="event-item ${event.level}">D${event.day} · ${event.text}</div>`)
    .join("");
}

function avg(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

initWorld();
buildDistrictButtons();
bindEvents();
resizeCanvas();
renderEventLog();
requestAnimationFrame(loop);
