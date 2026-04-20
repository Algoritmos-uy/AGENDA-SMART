import { describe, it, expect } from 'vitest';
import {
  detectAssistantRange,
  extractAssistantAction,
  normalizeReminderOffset,
  inferEndFromStart,
  normalizeAttendanceStatus,
  eventsOverlap,
  findEventConflicts,
  suggestRescheduleSlots,
  validateEventPayload,
  toEventPayload,
} from '../../src/js/utils/assistantEventUtils.js';

describe('assistantEventUtils', () => {
  it('detecta rangos de consulta rápida en varios idiomas', () => {
    expect(detectAssistantRange('eventos de hoy')).toBe('today');
    expect(detectAssistantRange('events this week')).toBe('week');
    expect(detectAssistantRange('eventos do mês')).toBe('month');
    expect(detectAssistantRange('hola')).toBeNull();
  });

  it('extrae acción JSON válida y devuelve null en contenido inválido', () => {
    const valid = 'texto {"action":"create_event","title":"Demo"} más texto';
    expect(extractAssistantAction(valid)).toEqual({ action: 'create_event', title: 'Demo' });
    expect(extractAssistantAction('sin json')).toBeNull();
  });

  it('normaliza reminder_offset con fallback', () => {
    expect(normalizeReminderOffset(300)).toBe(300);
    expect(normalizeReminderOffset('120')).toBe(120);
    expect(normalizeReminderOffset(-1)).toBe(600);
    expect(normalizeReminderOffset('abc')).toBe(600);
  });

  it('normaliza estados de asistencia (RSVP) con sinónimos', () => {
    expect(normalizeAttendanceStatus('confirmado')).toBe('confirmed');
    expect(normalizeAttendanceStatus('No')).toBe('declined');
    expect(normalizeAttendanceStatus('tal vez')).toBe('tentative');
    expect(normalizeAttendanceStatus('')).toBe('pending');
    expect(normalizeAttendanceStatus('desconocido', '')).toBe('');
  });

  it('autocompleta hora fin (+60 min) y limita a 23:59', () => {
    expect(inferEndFromStart('09:30')).toBe('10:30');
    expect(inferEndFromStart('23:40')).toBe('23:59');
    expect(inferEndFromStart('xx:yy')).toBeNull();
  });

  it('valida payload de evento y reporta errores de formato', () => {
    const ok = validateEventPayload({
      title: 'Reunión',
      date: '2026-04-02',
      start: '09:00',
      end: '10:00',
      description: 'Plan',
      color: '#2563eb',
      reminder_offset: 900,
    });
    expect(ok.ok).toBe(true);
    expect(ok.data.reminder_offset).toBe(900);

    const bad = validateEventPayload({
      title: '',
      date: '02-04-2026',
      start: '10:00',
      end: '09:00',
    });
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain('Falta título.');
    expect(bad.error).toContain('Fecha inválida');
    expect(bad.error).toContain('posterior');
  });

  it('devuelve errores en inglés cuando se solicita locale en', () => {
    const bad = validateEventPayload({
      title: '',
      date: '02-04-2026',
      start: '10:00',
      end: '09:00',
    }, 'en-US');

    expect(bad.ok).toBe(false);
    expect(bad.error).toContain('Title is required.');
    expect(bad.error).toContain('Invalid date');
    expect(bad.error).toContain('End time must be later');
  });

  it('convierte payload validado a evento persistible', () => {
    const event = toEventPayload({
      title: 'Sprint',
      date: '2026-04-02',
      start: '11:00',
      end: '12:00',
      description: '',
      color: '#111111',
      reminder_offset: '300',
    });

    expect(event.id).toBeTypeOf('string');
    expect(event.title).toBe('Sprint');
    expect(event.reminder_offset).toBe(300);
    expect(event.attendance).toBe('pending');
  });

  it('convierte attendance al crear payload de evento', () => {
    const event = toEventPayload({
      title: 'Demo',
      date: '2026-04-20',
      start: '09:00',
      end: '10:00',
      attendance: 'confirmado',
    });

    expect(event.attendance).toBe('confirmed');
  });

  it('valida y crea end automático cuando falta en payload', () => {
    const ok = validateEventPayload({
      title: 'Daily',
      date: '2026-04-03',
      start: '14:00',
      description: 'Seguimiento',
      color: '#2563eb',
    });

    expect(ok.ok).toBe(true);
    expect(ok.data.end).toBe('15:00');
    expect(ok.data.autoCompletedEnd).toBe(true);
  });

  it('usa duration_minutes para autocompletar end cuando el asistente la envía', () => {
    const ok = validateEventPayload({
      title: 'Planificación',
      date: '2026-04-07',
      start: '10:00',
      duration_minutes: 90,
    });

    expect(ok.ok).toBe(true);
    expect(ok.data.end).toBe('11:30');
    expect(ok.data.autoCompletedEnd).toBe(true);
    expect(ok.data.autoDurationMinutes).toBe(90);
  });

  it('acepta duration en texto como "90 minutos" y calcula end', () => {
    const ok = validateEventPayload({
      title: 'Seguimiento',
      date: '2026-04-08',
      start: '16:00',
      duration: '90 minutos',
    });

    expect(ok.ok).toBe(true);
    expect(ok.data.end).toBe('17:30');
    expect(ok.data.autoDurationMinutes).toBe(90);
  });

  it('acepta duración natural "hora y media" y calcula end', () => {
    const ok = validateEventPayload({
      title: 'Demo IA',
      date: '2026-04-09',
      start: '09:00',
      duration: 'hora y media',
    });

    expect(ok.ok).toBe(true);
    expect(ok.data.end).toBe('10:30');
    expect(ok.data.autoDurationMinutes).toBe(90);
  });

  it('acepta formato mixto "1h30m" para duración', () => {
    const ok = validateEventPayload({
      title: 'Pairing',
      date: '2026-04-10',
      start: '14:00',
      duration: '1h30m',
    });

    expect(ok.ok).toBe(true);
    expect(ok.data.end).toBe('15:30');
    expect(ok.data.autoDurationMinutes).toBe(90);
  });

  it('detecta solapamiento de eventos en la misma fecha', () => {
    expect(eventsOverlap(
      { date: '2026-04-20', start: '10:00', end: '11:00' },
      { date: '2026-04-20', start: '10:30', end: '11:30' }
    )).toBe(true);

    expect(eventsOverlap(
      { date: '2026-04-20', start: '10:00', end: '11:00' },
      { date: '2026-04-20', start: '11:00', end: '12:00' }
    )).toBe(false);
  });

  it('encuentra conflictos ignorando el mismo evento', () => {
    const events = [
      { id: 'a', date: '2026-04-20', start: '10:00', end: '11:00' },
      { id: 'b', date: '2026-04-20', start: '10:30', end: '11:30' },
    ];
    const conflicts = findEventConflicts({ date: '2026-04-20', start: '10:15', end: '10:45' }, events, 'a');
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].id).toBe('b');
  });

  it('sugiere slots libres para reprogramar cuando hay conflicto', () => {
    const events = [
      { id: 'x', date: '2026-04-20', start: '10:00', end: '11:00' },
      { id: 'y', date: '2026-04-20', start: '11:00', end: '12:00' },
      { id: 'z', date: '2026-04-20', start: '13:00', end: '14:00' },
    ];
    const slots = suggestRescheduleSlots(
      { id: 'x', date: '2026-04-20', start: '10:00', end: '11:00' },
      events,
      { ignoreEventId: 'x', maxSuggestions: 2, stepMinutes: 30 }
    );

    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0].date).toBe('2026-04-20');
    expect(slots[0].start >= '12:00').toBe(true);
  });
});
