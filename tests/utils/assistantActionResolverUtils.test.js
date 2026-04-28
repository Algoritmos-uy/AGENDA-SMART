import { describe, it, expect } from 'vitest';
import {
  buildRescheduleConflictSummary,
  buildUpdateCandidate,
  formatAmbiguousCandidatesOptions,
  getAttendanceFromAction,
  getTopActionCandidates,
  getUpdatePayloadFromAction,
  isAttendanceActionType,
  mapRescheduleActionToUpdateAction,
  normalizeAttendanceActionAlias,
  resolveCandidatesDecision,
  resolveActionCandidates,
} from '../../src/js/utils/assistantActionResolverUtils.js';

describe('assistantActionResolverUtils', () => {
  const events = [
    { id: '1', title: 'Demo Sprint', date: '2026-05-03', start: '09:00', end: '10:00', attendance: 'pending' },
    { id: '2', title: 'Sync Ventas', date: '2026-05-03', start: '11:00', end: '12:00', attendance: 'pending' },
    { id: '3', title: 'Demo Sprint', date: '2026-05-04', start: '09:00', end: '10:00', attendance: 'pending' },
  ];

  it('extrae attendance desde action con normalización', () => {
    expect(getAttendanceFromAction({ attendance_status: 'confirmado' })).toBe('confirmed');
    expect(getAttendanceFromAction({ status: 'tal vez' })).toBe('tentative');
  });

  it('normaliza aliases de asistencia a set_attendance', () => {
    expect(normalizeAttendanceActionAlias({ action: 'confirm_attendance' })).toMatchObject({
      action: 'set_attendance',
      attendance: 'confirmed',
    });
    expect(normalizeAttendanceActionAlias({ action: 'decline_attendance' })).toMatchObject({
      action: 'set_attendance',
      attendance: 'declined',
    });
    expect(normalizeAttendanceActionAlias({ action: 'tentative_attendance' })).toMatchObject({
      action: 'set_attendance',
      attendance: 'tentative',
    });
  });

  it('identifica acciones de attendance/rsvp', () => {
    expect(isAttendanceActionType({ action: 'set_attendance' })).toBe(true);
    expect(isAttendanceActionType({ action: 'update_attendance' })).toBe(true);
    expect(isAttendanceActionType({ action: 'rsvp_event' })).toBe(true);
    expect(isAttendanceActionType({ action: 'delete_event' })).toBe(false);
  });

  it('resuelve candidatos por id de forma exacta', () => {
    const result = resolveActionCandidates({ event_id: '2' }, events);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('resuelve candidatos por título + fecha + hora', () => {
    const result = resolveActionCandidates({
      title: 'demo sprint',
      target_date: '2026-05-03',
      target_start: '09:00',
    }, events);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('recorta candidatos al top esperado', () => {
    const top = getTopActionCandidates(events, 2);
    expect(top).toHaveLength(2);
    expect(top[0].id).toBe('1');
    expect(top[1].id).toBe('2');
  });

  it('resuelve estado de candidatos: none, ambiguous y single', () => {
    const none = resolveCandidatesDecision([], { limit: 5 });
    expect(none.kind).toBe('none');
    expect(none.selected).toBeNull();

    const ambiguous = resolveCandidatesDecision(events, { limit: 2 });
    expect(ambiguous.kind).toBe('ambiguous');
    expect(ambiguous.topCandidates).toHaveLength(2);

    const single = resolveCandidatesDecision([events[1]], { limit: 5 });
    expect(single.kind).toBe('single');
    expect(single.selected.id).toBe('2');
  });

  it('formatea opciones ambiguas en modo lista y numerado', () => {
    const list = formatAmbiguousCandidatesOptions(events, ev => `${ev.title} ${ev.start}`, { limit: 2 });
    expect(list).toContain('- Demo Sprint 09:00');
    expect(list).toContain('- Sync Ventas 11:00');

    const numbered = formatAmbiguousCandidatesOptions(events, ev => ev.title, { limit: 2, numbered: true });
    expect(numbered).toContain('1) Demo Sprint');
    expect(numbered).toContain('2) Sync Ventas');
  });

  it('construye resumen de conflictos y sugerencias para reprogramar', () => {
    const summary = buildRescheduleConflictSummary(
      [events[0], events[1], events[2]],
      [
        { date: '2026-05-03', start: '14:00', end: '15:00' },
        { date: '2026-05-03', start: '16:00', end: '17:00' },
      ],
      {
        formatEvent: (ev) => `${ev.title} ${ev.start}-${ev.end}`,
        conflictLimit: 2,
      }
    );

    expect(summary.conflictText).toContain('Demo Sprint 09:00-10:00');
    expect(summary.conflictText).toContain('Sync Ventas 11:00-12:00');
    expect(summary.conflictText).not.toContain('2026-05-04');
    expect(summary.suggestionsText).toContain('2026-05-03 14:00-15:00');
    expect(summary.suggestionsText).toContain('2026-05-03 16:00-17:00');
    expect(summary.hasSuggestions).toBe(true);
  });

  it('indica ausencia de sugerencias cuando la lista está vacía', () => {
    const summary = buildRescheduleConflictSummary([events[0]], [], {
      formatEvent: (ev) => ev.title,
    });

    expect(summary.conflictText).toBe('Demo Sprint');
    expect(summary.suggestionsText).toBe('');
    expect(summary.hasSuggestions).toBe(false);
  });

  it('mapea acción de reprogramación con target explícito a update_event', () => {
    const mapped = mapRescheduleActionToUpdateAction({
      action: 'reschedule_event',
      title: 'Demo Sprint',
      target_date: '2026-05-03',
      target_start: '09:00',
      new_date: '2026-05-04',
      new_start: '10:00',
    });

    expect(mapped.action).toBe('update_event');
    expect(mapped.date).toBe('2026-05-03');
    expect(mapped.start).toBe('09:00');
    expect(mapped.new_date).toBe('2026-05-04');
    expect(mapped.new_start).toBe('10:00');
    expect(mapped.title).toBe('Demo Sprint');
  });

  it('si no hay target explícito elimina date/start/end del mapeo', () => {
    const mapped = mapRescheduleActionToUpdateAction({
      action: 'reprogram_event',
      title: 'Demo Sprint',
      date: '2026-05-10',
      start: '15:00',
      end: '16:00',
      new_start: '17:00',
    });

    expect(mapped.action).toBe('update_event');
    expect(mapped.date).toBeUndefined();
    expect(mapped.start).toBeUndefined();
    expect(mapped.end).toBeUndefined();
    expect(mapped.new_start).toBe('17:00');
  });

  it('normaliza payload de update con cambios root + explicit', () => {
    const payload = getUpdatePayloadFromAction({
      new_title: 'Demo Sprint v2',
      new_date: '2026-05-10',
      changes: {
        start: '10:30',
      },
      duration_minutes: 90,
    });

    expect(payload).toMatchObject({
      title: 'Demo Sprint v2',
      date: '2026-05-10',
      start: '10:30',
      duration_minutes: 90,
    });
  });

  it('construye update candidate infiriendo end por duración', () => {
    const current = { ...events[0] };
    const built = buildUpdateCandidate(current, {
      new_start: '10:00',
      duration_minutes: 90,
      attendance: 'confirmado',
    }, { locale: 'es' });

    expect(built.ok).toBe(true);
    expect(built.nextEvent.start).toBe('10:00');
    expect(built.nextEvent.end).toBe('11:30');
    expect(built.nextEvent.attendance).toBe('confirmed');
    expect(built.nextEvent.id).toBe(current.id);
  });

  it('devuelve error cuando update queda inválido', () => {
    const current = { ...events[0] };
    const built = buildUpdateCandidate(current, {
      new_end: '08:00',
    }, { locale: 'es' });

    expect(built.ok).toBe(false);
    expect(String(built.error || '')).toMatch(/hora|end/i);
  });
});