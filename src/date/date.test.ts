import { describe, it, expect } from 'vitest';
import {
    getYearFromDateNumber,
    getMonthNumberFromDateNumber,
    getDayOfMonthFromDateNumber,
    getDateNumber,
    dateStringFromDateNumber,
    parseDateNumber,
} from './index.js';

describe('DateNumber utilities', () => {
    const dateNum = 20261024;

    it('extracts year, month, and day correctly', () => {
        expect(getYearFromDateNumber(dateNum)).toBe(2026);
        expect(getMonthNumberFromDateNumber(dateNum)).toBe(10);
        expect(getDayOfMonthFromDateNumber(dateNum)).toBe(24);
    });

    it('formats date number to YYYY-MM-DD string', () => {
        expect(dateStringFromDateNumber(dateNum)).toBe('2026-10-24');
        expect(dateStringFromDateNumber(20260105)).toBe('2026-01-05');
    });

    it('creates date number from Date instance', () => {
        const d = new Date(2026, 9, 24); // Month is 0-indexed in JS (9 = October)
        expect(getDateNumber(d)).toBe(20261024);
    });

    it('parses formatted strings into date numbers', () => {
        expect(parseDateNumber('2026-10-24')).toBe(20261024);
        expect(parseDateNumber('2026/01/05')).toBe(20260105);
        expect(parseDateNumber('invalid')).toBe(0);
    });
});
