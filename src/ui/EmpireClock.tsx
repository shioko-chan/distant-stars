import { useEffect, useState, type RefObject } from 'react';

export function formatEmpireDate(time: number, monthFraction = 0) {
    const monthIndex = Math.round(time * 12);
    const year = Math.floor(monthIndex / 12), month = monthIndex % 12;
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month];
    const day = 1 + Math.min(days - 1, Math.floor(Math.max(0, monthFraction) * days));
    return `${year}.${String(month + 1).padStart(2, '0')}.${String(day).padStart(2, '0')}`;
}

export function EmpireClock({ time, fraction, pending }: {
    time: number; fraction: RefObject<number>; pending: RefObject<boolean>;
}) {
    const [date, setDate] = useState(() => formatEmpireDate(time, fraction.current));
    useEffect(() => {
        const update = () => {
            // Hold the last displayed day until the worker confirms the next month.
            if (!pending.current) setDate(formatEmpireDate(time, fraction.current));
        };
        update();
        const timer = window.setInterval(update, 100);
        return () => window.clearInterval(timer);
    }, [time, fraction, pending]);
    return <div className="clock" title="日期按日显示；经济、科研和建设仍按月结算"><small>帝国时间</small><strong>{date}</strong></div>;
}
