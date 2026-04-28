import { describe, it, expect } from 'vitest';
import { getEventsByRangeFromList, normalizeViewTargetValue } from '../../src/js/utils/assistantRangeUtils.js';

describe('assistantRangeUtils', () => {
  const parseLocalDate = (dateStr = '') => {
    const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  };

  const events = [
    { id: '1', date: '2026-05-11', start: '09:00' },
    { id: '2', date: '2026-05-13', start: '10:00' },
    { id: '3', date: '2026-05-28', start: '11:00' },
    { id: '4', date: '2026-06-02', start: '08:00' },
  ];

  it('normaliza target de vista con aliases', () => {
    expect(normalizeViewTargetValue('day')).toBe('daily');
    expect(normalizeViewTargetValue('semanal')).toBe('weekly');
    expect(normalizeViewTargetValue('monthly')).toBe('monthly');
  });

  it('filtra eventos por today', () => {
    const now = new Date('2026-05-13T12:00:00Z');
    const result = getEventsByRangeFromList({ events, range: 'today', now, parseLocalDate });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('filtra eventos por week y month', () => {
    const now = new Date('2026-05-13T12:00:00Z');
    const week = getEventsByRangeFromList({ events, range: 'week', now, parseLocalDate });
    const month = getEventsByRangeFromList({ events, range: 'month', now, parseLocalDate });

    expect(week.map(e => e.id)).toEqual(['1', '2']);
    expect(month.map(e => e.id)).toEqual(['1', '2', '3']);
  });

  it('retorna vacío para rango inválido', () => {
    const now = new Date('2026-05-13T12:00:00Z');
    expect(getEventsByRangeFromList({ events, range: 'year', now, parseLocalDate })).toEqual([]);
  });
});