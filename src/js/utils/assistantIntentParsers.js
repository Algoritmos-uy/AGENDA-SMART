import { addDays, formatISODate } from './agendaDateUtils.js';
import {
    normalizeLooseText,
    parseAssistantDateHint,
    parseAssistantTimeHint,
    stripLeadingCommandWords
} from './assistantParserUtils.js';

export function isAssistantCreateIntent(text = '') {
    const t = String(text || '').toLowerCase();
    return /(\bcrear\b|\bcrea\b|\bagendar\b|\bagenda\b|\bprogramar\b|\bprograma\b|\banadir\b|\bañadir\b|\badd\b|\bcreate\b|\bschedule\b|\bnovo\b|\bcriar\b)/i.test(t);
}

export function isAssistantRescheduleIntent(text = '') {
    const t = String(text || '').toLowerCase();
    return /(\breprogramar\b|\breprograma\b|\breagendar\b|\breagenda\b|\bmover\b|\bcambiar\b|\bposponer\b|\baplazar\b|\breschedule\b)/i.test(t);
}

export function isAssistantDeleteIntent(text = '') {
    const t = String(text || '').toLowerCase();
    return /(\beliminar\b|\belimina\b|\bborrar\b|\bborra\b|\bcancelar\b|\bcancela\b|\bdelete\b|\bremove\b)/i.test(t);
}

export function parseAttendanceFromText(text = '') {
    const t = normalizeLooseText(text);
    if (/\b(confirmad[oa]|confirmar|confirm|accepted|aceptad[oa]|yes|si|sim)\b/.test(t)) return 'confirmed';
    if (/\b(no asiste|rechazad[oa]|declined?|cancelad[oa]|no)\b/.test(t)) return 'declined';
    if (/\b(tentativ[oa]|maybe|tal vez|quizas|quiza)\b/.test(t)) return 'tentative';
    if (/\b(pendiente|pendente|pending|sin confirmar)\b/.test(t)) return 'pending';
    return '';
}

export function hasFutureDateIntentHint(text = '') {
    const t = normalizeLooseText(text);
    if (!t) return false;
    return /(manana|mañana|pasado manana|pasado mañana|tomorrow|next day|day after tomorrow|amanha|amanhã|depois de amanha|depois de amanhã|proxima semana|próxima semana|next week|proximo mes|próximo mes|next month|a futuro|future|futuro|la semana que viene|mes que viene)/.test(t);
}

export function parseAssistantRescheduleFromText(text = '') {
    const original = String(text || '').trim();
    if (!original || !isAssistantRescheduleIntent(original)) return null;

    const isoDates = Array.from(original.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)).map((m) => m[1]);
    const hhmmTimes = Array.from(original.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g))
        .map((m) => `${String(m[1]).padStart(2, '0')}:${m[2]}`);

    const inferredDate = parseAssistantDateHint(original);
    const inferredTime = parseAssistantTimeHint(original);

    const targetDate = isoDates.length >= 2 ? isoDates[0] : '';
    const targetStart = hhmmTimes.length >= 2 ? hhmmTimes[0] : '';
    const newDate = isoDates.length >= 2 ? isoDates[isoDates.length - 1] : inferredDate;
    const newStart = hhmmTimes.length >= 2 ? hhmmTimes[hhmmTimes.length - 1] : inferredTime;

    if (!newStart && !newDate) return null;

    const titleMatch = original.match(/(?:reprograma(?:r)?|reagenda(?:r)?|mueve?|cambia(?:r)?(?:\s+el\s+horario)?|reschedule)(?:\s+|[:.,;-])+(?:el|la)?\s*(?:evento\s*)?(?:de\s*)?(.+?)(?:\s+(?:para|to)\b|$)/i);
    const title = stripLeadingCommandWords(String(titleMatch?.[1] || '').trim());
    if (!title) return null;

    return {
        action: 'reschedule_event',
        title,
        ...(newDate ? { new_date: newDate } : {}),
        ...(newStart ? { new_start: newStart } : {}),
        ...(targetDate ? { target_date: targetDate } : {}),
        ...(targetStart ? { target_start: targetStart } : {}),
    };
}

export function parseAssistantDeleteFromText(text = '') {
    const original = String(text || '').trim();
    if (!original || !isAssistantDeleteIntent(original)) return null;

    const date = parseAssistantDateHint(original);
    const start = parseAssistantTimeHint(original);
    const titleMatch = original.match(/(?:elimina(?:r)?|borra(?:r)?|cancela(?:r)?|delete|remove)\s+(?:el|la)?\s*(?:evento\s*)?(?:de\s*)?(.+?)(?:\s+(?:para|de|del|el|la)\b|$)/i);
    const title = String(titleMatch?.[1] || '').trim();
    if (!title) return null;

    return {
        action: 'delete_event',
        title,
        ...(date ? { date } : {}),
        ...(start ? { start } : {}),
    };
}

export function parseAssistantAttendanceFromText(text = '') {
    const original = String(text || '').trim();
    if (!original) return null;

    const attendance = parseAttendanceFromText(original);
    if (!attendance) return null;

    const titleMatch = original.match(/(?:confirma(?:r)?(?:\s+asistencia)?|marcar?\s+(?:como\s+)?(?:pendiente|confirmad[oa]|tentativ[oa]|no\s+asiste)|set\s+attendance\s+to\s+\w+)\s+(?:el|la)?\s*(?:evento\s*)?(?:de\s*)?(.+?)(?:\s+(?:para|de|del|el|la)\b|$)/i);
    const title = String(titleMatch?.[1] || '').trim();
    if (!title) return null;

    const date = parseAssistantDateHint(original);
    const start = parseAssistantTimeHint(original);
    return {
        action: 'set_attendance',
        title,
        attendance,
        ...(date ? { date } : {}),
        ...(start ? { start } : {}),
    };
}

export function parseAssistantCreateFromText(text = '') {
    const original = String(text || '').trim();
    if (!original || !isAssistantCreateIntent(original)) return null;
    if (isAssistantRescheduleIntent(original)) return null;

    const lower = original.toLowerCase();

    let date = '';
    if (/\bhoy\b|\btoday\b|\bhoje\b/i.test(lower)) {
        date = formatISODate(new Date());
    } else if (/\bmañana\b|\bmanana\b|\btomorrow\b|\bamanh[ãa]\b/i.test(lower)) {
        date = formatISODate(addDays(new Date(), 1));
    } else {
        const dateMatch = original.match(/\b(\d{4}-\d{2}-\d{2})\b/);
        if (dateMatch) date = dateMatch[1];
    }

    let start = '';
    const hhmm = original.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (hhmm) {
        start = `${String(hhmm[1]).padStart(2, '0')}:${hhmm[2]}`;
    } else {
        const hourMatch = original.match(/(?:a\s+las|a\s+la|at|às|as)\s*([01]?\d|2[0-3])\b/i);
        if (hourMatch) {
            start = `${String(hourMatch[1]).padStart(2, '0')}:00`;
        }
    }

    let title = '';
    const titleMatch = original.match(/(?:llamad[oa]|titulad[oa]|title|named)\s+(.+)$/i);
    if (titleMatch?.[1]) {
        title = stripLeadingCommandWords(titleMatch[1].trim());
    } else {
        const cleaned = original
            .replace(/^(?:crear|crea|agendar|agenda|programar|programa|add|create|schedule|criar)(?:\s+|[:.,;-])+/i, '')
            .replace(/\b(hoy|mañana|manana|today|tomorrow|hoje|amanhã|amanha)\b/ig, '')
            .replace(/(?:a\s+las|a\s+la|at|às|as)\s*([01]?\d|2[0-3])(?::([0-5]\d))?/ig, '')
            .replace(/\b(\d{4}-\d{2}-\d{2})\b/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        title = stripLeadingCommandWords(cleaned) || 'Evento';
    }

    if (!date || !start) return null;

    return {
        action: 'create_event',
        title,
        date,
        start,
        duration_minutes: 60,
        description: '',
        color: '#2563eb',
    };
}