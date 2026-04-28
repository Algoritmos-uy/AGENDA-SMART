export function formatAssistantEventLine(ev = {}, { getAttendanceLabel } = {}) {
    const desc = ev.description ? ` — ${ev.description}` : '';
    const attendance = typeof getAttendanceLabel === 'function'
        ? getAttendanceLabel(ev.attendance)
        : String(ev.attendance || '');
    return `- ${ev.date} ${ev.start}-${ev.end} ${ev.title}${desc} [${attendance}]`;
}

export function formatAssistantEventsForRange({
    list = [],
    range = 'today',
    headers = {},
    noEvents = {},
    defaultNoEventsText = '',
    defaultTitle = '',
    getAttendanceLabel,
} = {}) {
    if (!Array.isArray(list) || list.length === 0) {
        return (noEvents && noEvents[range]) || defaultNoEventsText;
    }

    const title = (headers && headers[range]) || defaultTitle;
    const lines = list.map(ev => formatAssistantEventLine(ev, { getAttendanceLabel }));
    return `${title}\n${lines.join('\n')}`;
}

export function buildAssistantContextFromEvents({
    events = [],
    now = new Date(),
    parseLocalDate,
    getAttendanceLabel,
    limit = 5,
} = {}) {
    if (!Array.isArray(events) || events.length === 0 || typeof parseLocalDate !== 'function') {
        return '';
    }

    const today = now instanceof Date ? now : new Date();
    const todayFloor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const upcoming = events
        .filter(ev => {
            const d = parseLocalDate(ev.date);
            return d && d >= todayFloor;
        })
        .slice(0, Math.max(1, Number(limit) || 5));

    if (!upcoming.length) return '';

    const lines = upcoming.map(ev => formatAssistantEventLine(ev, { getAttendanceLabel }));
    return `Agenda context (max ${Math.max(1, Number(limit) || 5)} upcoming):\n${lines.join('\n')}`;
}