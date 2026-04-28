import { addDays, sameDate, startOfWeek } from './agendaDateUtils.js';

export function normalizeViewTargetValue(target = '') {
    const map = {
        day: 'daily',
        week: 'weekly',
        month: 'monthly',
        diaria: 'daily',
        semanal: 'weekly',
        mensual: 'monthly',
    };
    return map[target] || target;
}

export function getEventsByRangeFromList({
    events = [],
    range = '',
    now = new Date(),
    parseLocalDate,
} = {}) {
    if (!Array.isArray(events) || typeof parseLocalDate !== 'function') return [];

    const today = now instanceof Date ? now : new Date();
    const todayFloor = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    if (range === 'today') {
        return events.filter(ev => sameDate(ev.date, todayFloor));
    }

    if (range === 'week') {
        const start = startOfWeek(todayFloor);
        const end = addDays(start, 6);
        return events.filter(ev => {
            const d = parseLocalDate(ev.date);
            return d && d >= start && d <= end;
        });
    }

    if (range === 'month') {
        const month = todayFloor.getMonth();
        const year = todayFloor.getFullYear();
        return events.filter(ev => {
            const d = parseLocalDate(ev.date);
            return d && d.getMonth() === month && d.getFullYear() === year;
        });
    }

    return [];
}