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

export function normalizeAttendanceStatus(value = '', fallback = 'pending') {
    const raw = String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

    if (!raw) return fallback;

    if (/^(pending|pendiente|pendente|to_confirm|sin_confirmar)$/.test(raw)) return 'pending';
    if (/^(confirmed|confirmado|confirmada|confirmar|accepted|aceptado|aceptada|yes|si|sim)$/.test(raw)) return 'confirmed';
    if (/^(declined|decline|rechazado|rechazada|cancelado|cancelada|no)$/.test(raw)) return 'declined';
    if (/^(tentative|tentativo|tentativa|maybe|tal\s+vez|tal_vez|quizas|quiza)$/.test(raw)) return 'tentative';

    return fallback;
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

export function normalizeReminderOffsets(value) {
    const DEFAULT = [1800];
    if (Array.isArray(value)) {
        const parsed = value.map(Number).filter(v => Number.isFinite(v) && v > 0);
        return parsed.length > 0 ? parsed : DEFAULT;
    }
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) return [num];
    return DEFAULT;
}

export function normalizeEventRecord(ev = {}) {
    const reminder_offsets = normalizeReminderOffsets(ev.reminder_offsets ?? ev.reminder_offset);
    return {
        ...ev,
        reminder_offsets,
        reminder_offset: reminder_offsets[0],
        attendance: normalizeAttendanceStatus(ev.attendance)
    };
}

export function normalizeEventList(list = []) {
    return Array.isArray(list) ? list.map(normalizeEventRecord) : [];
}

export function getEventAttendanceById(events = [], id = '', fallback = 'pending') {
    if (!id) return fallback;
    const current = (Array.isArray(events) ? events : []).find(e => String(e?.id) === String(id));
    return normalizeAttendanceStatus(current?.attendance, fallback);
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

export function getEventDurationMinutes(event = {}, fallback = 60) {
    const startMinutes = toMinutes(String(event.start || ''));
    const endMinutes = toMinutes(String(event.end || ''));
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
        return Math.max(1, Number(fallback) || 60);
    }
    return Math.max(1, endMinutes - startMinutes);
}

export function eventsOverlap(a = {}, b = {}) {
    if (!a || !b) return false;
    if (String(a.date || '') !== String(b.date || '')) return false;

    const aStart = toMinutes(String(a.start || ''));
    const aEnd = toMinutes(String(a.end || ''));
    const bStart = toMinutes(String(b.start || ''));
    const bEnd = toMinutes(String(b.end || ''));
    if ([aStart, aEnd, bStart, bEnd].some(v => v === null)) return false;

    return aStart < bEnd && bStart < aEnd;
}

export function findEventConflicts(candidate = {}, events = [], ignoreEventId = '') {
    if (!candidate || !Array.isArray(events) || !events.length) return [];
    return events.filter((ev) => {
        if (!ev) return false;
        if (ignoreEventId && String(ev.id || '') === String(ignoreEventId)) return false;
        return eventsOverlap(candidate, ev);
    });
}

export function suggestRescheduleSlots(candidate = {}, events = [], options = {}) {
    const date = String(candidate.date || '').trim();
    const start = String(candidate.start || '').trim();
    if (!date || !start) return [];

    const maxSuggestions = Math.max(1, Number(options.maxSuggestions) || 3);
    const stepMinutes = Math.max(5, Number(options.stepMinutes) || 30);
    const dayEndMinutes = Math.max(60, Number(options.dayEndMinutes) || (23 * 60 + 59));
    const startMinutes = toMinutes(start);
    if (startMinutes === null) return [];

    const duration = getEventDurationMinutes(candidate, options.defaultDuration || 60);
    const dateEvents = (Array.isArray(events) ? events : []).filter((ev) => {
        if (!ev) return false;
        if (options.ignoreEventId && String(ev.id || '') === String(options.ignoreEventId)) return false;
        return String(ev.date || '') === date;
    });

    const out = [];
    for (let cursor = startMinutes + stepMinutes; cursor + duration <= dayEndMinutes; cursor += stepMinutes) {
        const slot = {
            date,
            start: minutesToTime(cursor),
            end: minutesToTime(cursor + duration),
        };

        const hasConflict = dateEvents.some(ev => eventsOverlap(slot, ev));
        if (hasConflict) continue;
        out.push(slot);
        if (out.length >= maxSuggestions) break;
    }
    return out;
}

function parseDurationMinutes(value, fallback = 60) {
    if (value === undefined || value === null || value === '') return fallback;
    const raw = String(value).trim();
    if (!raw) return fallback;

    const normalized = raw
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

    const hmMatch = normalized.match(/(\d{1,2})\s*(?:h|hr|hrs|hora|horas)\s*(?:y|e|and)?\s*(\d{1,2})\s*(?:m|min|mins|minuto|minutos)?/i);
    if (hmMatch) {
        const h = Number(hmMatch[1]);
        const m = Number(hmMatch[2]);
        if (Number.isFinite(h) && Number.isFinite(m) && h >= 0 && m >= 0) {
            return Math.max(1, (h * 60) + m);
        }
    }

    const hAndHalfMatch = normalized.match(/(\d{1,2})\s*(?:h|hr|hrs|hora|horas)\s*(?:y|e|and)\s*media\b/i);
    if (hAndHalfMatch) {
        const h = Number(hAndHalfMatch[1]);
        if (Number.isFinite(h) && h >= 0) {
            return Math.max(1, (h * 60) + 30);
        }
    }

    if (/\bhora\s+y\s+media\b/i.test(normalized) || /\bhour\s+and\s+a\s+half\b/i.test(normalized) || /\bhora\s+e\s+meia\b/i.test(normalized)) {
        return 90;
    }

    if (/\bmedia\s+hora\b/i.test(normalized) || /\bhalf\s+an\s+hour\b/i.test(normalized) || /\bmeia\s+hora\b/i.test(normalized)) {
        return 30;
    }

    const hOnlyMatch = normalized.match(/(\d{1,2})\s*(?:h|hr|hrs|hora|horas)\b/i);
    if (hOnlyMatch) {
        const h = Number(hOnlyMatch[1]);
        if (Number.isFinite(h) && h >= 0) {
            return Math.max(1, h * 60);
        }
    }

    const mOnlyMatch = normalized.match(/(\d{1,4})\s*(?:m|min|mins|minuto|minutos)\b/i);
    if (mOnlyMatch) {
        const m = Number(mOnlyMatch[1]);
        if (Number.isFinite(m) && m > 0) {
            return Math.max(1, Math.round(m));
        }
    }

    const direct = Number(raw);
    if (Number.isFinite(direct) && direct > 0) {
        return Math.max(1, Math.round(direct));
    }

    const match = raw.match(/(\d{1,4})/);
    if (!match) return fallback;
    const parsed = Number(match[1]);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.max(1, Math.round(parsed));
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
    const durationMinutes = parseDurationMinutes(
        obj.duration_minutes
        ?? obj.durationMinutes
        ?? obj.duration
        ?? obj.duracion_minutos
        ?? obj.duracion,
        60
    );

    let autoCompletedEnd = false;
    if (!end && startOk) {
        const inferred = inferEndFromStart(start, durationMinutes);
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

    const reminder_offsets = normalizeReminderOffsets(obj.reminder_offsets ?? obj.reminder_offset);
    return {
        ok: true,
        data: { title, date, start, end, description, color, reminder_offsets, autoCompletedEnd, autoDurationMinutes: durationMinutes }
    };
}

export function toEventPayload(data) {
    const reminder_offsets = normalizeReminderOffsets(data.reminder_offsets ?? data.reminder_offset);
    return {
        id: generateId(),
        title: data.title,
        date: data.date,
        start: data.start,
        end: data.end,
        description: data.description || '',
        color: data.color || '#2563eb',
        reminder_offsets,
        attendance: normalizeAttendanceStatus(data.attendance)
    };
}

export function buildCreateEventFromAction(action = {}, locale = 'es') {
    const validation = validateEventPayload(action, locale);
    if (!validation.ok) {
        return { ok: false, error: validation.error };
    }

    return {
        ok: true,
        event: toEventPayload(validation.data),
        data: validation.data,
    };
}

export function composeEventCreatedMessage(confirmText = '', options = {}) {
    const base = String(confirmText || '');
    const autoCompletedEnd = Boolean(options.autoCompletedEnd);
    if (!autoCompletedEnd) return base;

    const resolveAutoEndText = typeof options.resolveAutoEndText === 'function'
        ? options.resolveAutoEndText
        : () => String(options.autoEndText || '');

    const autoText = String(resolveAutoEndText({
        end: options.end || '',
        minutes: Number(options.autoDurationMinutes) || 60,
    }) || '').trim();

    if (!autoText) return base;
    return `${base}\n${autoText}`;
}
