/** Decorative hull and glass markings; all navigation remains in the live scene. */
export function CockpitFrame() {
    return <div className="cockpit-frame" aria-hidden="true">
        <div className="window-caption"><span />CENTRAL COMMAND DISPLAY<span /></div>
        <div className="glass-reflection" />
        <div className="window-brace port" /><div className="window-brace starboard" />
        <div className="window-scale port"><span>＋</span><i /><span>＋</span></div>
        <div className="window-scale starboard"><span>＋</span><i /><span>＋</span></div>
        <div className="window-sill"><span>DS — 01</span><i /><span>指挥中控</span></div>
    </div>;
}

const instrumentPaths = {
    overview: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    economy: 'M4 8h16v12H4Z M8 8V4h8v4 M4 12h16 M10 12v3h4v-3',
    population: 'M9 7a3 3 0 1 1 6 0 3 3 0 0 1-6 0 M5 21v-3a7 7 0 0 1 14 0v3 M3 6v5 M.5 8.5h5 M21 6v5 M18.5 8.5h5',
    research: 'M9 3h6 M10 3v7l-6 9a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2l-6-9V3 M7 15h10',
    planning: 'M3 9l9-5 9 5-9 5-9-5Z M3 14l9 5 9-5 M3 19l9 5 9-5',
    transport: 'M12 2l8 19-8-4-8 4 8-19Z M12 8v9',
    contact: 'M5 5a10 10 0 0 0 0 14 M19 5a10 10 0 0 1 0 14 M8 8a6 6 0 0 0 0 8 M16 8a6 6 0 0 1 0 8 M12 11v2',
    orders: 'M5 4h14v17H5Z M9 2h6v4H9Z M8 10h8 M8 14h8 M8 18h5',
    history: 'M3 11a9 9 0 1 1 2 7 M3 5v6h6 M12 7v6l4 2',
};

export function InstrumentIcon({ name }: { name: keyof typeof instrumentPaths }) {
    return <svg viewBox="0 0 24 26" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={instrumentPaths[name]} /></svg>;
}
