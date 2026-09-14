import type { GameState } from "../simulation/types";

const SAVE_KEY = "distant-stars-save-v1";

export function saveGame(state: GameState) { localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, lastAutosaveAt: state.time })); }
export function loadGame(): GameState | null {
  try { const value = localStorage.getItem(SAVE_KEY); if (!value) return null; const parsed = JSON.parse(value) as GameState; return parsed.version === 1 ? parsed : null; } catch { return null; }
}
export function hasSave() { return localStorage.getItem(SAVE_KEY) !== null; }
