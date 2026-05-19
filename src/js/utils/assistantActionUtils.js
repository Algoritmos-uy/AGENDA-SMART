export function formatEventLineCore(ev = {}, getAttendanceLabel) {
    const title = String(ev.title || 'Evento').trim();
    const date = String(ev.date || '').trim();
    const start = String(ev.start || '').trim();
    const end = String(ev.end || '').trim();
    const attendance = typeof getAttendanceLabel === 'function'
        ? getAttendanceLabel(ev.attendance)
        : String(ev.attendance || 'pending');
    return `${date} ${start}-${end} ${title} [${attendance}]`.trim();
}

export function getAttendanceFromActionCore(action = {}, normalizeAttendanceStatus) {
    return normalizeAttendanceStatus(
        action.attendance
        || action.attendance_status
        || action.rsvp
        || action.status,
        ''
    );
}

export function resolveActionCandidatesCore(action = {}, events = [], deps = {}) {
    const {
        normalizeLooseText,
        parseAssistantDateHint,
        parseAssistantTimeHint,
        titleMatchesLoose
    } = deps;

    if (!Array.isArray(events) || !events.length) return [];
    const target = action.target || action.where || {};

    const id = String(action.event_id || action.id || target.id || '').trim();
    if (id) return events.filter((ev) => String(ev.id) === id);

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

    const rawTargetDate = String(action.target_date || action.current_date || target.date || target.current_date || '').trim();
    const rawDate = rawTargetDate || String(action.date || '').trim();
    const parsedDate = parseAssistantDateHint(rawDate);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(parsedDate) ? parsedDate : (/^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : '');

    const rawTargetStart = String(action.target_start || action.current_start || target.start || target.current_start || '').trim();
    const rawStart = rawTargetStart || String(action.start || '').trim();
    const parsedStart = parseAssistantTimeHint(rawStart);
    const start = /^\d{2}:\d{2}$/.test(parsedStart) ? parsedStart : (/^\d{2}:\d{2}$/.test(rawStart) ? rawStart : '');

    if (!title && !date && !start) return [];

    const narrowIfAny = (list, predicate) => {
        const narrowed = list.filter(predicate);
        return narrowed.length ? narrowed : list;
    };

    let candidates = [...events];
    if (title) candidates = candidates.filter((ev) => titleMatchesLoose(ev.title || '', title));
    if (date) candidates = rawTargetDate ? candidates.filter((ev) => String(ev.date || '') === date) : narrowIfAny(candidates, (ev) => String(ev.date || '') === date);
    if (start) candidates = rawTargetStart ? candidates.filter((ev) => String(ev.start || '') === start) : narrowIfAny(candidates, (ev) => String(ev.start || '') === start);

    return candidates;
}

export function getUpdatePayloadFromActionCore(action = {}, parseAssistantDateHint) {
    const explicit = action.updates || action.set || action.changes || {};
    const normalizedDate = parseAssistantDateHint(action.new_date || explicit.date || '');
    const fromRoot = {
        title: action.new_title,
        date: normalizedDate || action.new_date,
        start: action.new_start,
        end: action.new_end,
        description: action.new_description,
        color: action.new_color,
        reminder_offset: action.reminder_offset,
        duration_minutes: action.duration_minutes,
        attendance: action.new_attendance || action.attendance || action.attendance_status || action.status,
    };

    const merged = { ...fromRoot, ...explicit };

    if (merged.date) {
        const normalized = parseAssistantDateHint(merged.date);
        if (normalized) merged.date = normalized;
    }

    Object.keys(merged).forEach((k) => {
        if (merged[k] === undefined || merged[k] === null || merged[k] === '') delete merged[k];
    });

    return merged;
}

export function buildUpdateCandidateCore(event, action, deps = {}) {
    const {
        parseAssistantDateHint,
        inferEndFromStart,
        validateEventPayload,
        normalizeAttendanceStatus,
        assistantLocale
    } = deps;

    const updates = getUpdatePayloadFromActionCore(action, parseAssistantDateHint);
    const merged = { ...event, ...updates };

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
        const duration = Number.isFinite(preferredDuration) && preferredDuration > 0 ? preferredDuration : currentDuration;
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
        reminder_offset: merged.reminder_offset,
        duration_minutes: updates.duration_minutes,
    }, assistantLocale);

    if (!validation.ok) return { ok: false, error: validation.error };

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