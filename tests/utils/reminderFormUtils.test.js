import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REMINDER_OFFSET_SECONDS,
  deriveReminderFormState,
  getDefaultReminderOffsets,
  parseReminderOffsetsFromFormState,
} from '../../src/js/utils/reminderFormUtils.js';

describe('reminderFormUtils', () => {
  it('devuelve default de 30 minutos en segundos', () => {
    expect(DEFAULT_REMINDER_OFFSET_SECONDS).toBe(1800);
    expect(getDefaultReminderOffsets()).toEqual([1800]);
  });

  it('parsea recordatorio custom válido', () => {
    const parsed = parseReminderOffsetsFromFormState({
      isCustom: true,
      customMinutes: '25',
      checkedOffsetValues: ['900'],
    });
    expect(parsed.ok).toBe(true);
    expect(parsed.offsets).toEqual([1500]);
  });

  it('marca error en recordatorio custom inválido', () => {
    const parsed = parseReminderOffsetsFromFormState({
      isCustom: true,
      customMinutes: '0',
    });
    expect(parsed.ok).toBe(false);
  });

  it('parsea offsets seleccionados en modo no custom', () => {
    const parsed = parseReminderOffsetsFromFormState({
      isCustom: false,
      checkedOffsetValues: ['900', '1800', 'bad'],
    });
    expect(parsed.ok).toBe(true);
    expect(parsed.offsets).toEqual([900, 1800]);
  });

  it('deriva estado de formulario para offsets fijos', () => {
    const state = deriveReminderFormState([900, 1800]);
    expect(state.customSelected).toBe(false);
    expect(state.checkedOffsets).toEqual([900, 1800]);
    expect(state.customMinutes).toBe('');
  });

  it('deriva estado custom para offset no fijo', () => {
    const state = deriveReminderFormState([1500]);
    expect(state.customSelected).toBe(true);
    expect(state.customMinutes).toBe(25);
    expect(state.checkedOffsets).toEqual([]);
  });
});
