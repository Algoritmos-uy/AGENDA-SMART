import {
    inferEndFromStart,
    normalizeAttendanceStatus,
    validateEventPayload,
} from './assistantEventUtils.js';
import {
    normalizeLooseText,
    parseAssistantDateHint,
    parseAssistantTimeHint,
    titleMatchesLoose,
} from './assistantIntentUtils.js';

const ATTENDANCE_ACTION_ALIASES = {
    confirm_attendance: 'confirmed',
    decline_attendance: 'declined',
    tentative_attendance: 'tentative',
};

const ATTENDANCE_ACTION_TYPES = new Set(['set_attendance', 'update_attendance', 'rsvp_event']);

export function normalizeAttendanceActionAlias(action = {}) {
    const actionType = String(action.action || '').trim();
    const mappedAttendance = ATTENDANCE_ACTION_ALIASES[actionType];
    if (!mappedAttendance) return action;
    return {
        ...action,
        action: 'set_attendance',
        attendance: mappedAttendance,
    };
}

export function isAttendanceActionType(action = {}) {
    return ATTENDANCE_ACTION_TYPES.has(String(action.action || '').trim());
}

export function getTopActionCandidates(candidates = [], limit = 5) {
    return (Array.isArray(candidates) ? candidates : []).slice(0, Math.max(1, Number(limit) || 5));
}

export function formatAmbiguousCandidatesOptions(candidates = [], formatter = (ev) => String(ev || ''), { limit = 5, numbered = false } = {}) {
    return getTopActionCandidates(candidates, limit)
        .map((ev, idx) => (numbered ? `${idx + 1}) ${formatter(ev)}` : `- ${formatter(ev)}`))
        .join('\n');
}

export function resolveCandidatesDecision(candidates = [], { limit = 5 } = {}) {
    const list = Array.isArray(candidates) ? candidates : [];
    if (!list.length) return { kind: 'none', topCandidates: [], selected: null };
    if (list.length > 1) {
        const topCandidates = getTopActionCandidates(list, limit);
        return { kind: 'ambiguous', topCandidates, selected: null };
    }
    return { kind: 'single', topCandidates: list, selected: list[0] };
}

export function buildRescheduleConflictSummary(conflicts = [], suggestions = [], options = {}) {
    const formatEvent = typeof options.formatEvent === 'function'
        ? options.formatEvent
        : (ev) => String(ev || '');
    const conflictLimit = Math.max(1, Number(options.conflictLimit) || 3);
    const conflictSeparator = options.conflictSeparator || ' | ';
    const suggestionSeparator = options.suggestionSeparator || ' | ';

    const conflictText = (Array.isArray(conflicts) ? conflicts : [])
        .slice(0, conflictLimit)
        .map(formatEvent)
        .join(conflictSeparator);

    const suggestionsText = (Array.isArray(suggestions) ? suggestions : [])
        .map((s) => `${s?.date || ''} ${s?.start || ''}-${s?.end || ''}`.trim())
        .filter(Boolean)
        .join(suggestionSeparator);

    return {
        conflictText,
        suggestionsText,
        hasSuggestions: Boolean(suggestionsText),
    };
}

export function mapRescheduleActionToUpdateAction(action = {}) {
    const target = action.target || action.where || {};
    const mapped = {
        ...action,
        action: 'update_event',
        new_date: action.new_date || parseAssistantDateHint(action.date || ''),
        new_start: action.new_start || action.start,
        new_end: action.new_end || action.end,
        date: action.target_date || target.date || '',
        start: action.target_start || target.start || '',
        title: action.target_title || target.title || action.title || action.event_title || action.event || action.name,
    };

    if (!mapped.date) delete mapped.date;
    if (!mapped.start) delete mapped.start;

    const hasExplicitTarget = Boolean(
        action.event_id
        || action.id
        || target.id
        || action.target_date
        || action.target_start
        || action.target_title
        || target.date
        || target.start
        || target.title
    );

    if (!hasExplicitTarget) {
        delete mapped.date;
        delete mapped.start;
        delete mapped.end;
    }

    return mapped;
}

export function getAttendanceFromAction(action = {}) {
    return normalizeAttendanceStatus(
        action.attendance
        || action.attendance_status
        || action.rsvp
        || action.status,
        ''
    );
}

export function resolveActionCandidates(action = {}, events = []) {
    if (!Array.isArray(events) || !events.length) return [];
    const target = action.target || action.where || {};

    const id = String(action.event_id || action.id || target.id || '').trim();
    if (id) {
        return events.filter(ev => String(ev.id) === id);
    }

    const title = normalizeLooseText(
        action.title
        || action.event_title
        || action.event
        || action.name
        || action.target_title
        || target.title
        || target.event_title
        || target.event
        || target.name
        || ''
    );

    const rawTargetDate = String(
        action.target_date
        || action.current_date
        || target.date
        || target.current_date
        || ''
    ).trim();
    const rawDate = rawTargetDate || String(action.date || '').trim();
    const parsedDate = parseAssistantDateHint(rawDate);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(parsedDate)
        ? parsedDate
        : (/^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : '');

    const rawTargetStart = String(
        action.target_start
        || action.current_start
        || target.start
        || target.current_start
        || ''
    ).trim();
    const rawStart = rawTargetStart || String(action.start || '').trim();
    const parsedStart = parseAssistantTimeHint(rawStart);
    const start = /^\d{2}:\d{2}$/.test(parsedStart)
        ? parsedStart
        : (/^\d{2}:\d{2}$/.test(rawStart) ? rawStart : '');

    if (!title && !date && !start) return [];

    const narrowIfAny = (list, predicate) => {
        const narrowed = list.filter(predicate);
        return narrowed.length ? narrowed : list;
    };

    let candidates = [...events];
    if (title) {
        candidates = narrowIfAny(candidates, ev => titleMatchesLoose(ev.title || '', title));
    }
    if (date) {
        candidates = rawTargetDate
            ? candidates.filter(ev => String(ev.date || '') === date)
            : narrowIfAny(candidates, ev => String(ev.date || '') === date);
    }
    if (start) {
        candidates = rawTargetStart
            ? candidates.filter(ev => String(ev.start || '') === start)
            : narrowIfAny(candidates, ev => String(ev.start || '') === start);
    }
    return candidates;
}

export function getUpdatePayloadFromAction(action = {}) {
    const explicit = action.updates || action.set || action.changes || {};
    const normalizedDate = parseAssistantDateHint(
        action.new_date
        || explicit.date
        || ''
    );
    const fromRoot = {
        title: action.new_title,
        date: normalizedDate || action.new_date,
        start: action.new_start,
        end: action.new_end,
        description: action.new_description,
        color: action.new_color,
        reminder_offsets: action.reminder_offsets ?? action.reminder_offset,
        duration_minutes: action.duration_minutes,
        attendance: action.new_attendance || action.attendance || action.attendance_status || action.status,
    };
    const merged = {
        ...fromRoot,
        ...explicit,
    };

    if (merged.date) {
        const normalized = parseAssistantDateHint(merged.date);
        if (normalized) merged.date = normalized;
    }

    Object.keys(merged).forEach((k) => {
        if (merged[k] === undefined || merged[k] === null || merged[k] === '') {
            delete merged[k];
        }
    });
    return merged;
}

export function buildUpdateCandidate(event, action, { locale = 'es' } = {}) {
    const updates = getUpdatePayloadFromAction(action);
    const merged = {
        ...event,
        ...updates,
    };

    const hasStartUpdate = typeof updates.start === 'string' && updates.start.trim() !== '';
    const hasEndUpdate = typeof updates.end === 'string' && updates.end.trim() !== '';
    const currentDuration = (() => {
        const [sh, sm] = String(event.start || '').split(':').map(Number);
        const [eh, em] = String(event.end || '').split(':').map(Number);
        if (![sh, sm, eh, em].every(Number.isFinite)) return 60;
        const startMin = (sh * 60) + sm;
        const endMin = (eh * 60) + em;
        return endMin > startMin ? (endMin - startMin) : 60;
    })();

    if (hasStartUpdate && !hasEndUpdate) {
        const preferredDuration = Number(updates.duration_minutes);
        const duration = Number.isFinite(preferredDuration) && preferredDuration > 0
            ? preferredDuration
            : currentDuration;
        const inferredEnd = inferEndFromStart(merged.start, duration);
        if (inferredEnd) merged.end = inferredEnd;
    }

    const validation = validateEventPayload({
        title: merged.title,
        date: merged.date,
        start: merged.start,
        end: merged.end,
        description: merged.description,
        color: merged.color,
        reminder_offsets: merged.reminder_offsets ?? merged.reminder_offset,
        duration_minutes: updates.duration_minutes,
    }, locale);

    if (!validation.ok) {
        return { ok: false, error: validation.error };
    }

    return {
        ok: true,
        nextEvent: {
            ...event,
            ...validation.data,
            attendance: normalizeAttendanceStatus(merged.attendance, event.attendance || 'pending'),
            id: event.id,
        }
    };
}