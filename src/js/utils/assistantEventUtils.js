import { generateId } from './agendaDateUtils.js';

const VALIDATION_TEXT = {
    es: {
        missingTitle: 'Falta título.',
        invalidDate: 'Fecha inválida (YYYY-MM-DD).',
        invalidStart: 'Hora de inicio inválida (HH:MM).',
        invalidEnd: 'Hora de fin inválida (HH:MM).',
        endAfterStart: 'La hora de fin debe ser posterior a la de inicio.',
    },
    en: {
        missingTitle: 'Title is required.',
        invalidDate: 'Invalid date (YYYY-MM-DD).',
        invalidStart: 'Invalid start time (HH:MM).',
        invalidEnd: 'Invalid end time (HH:MM).',
        endAfterStart: 'End time must be later than start time.',
    },
    pt: {
        missingTitle: 'Falta título.',
        invalidDate: 'Data inválida (AAAA-MM-DD).',
        invalidStart: 'Hora de início inválida (HH:MM).',
        invalidEnd: 'Hora de fim inválida (HH:MM).',
        endAfterStart: 'A hora de fim deve ser posterior à de início.',
    },
};

function normalizeLocale(locale = 'es') {
    const lc = (locale || '').toLowerCase();
    if (lc.startsWith('en')) return 'en';
    if (lc.startsWith('pt')) return 'pt';
    return 'es';
}

export function detectAssistantRange(text = '') {
    const t = text.toLowerCase();
    if (/(hoy|today|hoje)\b/.test(t)) return 'today';
    if (/(semana|week|semana)/.test(t)) return 'week';
    if (/(mes|mes\s|month|mês|m\u00eas)/.test(t)) return 'month';
    return null;
}

export function extractAssistantAction(content = '') {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
        return JSON.parse(match[0]);
    } catch (e) {
        return null;
    }
}

export function normalizeReminderOffset(value) {
    const num = Number(value);
    if (Number.isFinite(num) && num >= 0) return num;
    return 600;
}

function toMinutes(time = '') {
    const [h, m] = String(time).split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    if (h < 0 || h > 23 || m < 0 || m > 59) return null;
    return (h * 60) + m;
}

function minutesToTime(totalMinutes = 0) {
    const safe = Math.max(0, Math.min(23 * 60 + 59, totalMinutes));
    const h = Math.floor(safe / 60);
    const m = safe % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function inferEndFromStart(start = '', durationMinutes = 60) {
    const startMinutes = toMinutes(start);
    if (startMinutes === null) return null;
    return minutesToTime(startMinutes + Math.max(1, Number(durationMinutes) || 60));
}

export function validateEventPayload(obj = {}, locale = 'es') {
    const errors = [];
    const msg = VALIDATION_TEXT[normalizeLocale(locale)] || VALIDATION_TEXT.es;
    const title = (obj.title || '').trim();
    const date = (obj.date || '').trim();
    const start = (obj.start || '').trim();
    let end = (obj.end || '').trim();
    const description = (obj.description || '').trim();
    const color = (obj.color || '#2563eb').trim();
    const startOk = /^\d{2}:\d{2}$/.test(start);

    let autoCompletedEnd = false;
    if (!end && startOk) {
        const inferred = inferEndFromStart(start, 60);
        if (inferred) {
            end = inferred;
            autoCompletedEnd = true;
        }
    }

    if (!title) errors.push(msg.missingTitle);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push(msg.invalidDate);
    if (!startOk) errors.push(msg.invalidStart);
    if (!/^\d{2}:\d{2}$/.test(end)) errors.push(msg.invalidEnd);

    const startMinutes = toMinutes(start);
    const endMinutes = toMinutes(end);
    if (startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes) {
        errors.push(msg.endAfterStart);
    }

    if (errors.length) {
        return { ok: false, error: errors.join(' ') };
    }

    const reminder_offset = normalizeReminderOffset(obj.reminder_offset);
    return {
        ok: true,
        data: { title, date, start, end, description, color, reminder_offset, autoCompletedEnd }
    };
}

export function toEventPayload(data) {
    const reminder_offset = normalizeReminderOffset(data.reminder_offset);
    return {
        id: generateId(),
        title: data.title,
        date: data.date,
        start: data.start,
        end: data.end,
        description: data.description || '',
        color: data.color || '#2563eb',
        reminder_offset
    };
}
