export function getEventsByRangeCore(range, deps = {}) {
    const { sortEvents, getEvents, sameDate, parseLocalDate } = deps;
    const events = sortEvents(getEvents());
    const today = new Date();
    const todayFloor = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    if (range === 'today') {
        return events.filter((ev) => sameDate(ev.date, todayFloor));
    }

    if (range === 'month') {
        const month = todayFloor.getMonth();
        const year = todayFloor.getFullYear();
        return events.filter((ev) => {
            const d = parseLocalDate(ev.date);
            return d && d.getMonth() === month && d.getFullYear() === year;
        });
    }

    return [];
}

export function formatAssistantEventsCore(list, range, deps = {}) {
    const { assistantStrings, tr, getAttendanceLabel } = deps;
    const headers = assistantStrings?.headers || {};
    const noEvents = assistantStrings?.noEvents || {};

    if (!list.length) {
        return noEvents[range] || tr('calendar.noEvents');
    }

    const title = headers[range] || tr('assistant.eventsTitle');
    const lines = list.map((ev) => {
        const desc = ev.description ? ` — ${ev.description}` : '';
        const attendance = getAttendanceLabel(ev.attendance);
        return `- ${ev.date} ${ev.start}-${ev.end} ${ev.title}${desc} [${attendance}]`;
    });

    return `${title}\n${lines.join('\n')}`;
}

export function buildAssistantContextCore(deps = {}) {
    const { sortEvents, getEvents, parseLocalDate, getAttendanceLabel } = deps;
    const events = sortEvents(getEvents());
    const today = new Date();
    const todayFloor = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    const upcoming = events
        .filter((ev) => {
            const d = parseLocalDate(ev.date);
            return d && d >= todayFloor;
        })
        .slice(0, 5);

    if (!upcoming.length) return '';

    const lines = upcoming.map((ev) => {
        const desc = ev.description ? ` — ${ev.description}` : '';
        const attendance = getAttendanceLabel(ev.attendance);
        return `- ${ev.date} ${ev.start}-${ev.end} ${ev.title}${desc} [${attendance}]`;
    });

    return `Agenda context (max 5 upcoming):\n${lines.join('\n')}`;
}