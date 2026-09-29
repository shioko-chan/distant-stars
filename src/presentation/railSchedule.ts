/** Light-rail timetables: trapezoid speed profiles between stops, dwells at stations and terminal turnbacks. */
export const RAIL_ACCELERATION = 1.1;
export const RAIL_CRUISE_SPEED = 42;
export const STATION_DWELL = 24;
export const TERMINAL_DWELL = 70;

interface Run { start: number; duration: number; from: number; to: number; kind: 'run' | 'dwell' | 'terminal'; before: number; after: number }
export interface RailTimetable { runs: Run[]; period: number; loop: number }
export interface RailSample { distance: number; speed: number; lateral: number; stopped: boolean; terminal: boolean }

const rampDistance = RAIL_CRUISE_SPEED ** 2 / RAIL_ACCELERATION;

export function runDuration(distance: number) {
    const d = Math.abs(distance);
    return d >= rampDistance ? d / RAIL_CRUISE_SPEED + RAIL_CRUISE_SPEED / RAIL_ACCELERATION : 2 * Math.sqrt(d / RAIL_ACCELERATION);
}

/** Distance and speed after `t` seconds of a run that starts and ends at rest. */
function profile(distance: number, t: number): [covered: number, speed: number] {
    const total = runDuration(distance), a = RAIL_ACCELERATION;
    const peak = distance >= rampDistance ? RAIL_CRUISE_SPEED : Math.sqrt(distance * a);
    const ramp = peak / a;
    if (t <= ramp) return [.5 * a * t * t, a * t];
    if (t >= total - ramp) { const left = total - t; return [distance - .5 * a * left * left, a * left]; }
    return [.5 * a * ramp * ramp + peak * (t - ramp), peak];
}

/**
 * A ring line (`loop` = its length) circulates through its stops in one direction.
 * A shuttle line runs out along its stops and back, turning at a terminal at each end.
 */
export function createTimetable(stops: readonly number[], { loop = 0, reverse = false } = {}): RailTimetable {
    const sorted = [...stops].sort((a, b) => a - b);
    let path: number[], terminalAt = new Set<number>();
    if (loop) {
        const order = reverse ? [...sorted].reverse() : sorted;
        path = [...order, order[0] + (reverse ? -loop : loop)];
    }
    else {
        path = [...sorted, ...sorted.slice(0, -1).reverse()];
        terminalAt = new Set([0, sorted.length - 1]);
    }
    const runs: Run[] = [];
    let time = 0;
    const sign = (a: number, b: number) => Math.sign(b - a) || 1;
    for (let i = 0; i < path.length - 1; i++) {
        const after = sign(path[i], path[i + 1]);
        const terminal = terminalAt.has(i);
        const dwell = terminal ? TERMINAL_DWELL : STATION_DWELL;
        // A terminal reverses the train: it arrived heading the opposite way.
        runs.push({ start: time, duration: dwell, from: path[i], to: path[i], kind: terminal ? 'terminal' : 'dwell', before: terminal ? -after : after, after });
        time += dwell;
        const duration = runDuration(path[i + 1] - path[i]);
        runs.push({ start: time, duration, from: path[i], to: path[i + 1], kind: 'run', before: after, after });
        time += duration;
    }
    return { runs, period: time, loop };
}

export function sampleTimetable(table: RailTimetable, seconds: number): RailSample {
    const t = (seconds % table.period + table.period) % table.period;
    let low = 0, high = table.runs.length - 1;
    while (low < high) { const mid = (low + high + 1) >> 1; if (table.runs[mid].start <= t) low = mid; else high = mid - 1; }
    const run = table.runs[low], local = t - run.start;
    const wrap = (distance: number) => table.loop ? (distance % table.loop + table.loop) % table.loop : distance;
    if (run.kind !== 'run') {
        // At a terminal the train crosses over to the return track while it stands at the platform.
        const progress = Math.min(1, Math.max(0, (local / run.duration - .3) / .4));
        const blend = progress * progress * (3 - 2 * progress);
        return { distance: wrap(run.from), speed: 0, stopped: true, terminal: run.kind === 'terminal',
            lateral: run.kind === 'terminal' ? run.before + (run.after - run.before) * blend : run.after };
    }
    const [covered, speed] = profile(Math.abs(run.to - run.from), local);
    return { distance: wrap(run.from + Math.sign(run.to - run.from) * covered), speed, lateral: run.after, stopped: false, terminal: false };
}
