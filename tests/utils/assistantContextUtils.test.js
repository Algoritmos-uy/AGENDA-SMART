import { describe, it, expect } from 'vitest';
import {
  buildAssistantContextFromEvents,
  formatAssistantEventLine,
  formatAssistantEventsForRange,
} from '../../src/js/utils/assistantContextUtils.js';

describe('assistantContextUtils', () => {
  const getAttendanceLabel = (s = 'pending') => ({ pending: 'Pendiente', confirmed: 'Confirmado' }[s] || 'Pendiente');

  it('formatea una línea de evento para asistente con descripción y asistencia', () => {
    const line = formatAssistantEventLine(
      { date: '2026-05-10', start: '09:00', end: '10:00', title: 'Demo', description: 'Sprint', attendance: 'confirmed' },
      { getAttendanceLabel },
    );
    expect(line).toBe('- 2026-05-10 09:00-10:00 Demo — Sprint [Confirmado]');
  });

  it('formatea lista por rango usando headers/noEvents con fallback', () => {
    const emptyText = formatAssistantEventsForRange({
      list: [],
      range: 'today',
      noEvents: { today: 'Sin eventos hoy' },
      defaultNoEventsText: 'Sin eventos',
      getAttendanceLabel,
    });
    expect(emptyText).toBe('Sin eventos hoy');

    const nonEmpty = formatAssistantEventsForRange({
      list: [{ date: '2026-05-10', start: '09:00', end: '10:00', title: 'Demo', attendance: 'pending' }],
      range: 'today',
      headers: { today: 'Eventos de hoy:' },
      defaultTitle: 'Eventos',
      getAttendanceLabel,
    });
    expect(nonEmpty).toContain('Eventos de hoy:');
    expect(nonEmpty).toContain('[Pendiente]');
  });

  it('construye contexto con próximos eventos y respeta límite', () => {
    const parseLocalDate = (dateStr = '') => {
      const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return null;
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    };

    const context = buildAssistantContextFromEvents({
      events: [
        { date: '2026-05-01', start: '09:00', end: '10:00', title: 'Viejo', attendance: 'pending' },
        { date: '2026-05-10', start: '09:00', end: '10:00', title: 'A', attendance: 'pending' },
        { date: '2026-05-11', start: '10:00', end: '11:00', title: 'B', attendance: 'confirmed' },
      ],
      now: new Date('2026-05-10T12:00:00Z'),
      parseLocalDate,
      getAttendanceLabel,
      limit: 1,
    });

    expect(context).toContain('Agenda context (max 1 upcoming):');
    expect(context).toContain('A');
    expect(context).not.toContain('B');
  });
});