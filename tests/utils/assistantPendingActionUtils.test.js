import { describe, it, expect } from 'vitest';
import {
  ASSISTANT_PENDING_ACTION_TYPES,
  applyPendingActionToEvents,
  createDeletePendingAction,
  createSelectDeleteCandidatePendingAction,
  createUpdatePendingAction,
  getPendingOptionsCount,
  getPendingPromptKey,
  isSelectDeleteCandidatePendingAction,
  resolveSelectedCandidateId,
} from '../../src/js/utils/assistantPendingActionUtils.js';

describe('assistantPendingActionUtils', () => {
  const baseEvents = [
    { id: '1', title: 'Demo', date: '2026-05-01', start: '09:00', end: '10:00' },
    { id: '2', title: 'Sync', date: '2026-05-01', start: '11:00', end: '12:00' },
  ];

  it('crea pending actions tipadas', () => {
    expect(createDeletePendingAction('1')).toEqual({ type: ASSISTANT_PENDING_ACTION_TYPES.DELETE, eventId: '1' });
    expect(createUpdatePendingAction('1', { id: '1' }).type).toBe(ASSISTANT_PENDING_ACTION_TYPES.UPDATE);
    expect(createSelectDeleteCandidatePendingAction(['1', '2']).type).toBe(ASSISTANT_PENDING_ACTION_TYPES.SELECT_DELETE_CANDIDATE);
  });

  it('maneja selección de candidatos para delete', () => {
    const pending = createSelectDeleteCandidatePendingAction(['1', '2']);
    expect(isSelectDeleteCandidatePendingAction(pending)).toBe(true);
    expect(getPendingOptionsCount(pending)).toBe(2);
    expect(resolveSelectedCandidateId(pending, 2)).toBe('2');
    expect(resolveSelectedCandidateId(pending, 3)).toBe('');
  });

  it('resuelve prompt key según tipo pending', () => {
    expect(getPendingPromptKey(createSelectDeleteCandidatePendingAction(['1']))).toBe('pendingNeedSelection');
    expect(getPendingPromptKey(createDeletePendingAction('1'))).toBe('pendingNeedDecision');
  });

  it('aplica delete sobre eventos', () => {
    const result = applyPendingActionToEvents(createDeletePendingAction('1'), baseEvents);
    expect(result.ok).toBe(true);
    expect(result.type).toBe(ASSISTANT_PENDING_ACTION_TYPES.DELETE);
    expect(result.events).toHaveLength(1);
    expect(result.affectedEvent.id).toBe('1');
  });

  it('aplica update sobre eventos', () => {
    const updated = { ...baseEvents[0], title: 'Demo v2' };
    const result = applyPendingActionToEvents(createUpdatePendingAction('1', updated), baseEvents);
    expect(result.ok).toBe(true);
    expect(result.type).toBe(ASSISTANT_PENDING_ACTION_TYPES.UPDATE);
    expect(result.events[0].title).toBe('Demo v2');
  });

  it('reporta errores controlados cuando falta evento o tipo no soportado', () => {
    expect(applyPendingActionToEvents(createDeletePendingAction('99'), baseEvents).ok).toBe(false);
    expect(applyPendingActionToEvents({ type: 'unknown', eventId: '1' }, baseEvents).ok).toBe(false);
  });
});