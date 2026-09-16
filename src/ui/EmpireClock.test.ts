import { describe, expect, it } from 'vitest';
import { formatEmpireDate } from './EmpireClock';

describe('daily presentation calendar', () => {
    it('maps fractional months to days without rounding into the next month', () => {
        expect(formatEmpireDate(2180)).toBe('2180.01.01');
        expect(formatEmpireDate(2180, 1 / 31)).toBe('2180.01.02');
        expect(formatEmpireDate(2180, .999999)).toBe('2180.01.31');
        expect(formatEmpireDate(2180 + 1 / 12)).toBe('2180.02.01');
        expect(formatEmpireDate(2180 + 11 / 12, .999999)).toBe('2180.12.31');
        expect(formatEmpireDate(2181)).toBe('2181.01.01');
    });
    it('uses actual month lengths including leap-year century rules', () => {
        expect(formatEmpireDate(2180 + 1 / 12, .999999)).toBe('2180.02.29');
        expect(formatEmpireDate(2181 + 1 / 12, .999999)).toBe('2181.02.28');
        expect(formatEmpireDate(2200 + 1 / 12, .999999)).toBe('2200.02.28');
        expect(formatEmpireDate(2400 + 1 / 12, .999999)).toBe('2400.02.29');
        expect(formatEmpireDate(2180 + 3 / 12, .999999)).toBe('2180.04.30');
    });
});
