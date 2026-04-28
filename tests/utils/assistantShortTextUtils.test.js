import { describe, it, expect } from 'vitest';
import { formatAssistantShortText } from '../../src/js/utils/assistantShortTextUtils.js';

describe('assistantShortTextUtils', () => {
  it('resuelve texto por locale con fallback a idioma base', () => {
    expect(formatAssistantShortText('en-US', 'actionCancelled')).toBe('Action cancelled.');
    expect(formatAssistantShortText('pt-BR', 'eventNotFound')).toMatch(/Não encontrei/i);
  });

  it('reemplaza placeholders en template', () => {
    const msg = formatAssistantShortText('es', 'eventUpdated', { event: '2026-05-01 09:00-10:00 Demo' });
    expect(msg).toContain('Evento actualizado');
    expect(msg).toContain('Demo');
  });

  it('usa fallback al diccionario es cuando locale/key no existen', () => {
    expect(formatAssistantShortText('fr-FR', 'eventDeleted', { event: 'X' })).toContain('Evento eliminado');
    expect(formatAssistantShortText('es', 'clave_inexistente')).toBe('clave_inexistente');
  });
});