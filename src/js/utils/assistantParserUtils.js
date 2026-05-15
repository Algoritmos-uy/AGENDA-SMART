import { addDays, formatISODate } from './agendaDateUtils.js';

export function normalizeLooseText(value = '') {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function stripLeadingCommandWords(text = '') {
    let out = String(text || '').trim();
    if (!out) return out;

    const cmd = '(?:crear|crea|agendar|agenda|programar|programa|anadir|añadir|add|create|schedule|criar|reprogramar|reprograma|reagendar|reagenda|mover|mueve|cambiar|cambia|reschedule|eliminar|elimina|borrar|borra|cancelar|cancela)';
    const lead = new RegExp(`^(?:${cmd})(?:\\s+|[:.,;-])+`, 'i');
    const article = /^(?:el|la|los|las|un|una)\s+/i;
    const eventWord = /^(?:evento|evento:)\s*/i;

    let changed = true;
    while (changed) {
        const before = out;
        out = out.replace(lead, '').replace(article, '').replace(eventWord, '').trim();
        changed = out !== before;
    }

    return out.replace(/^[\s:.,;-]+/, '').trim();
}

export function isAssistantConfirmText(text = '') {
    const t = normalizeLooseText(text);
    return /^(si|yes|y|ok|dale|confirmo|confirmar|confirm|sim)\b/.test(t);
}

export function isAssistantCancelText(text = '') {
    const t = normalizeLooseText(text);
    return /^(no|cancel|cancelar|negar|nao|não)\b/.test(t);
}

export function titleMatchesLoose(eventTitle = '', requestedTitle = '') {
    const evTitle = normalizeLooseText(eventTitle);
    const reqTitle = normalizeLooseText(requestedTitle);
    if (!evTitle || !reqTitle) return false;

    if (evTitle === reqTitle || evTitle.includes(reqTitle) || reqTitle.includes(evTitle)) {
        return true;
    }

    const evTokens = new Set(evTitle.split(' ').filter(Boolean));
    const reqTokens = reqTitle.split(' ').filter(Boolean);
    if (!evTokens.size || !reqTokens.length) return false;

    const relevantReqTokens = reqTokens.filter(t => t.length >= 3);
    const source = relevantReqTokens.length ? relevantReqTokens : reqTokens;
    const overlap = source.filter(t => evTokens.has(t)).length;
    if (!source.length) return false;
    return overlap >= Math.min(2, source.length);
}

export function parseAssistantDateHint(text = '') {
    const original = String(text || '').trim();
    if (!original) return '';
    const normalized = normalizeLooseText(original);

    if (/\b(hoy|today|hoje)\b/.test(normalized)) return formatISODate(new Date());
    if (/\b(pasado\s+manana|pasado\s+mañana|day\s+after\s+tomorrow|depois\s+de\s+amanha|depois\s+de\s+amanhã)\b/.test(normalized)) {
        return formatISODate(addDays(new Date(), 2));
    }
    if (/\b(manana|mañana|tomorrow|amanha|amanhã|dia siguiente|d[ií]a siguiente|next day)\b/.test(normalized)) {
        return formatISODate(addDays(new Date(), 1));
    }
    if (/\b(semana\s+que\s+viene|proxima\s+semana|pr[oó]xima\s+semana|next\s+week)\b/.test(normalized)) {
        return formatISODate(addDays(new Date(), 7));
    }
    if (/\b(proximo\s+mes|pr[oó]ximo\s+mes|next\s+month|mes\s+que\s+viene)\b/.test(normalized)) {
        const d = new Date();
        d.setMonth(d.getMonth() + 1);
        return formatISODate(d);
    }

    const dateMatch = original.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    return dateMatch ? dateMatch[1] : '';
}

export function parseAssistantTimeHint(text = '') {
    const original = String(text || '').trim();
    if (!original) return '';
    const hhmm = original.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (hhmm) return `${String(hhmm[1]).padStart(2, '0')}:${hhmm[2]}`;

    const hourMatch = original.match(/(?:a\s+las|a\s+la|at|às|as)\s*([01]?\d|2[0-3])\b/i);
    if (hourMatch) return `${String(hourMatch[1]).padStart(2, '0')}:00`;
    return '';
}