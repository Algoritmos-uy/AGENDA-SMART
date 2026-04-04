export function parseLocalDate(dateStr) {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d);
}

export function formatISODate(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate())
        .toISOString()
        .split('T')[0];
}

export function sameDate(dateStr, dateObj) {
    const compare = typeof dateObj === 'string' ? parseLocalDate(dateObj) : dateObj;
    return dateStr === formatISODate(compare);
}

export function formatReadableDate(dateStr, locale = 'es-ES') {
    const d = parseLocalDate(dateStr);
    return d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function startOfWeek(date) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diff);
    return d;
}

export function addDays(date, days) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setDate(d.getDate() + days);
    return d;
}

export function addMonths(date, months) {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    d.setMonth(d.getMonth() + months);
    return d;
}

export function sortEvents(events) {
    return [...events].sort((a, b) => {
        if (a.date === b.date) return a.start.localeCompare(b.start);
        return a.date.localeCompare(b.date);
    });
}

export function buildSlots(startHour = 8, endHour = 20) {
    const slots = [];
    for (let h = startHour; h < endHour; h++) {
        const from = `${String(h).padStart(2, '0')}:00`;
        const to = `${String(h + 1).padStart(2, '0')}:00`;
        slots.push({ start: from, end: to, label: `${from} - ${to}` });
    }
    return slots;
}

export function isInSlot(event, slot) {
    return event.start >= slot.start && event.start < slot.end;
}

export function normalizeLocale(locale) {
    const lc = (locale || '').toLowerCase();
    if (lc.startsWith('en')) return 'en';
    if (lc.startsWith('pt')) return 'pt';
    return 'es';
}

export function generateId() {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    return 'ev-' + Math.random().toString(16).slice(2) + Date.now().toString(16);
}
