import { readFile } from "node:fs/promises";

const path = new URL("../src/data/game-balance.json", import.meta.url);
const balance = JSON.parse(await readFile(path, "utf8"));
const requiredSections = [
  "terrain",
  "resourceNodes",
  "economyResources",
  "districts",
  "hubs",
  "modifiers",
  "simulation",
];

requiredSections.forEach((section) => {
  if (!balance[section] || typeof balance[section] !== "object") {
    throw new Error(`Missing balance section: ${section}`);
  }
});

Object.entries(balance.districts).forEach(([key, district]) => {
  if (!district.name || !district.color || !district.bonus) {
    throw new Error(`District ${key} is missing presentation fields`);
  }
  if (key === "none") return;
  if (!district.economy?.cost || !district.economy?.hourly) {
    throw new Error(`District ${key} is missing economy values`);
  }
  ["housing", "jobs", "defense"].forEach((field) => {
    if (!Number.isFinite(district.economy[field])) {
      throw new Error(`District ${key} has invalid ${field}`);
    }
  });
});

if (balance.simulation.buildingStageThresholds.some((value, index, values) => (
  !Number.isFinite(value) || value <= 0 || value >= 1 || (index > 0 && value <= values[index - 1])
))) {
  throw new Error("Building stage thresholds must be ascending values between 0 and 1");
}

console.log("Game balance configuration is valid");
