/**
 * Date utilities for converting between numerical YYYYMMDD representation and formatted strings/Date objects.
 */

export function getYearFromDateNumber(date: number): number {
    return Math.floor(date / 10000);
}

export function getMonthNumberFromDateNumber(date: number): number {
    return Math.floor((date % 10000) / 100);
}

export function getDayOfMonthFromDateNumber(date: number): number {
    return date % 100;
}

export function getDateNumber(date: Date): number {
    return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

export function dateStringFromDateNumber(date: number): string {
    const year = getYearFromDateNumber(date);
    const month = getMonthNumberFromDateNumber(date).toString().padStart(2, '0');
    const day = getDayOfMonthFromDateNumber(date).toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function parseDateNumber(dateStr: string): number {
    const clean = dateStr.replace(/[^0-9]/g, '');
    if (clean.length === 8) {
        return parseInt(clean, 10);
    }
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const d = parseInt(parts[2], 10);
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
            return y * 10000 + m * 100 + d;
        }
    }
    return 0;
}
