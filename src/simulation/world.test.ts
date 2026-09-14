import { describe, expect, it } from "vitest";
import { YEAR_MS } from "./content";
import { advance, createGame, launchColony, launchProbe, markMessagesRead, sendPolicy } from "./world";

describe("deterministic interstellar simulation", () => {
  it("generates the same standard map", () => { expect(createGame().systems).toEqual(createGame().systems); });
  it("reports arrive only after travel plus light delay", () => {
    const initial = createGame(); const target = initial.systems[1]; const launched = launchProbe(initial, target.id);
    expect(advance(launched, target.distance / 0.1 + target.distance - 0.1).intel[target.id].level).toBe("observed");
    expect(advance(launched, target.distance / 0.1 + target.distance + 0.1).intel[target.id].level).toBe("surveyed");
  });
  it("policy commands take one light-distance to arrive", () => {
    const state = createGame(); const target = state.systems[1]; state.worlds[target.id] = { ...state.worlds.sol, systemId: target.id };
    const ordered = sendPolicy(state, target.id, "ecology");
    expect(advance(ordered, target.distance - 0.01).worlds[target.id].policy).toBe("balanced");
    expect(advance(ordered, target.distance + 0.01).worlds[target.id].policy).toBe("ecology");
    expect(ordered.orders[0].arrivesAt - ordered.orders[0].issuedAt).toBeCloseTo(target.distance * YEAR_MS, -4);
  });
  it("keeps future reports unread and preserves the historical colony snapshot", () => {
    const initial = createGame(); const target = initial.systems[1];
    const surveyed = advance(launchProbe(initial, target.id), target.distance / 0.1 + target.distance + 0.1);
    const launched = launchColony(surveyed, target.id);
    const read = markMessagesRead(launched);
    const completed = advance(read, target.distance / 0.055 + target.distance + 0.1);
    const report = completed.messages.find((item) => item.id.startsWith("colony-report-"))!;
    expect(report.unread).toBe(true);
    expect(completed.intel[target.id].worldSnapshot?.population).toBe(report.worldSnapshot?.population);
    expect(completed.speed).toBe(0);
  });
});
