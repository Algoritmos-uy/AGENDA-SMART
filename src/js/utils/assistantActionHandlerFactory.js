export function createAssistantActionHandler(deps = {}) {
    const {
        extractAssistantAction,
        parseAssistantDateHint,
        validateEventPayload,
        toEventPayload,
        findEventConflicts,
        suggestRescheduleSlots,
        tr,
        assistantLocaleRef,
        getEvents,
        saveEvents,
        renderAll,
        notifier,
        resolveActionCandidates,
        getAttendanceFromAction,
        setEventAttendance,
        getAttendanceLabel,
        formatEventLine,
        buildUpdateCandidate,
        normalizeCreateActionDateForFuture,
        assistantShortText,
        appendAssistantMessage,
        renderAssistantMessages,
        saveAssistantHistory,
        setAssistantPendingAction
    } = deps;

    const getLocale = () => (
        typeof assistantLocaleRef === 'function'
            ? assistantLocaleRef() || 'es'
            : 'es'
    );

    return function handleAssistantAction(content = '', { messageRef, userText = '' } = {}) {
        const action = extractAssistantAction(content);
        if (!action) return { handled: false };

        if (action.action === 'confirm_attendance') {
            return handleAssistantAction(JSON.stringify({ ...action, action: 'set_attendance', attendance: 'confirmed' }), { messageRef, userText });
        }
        if (action.action === 'decline_attendance') {
            return handleAssistantAction(JSON.stringify({ ...action, action: 'set_attendance', attendance: 'declined' }), { messageRef, userText });
        }
        if (action.action === 'tentative_attendance') {
            return handleAssistantAction(JSON.stringify({ ...action, action: 'set_attendance', attendance: 'tentative' }), { messageRef, userText });
        }

        if (action.action === 'set_attendance' || action.action === 'update_attendance' || action.action === 'rsvp_event') {
            const events = getEvents();
            const candidates = resolveActionCandidates(action, events);
            const nextAttendance = getAttendanceFromAction(action);

            if (!nextAttendance) {
                const msg = assistantShortText('attendanceInvalid');
                if (messageRef) {
                    messageRef.content = msg;
                    renderAssistantMessages();
                    saveAssistantHistory();
                } else {
                    appendAssistantMessage({ role: 'assistant', content: msg });
                }
                return { handled: true, spokenText: msg };
            }

            if (!candidates.length) {
                const msg = assistantShortText('eventNotFound');
                if (messageRef) {
                    messageRef.content = msg;
                    renderAssistantMessages();
                    saveAssistantHistory();
                } else {
                    appendAssistantMessage({ role: 'assistant', content: msg });
                }
                return { handled: true, spokenText: msg };
            }

            if (candidates.length > 1) {
                const options = candidates.slice(0, 5).map(ev => `- ${formatEventLine(ev)}`).join('\n');
                const msg = assistantShortText('eventAmbiguous', { options });
                if (messageRef) {
                    messageRef.content = msg;
                    renderAssistantMessages();
                    saveAssistantHistory();
                } else {
                    appendAssistantMessage({ role: 'assistant', content: msg });
                }
                return { handled: true, spokenText: msg };
            }

            const current = candidates[0];
            setEventAttendance(current.id, nextAttendance);
            const updated = getEvents().find(ev => ev.id === current.id) || { ...current, attendance: nextAttendance };
            const msg = assistantShortText('attendanceUpdated', {
                event: formatEventLine(updated),
                status: getAttendanceLabel(nextAttendance),
            });
            if (messageRef) {
                messageRef.content = msg;
                renderAssistantMessages();
                saveAssistantHistory();
            } else {
                appendAssistantMessage({ role: 'assistant', content: msg });
            }
            return { handled: true, spokenText: msg };
        }

        if (action.action === 'delete_event') {
            const events = getEvents();
            const candidates = resolveActionCandidates(action, events);

            if (!candidates.length) {
                const msg = assistantShortText('eventNotFound');
                if (messageRef) {
                    messageRef.content = msg;
                    renderAssistantMessages();
                    saveAssistantHistory();
                } else {
                    appendAssistantMessage({ role: 'assistant', content: msg });
                }
                return { handled: true, spokenText: msg };
            }

            if (candidates.length > 1) {
                const options = candidates.slice(0, 5).map(ev => `- ${formatEventLine(ev)}`).join('\n');
                const msg = assistantShortText('eventAmbiguous', { options });
                if (messageRef) {
                    messageRef.content = msg;
                    renderAssistantMessages();
                    saveAssistantHistory();
                } else {
                    appendAssistantMessage({ role: 'assistant', content: msg });
                }
                return { handled: true, spokenText: msg };
            }

            const target = candidates[0];
            setAssistantPendingAction?.({
                type: 'delete',
                eventId: target.id,
            });
            const msg = assistantShortText('confirmDelete', { event: formatEventLine(target) });
            if (messageRef) {
                messageRef.content = msg;
                renderAssistantMessages();
                saveAssistantHistory();
            } else {
                appendAssistantMessage({ role: 'assistant', content: msg });
            }
            return { handled: true, spokenText: msg };
        }

        if (action.action === 'update_event') {
            const events = getEvents();
            const candidates = resolveActionCandidates(action, events);

            if (!candidates.length) {
                const msg = assistantShortText('eventNotFound');
                if (messageRef) {
                    messageRef.content = msg;
                    renderAssistantMessages();
                    saveAssistantHistory();
                } else {
                    appendAssistantMessage({ role: 'assistant', content: msg });
                }
                return { handled: true, spokenText: msg };
            }

            if (candidates.length > 1) {
                const options = candidates.slice(0, 5).map(ev => `- ${formatEventLine(ev)}`).join('\n');
                const msg = assistantShortText('eventAmbiguous', { options });
                if (messageRef) {
                    messageRef.content = msg;
                    renderAssistantMessages();
                    saveAssistantHistory();
                } else {
                    appendAssistantMessage({ role: 'assistant', content: msg });
                }
                return { handled: true, spokenText: msg };
            }

            const current = candidates[0];
            const updateCandidate = buildUpdateCandidate(current, action);
            if (!updateCandidate.ok) {
                const msg = updateCandidate.error || assistantShortText('eventNotFound');
                if (messageRef) {
                    messageRef.content = msg;
                    renderAssistantMessages();
                    saveAssistantHistory();
                } else {
                    appendAssistantMessage({ role: 'assistant', content: msg });
                }
                return { handled: true, spokenText: msg };
            }

            const conflicts = findEventConflicts(updateCandidate.nextEvent, events, current.id);
            if (conflicts.length) {
                const conflictText = conflicts.slice(0, 3).map(formatEventLine).join(' | ');
                const suggestions = suggestRescheduleSlots(updateCandidate.nextEvent, events, {
                    ignoreEventId: current.id,
                    maxSuggestions: 3,
                    stepMinutes: 30,
                });

                const msg = suggestions.length
                    ? assistantShortText('rescheduleConflict', {
                        conflicts: conflictText,
                        suggestions: suggestions.map(s => `${s.date} ${s.start}-${s.end}`).join(' | '),
                    })
                    : assistantShortText('rescheduleNoSuggestion');

                if (messageRef) {
                    messageRef.content = msg;
                    renderAssistantMessages();
                    saveAssistantHistory();
                } else {
                    appendAssistantMessage({ role: 'assistant', content: msg });
                }
                return { handled: true, spokenText: msg };
            }

            setAssistantPendingAction?.({
                type: 'update',
                eventId: current.id,
                nextEvent: updateCandidate.nextEvent,
            });

            const msg = assistantShortText('confirmUpdate', {
                before: formatEventLine(current),
                after: formatEventLine(updateCandidate.nextEvent),
            });

            if (messageRef) {
                messageRef.content = msg;
                renderAssistantMessages();
                saveAssistantHistory();
            } else {
                appendAssistantMessage({ role: 'assistant', content: msg });
            }
            return { handled: true, spokenText: msg };
        }

        if (action.action === 'reschedule_event' || action.action === 'reprogram_event') {
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

            const hasExplicitTarget = !!(
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

            return handleAssistantAction(JSON.stringify(mapped), { messageRef, userText });
        }

        if (action.action !== 'create_event') return { handled: false };

        const safeCreateAction = normalizeCreateActionDateForFuture(action, userText);

        const validation = validateEventPayload(safeCreateAction, getLocale());
        if (!validation.ok) {
            if (messageRef) {
                messageRef.content = validation.error;
                renderAssistantMessages();
                saveAssistantHistory();
            } else {
                appendAssistantMessage({ role: 'assistant', content: validation.error });
            }
            return { handled: true, spokenText: validation.error };
        }

        const evt = toEventPayload(validation.data);
        const events = getEvents();
        events.push(evt);
        saveEvents(events);
        renderAll();
        try { notifier.scheduleFor(evt); } catch (e) { console.warn('Schedule failed', e); }

        const confirmText = tr('assistant.eventCreated', {
            title: evt.title,
            date: evt.date,
            start: evt.start,
            end: evt.end,
        });
        let finalText = confirmText;

        if (validation?.data?.autoCompletedEnd) {
            const autoText = tr('assistant.autoEnd', { end: evt.end, minutes: validation?.data?.autoDurationMinutes || 60 });
            finalText = `${confirmText}\n${autoText}`;
        }

        if (messageRef) {
            messageRef.content = finalText;
            renderAssistantMessages();
            saveAssistantHistory();
        } else {
            appendAssistantMessage({ role: 'assistant', content: finalText });
        }

        return { handled: true, spokenText: finalText };
    };
}