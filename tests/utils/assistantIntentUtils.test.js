import { describe, it, expect } from 'vitest';
import {
  getAssistantSelectionNumber,
  isAssistantCancelText,
  isAssistantConfirmText,
  isAssistantCreateIntent,
  parseAssistantAttendanceFromText,
  parseAssistantCreateFromText,
  parseAssistantDateHint,
  parseAssistantDeleteFromText,
  parseAssistantRescheduleFromText,
  parseAssistantTimeHint,
  titleMatchesLoose,
  normalizeLooseText,
} from '../../src/js/utils/assistantIntentUtils.js';

describe('assistantIntentUtils', () => {
  const now = new Date('2026-04-27T10:00:00Z');

  it('normaliza texto laxo removiendo acentos y puntuación', () => {
    expect(normalizeLooseText('  Reunión: João, mañana!!  ')).toBe('reunion joao manana');
  });

  it('detecta intención de crear evento y parsea creación con fecha/hora relativas', () => {
    expect(isAssistantCreateIntent('agenda reunión mañana a las 9')).toBe(true);

    const action = parseAssistantCreateFromText('agenda reunión mañana a las 9', now);
    expect(action).toMatchObject({
      action: 'create_event',
      title: 'reunión',
      date: '2026-04-28',
      start: '09:00',
      duration_minutes: 60,
    });
  });

  it('extrae fecha y hora explícitas o relativas', () => {
    expect(parseAssistantDateHint('evento para hoy', now)).toBe('2026-04-27');
    expect(parseAssistantDateHint('evento 2026-05-01', now)).toBe('2026-05-01');
    expect(parseAssistantTimeHint('mover a las 14')).toBe('14:00');
    expect(parseAssistantTimeHint('mover 14:35')).toBe('14:35');
  });

  it('parsea reprogramación con target y nuevo horario', () => {
    const action = parseAssistantRescheduleFromText(
      'reprogramar evento demo 2026-04-27 10:00 para 2026-04-28 11:30',
      now,
    );

    expect(action).toMatchObject({
      action: 'reschedule_event',
      title: 'demo 2026-04-27 10:00',
      target_date: '2026-04-27',
      target_start: '10:00',
      new_date: '2026-04-28',
      new_start: '11:30',
    });
  });

  it('parsea eliminación con título limpio y metadatos opcionales', () => {
    const action = parseAssistantDeleteFromText('elimina evento demo mañana 09:00', now);
    expect(action).toMatchObject({
      action: 'delete_event',
      title: 'demo',
      date: '2026-04-28',
      start: '09:00',
    });
  });

  it('parsea actualización de asistencia', () => {
    const action = parseAssistantAttendanceFromText('confirmar asistencia evento planning para hoy 10:00', now);
    expect(action).toMatchObject({
      action: 'set_attendance',
      title: 'planning',
      attendance: 'confirmed',
      date: '2026-04-27',
      start: '10:00',
    });
  });

  it('compara títulos de forma tolerante', () => {
    expect(titleMatchesLoose('Reunión de Sprint', 'reunion sprint')).toBe(true);
    expect(titleMatchesLoose('Demo Producto', 'facturación')).toBe(false);
  });

  it('interpreta confirmación/cancelación y selección numérica', () => {
    expect(isAssistantConfirmText('sí, confirmo')).toBe(true);
    expect(isAssistantCancelText('no cancelar')).toBe(true);
    expect(getAssistantSelectionNumber('elijo opción 2', 3)).toBe(2);
    expect(getAssistantSelectionNumber('elijo opción 7', 3)).toBeNull();
  });
});