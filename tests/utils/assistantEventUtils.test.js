import { describe, it, expect } from 'vitest';
import {
  detectAssistantRange,
  extractAssistantAction,
  normalizeReminderOffset,
  inferEndFromStart,
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
});
