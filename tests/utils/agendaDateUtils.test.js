import { describe, it, expect } from 'vitest';
import {
  parseLocalDate,
  formatISODate,
  startOfWeek,
  addDays,
  sortEvents,
  normalizeLocale,
  buildSlots,
  isInSlot,
} from '../../src/js/utils/agendaDateUtils.js';

describe('agendaDateUtils', () => {
  it('parsea fechas locales y formatea ISO sin desfase', () => {
    const parsed = parseLocalDate('2026-04-02');
    expect(parsed).toBeInstanceOf(Date);
    expect(formatISODate(parsed)).toBe('2026-04-02');
  });

  it('calcula correctamente el inicio de semana (lunes)', () => {
    const thursday = parseLocalDate('2026-04-02');
    const monday = startOfWeek(thursday);
    expect(formatISODate(monday)).toBe('2026-03-30');
  });

  it('ordena eventos por fecha y hora', () => {
    const events = [
      { date: '2026-04-03', start: '09:00' },
      { date: '2026-04-02', start: '12:00' },
      { date: '2026-04-02', start: '08:00' },
    ];
    const sorted = sortEvents(events);
    expect(sorted.map(e => `${e.date} ${e.start}`)).toEqual([
      '2026-04-02 08:00',
      '2026-04-02 12:00',
      '2026-04-03 09:00',
    ]);
  });

  it('normaliza locales soportados', () => {
    expect(normalizeLocale('en-US')).toBe('en');
    expect(normalizeLocale('pt-BR')).toBe('pt');
    expect(normalizeLocale('es-UY')).toBe('es');
    expect(normalizeLocale('fr-FR')).toBe('es');
    expect(normalizeLocale('it-IT')).toBe('es');
  });

  it('construye slots y detecta si un evento cae en slot', () => {
    const slots = buildSlots(8, 10);
    expect(slots).toHaveLength(2);
    expect(isInSlot({ start: '08:30' }, slots[0])).toBe(true);
    expect(isInSlot({ start: '10:00' }, slots[1])).toBe(false);
  });

  it('suma días correctamente', () => {
    const d = parseLocalDate('2026-04-02');
    expect(formatISODate(addDays(d, 5))).toBe('2026-04-07');
  });
});
