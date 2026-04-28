import { describe, it, expect } from 'vitest';
import {
  getAttendanceActionLabelForLocale,
  getAttendanceLabelForLocale,
  getAttendanceStatusTextForLocale,
} from '../../src/js/utils/assistantAttendanceTextUtils.js';

describe('assistantAttendanceTextUtils', () => {
  it('devuelve labels por locale con fallback seguro', () => {
    expect(getAttendanceLabelForLocale('es-UY', 'confirmed')).toBe('Confirmado');
    expect(getAttendanceLabelForLocale('en-US', 'declined')).toBe('Declined');
    expect(getAttendanceLabelForLocale('fr-FR', 'tentative')).toBe('Tentativo');
  });

  it('devuelve action labels por locale', () => {
    expect(getAttendanceActionLabelForLocale('pt-BR', 'pending')).toBe('Marcar pendente');
    expect(getAttendanceActionLabelForLocale('en', 'confirmed')).toBe('Confirm attendance');
  });

  it('construye mensajes de estado interpolando variables', () => {
    const updated = getAttendanceStatusTextForLocale('es', 'updated', {
      title: 'Demo',
      status: 'Confirmado',
    });
    expect(updated).toContain('Demo');
    expect(updated).toContain('Confirmado');

    const invalid = getAttendanceStatusTextForLocale('en-US', 'invalid');
    expect(invalid).toBe('Invalid attendance status.');
  });
});