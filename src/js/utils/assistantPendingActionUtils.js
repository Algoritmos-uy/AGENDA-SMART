export const ASSISTANT_PENDING_ACTION_TYPES = Object.freeze({
    DELETE: 'delete',
    UPDATE: 'update',
    SELECT_DELETE_CANDIDATE: 'select_delete_candidate',
});

export function createDeletePendingAction(eventId = '') {
    return {
        type: ASSISTANT_PENDING_ACTION_TYPES.DELETE,
        eventId: String(eventId || '').trim(),
    };
}

export function createUpdatePendingAction(eventId = '', nextEvent = null) {
    return {
        type: ASSISTANT_PENDING_ACTION_TYPES.UPDATE,
        eventId: String(eventId || '').trim(),
        nextEvent: nextEvent || null,
    };
}

export function createSelectDeleteCandidatePendingAction(candidateIds = []) {
    const ids = Array.isArray(candidateIds)
        ? candidateIds.map(id => String(id || '').trim()).filter(Boolean)
        : [];

    return {
        type: ASSISTANT_PENDING_ACTION_TYPES.SELECT_DELETE_CANDIDATE,
        candidateIds: ids,
    };
}

export function isSelectDeleteCandidatePendingAction(pending = null) {
    return String(pending?.type || '') === ASSISTANT_PENDING_ACTION_TYPES.SELECT_DELETE_CANDIDATE;
}

export function getPendingOptionsCount(pending = null) {
    if (!isSelectDeleteCandidatePendingAction(pending)) return 0;
    return Array.isArray(pending.candidateIds) ? pending.candidateIds.length : 0;
}

export function resolveSelectedCandidateId(pending = null, selectedNumber = 0) {
    const count = getPendingOptionsCount(pending);
    const index = Number(selectedNumber) - 1;
    if (count < 1 || !Number.isInteger(index) || index < 0 || index >= count) return '';
    return String(pending.candidateIds[index] || '').trim();
}

export function getPendingPromptKey(pending = null) {
    return isSelectDeleteCandidatePendingAction(pending)
        ? 'pendingNeedSelection'
        : 'pendingNeedDecision';
}

export function applyPendingActionToEvents(pending = null, events = []) {
    if (!pending || !Array.isArray(events)) {
        return { ok: false, reason: 'invalid_input' };
    }

    const eventId = String(pending.eventId || '').trim();
    const index = events.findIndex(ev => String(ev?.id || '') === eventId);
    if (index === -1) {
        return { ok: false, reason: 'event_not_found' };
    }

    if (pending.type === ASSISTANT_PENDING_ACTION_TYPES.DELETE) {
        const affectedEvent = events[index];
        return {
            ok: true,
            type: ASSISTANT_PENDING_ACTION_TYPES.DELETE,
            events: events.filter(ev => String(ev?.id || '') !== String(affectedEvent?.id || '')),
            affectedEvent,
        };
    }

    if (pending.type === ASSISTANT_PENDING_ACTION_TYPES.UPDATE) {
        if (!pending.nextEvent || typeof pending.nextEvent !== 'object') {
            return { ok: false, reason: 'invalid_next_event' };
        }

        const nextEvents = [...events];
        nextEvents[index] = pending.nextEvent;

        return {
            ok: true,
            type: ASSISTANT_PENDING_ACTION_TYPES.UPDATE,
            events: nextEvents,
            affectedEvent: pending.nextEvent,
        };
    }

    return { ok: false, reason: 'unsupported_type' };
}