import { describe, it, expect } from 'vitest';
import {
  isInvalidApiKeyError,
  sanitizeAssistantErrorMessage,
} from '../../src/js/utils/assistantErrorUtils.js';

describe('assistantErrorUtils', () => {
  it('retorna fallback cuando el mensaje está vacío', () => {
    expect(sanitizeAssistantErrorMessage('', { fallbackMessage: 'Error de contacto' })).toBe('Error de contacto');
  });

  it('oculta tokens y sufijos sensibles en mensajes de error', () => {
    const raw = 'invalid api key sk-abc1234567890 ending in qwerty';
    const sanitized = sanitizeAssistantErrorMessage(raw, { fallbackMessage: 'fallback' });
    expect(sanitized).toContain('[API_KEY]');
    expect(sanitized).toContain('ending in ****');
    expect(sanitized).not.toContain('sk-abc1234567890');
  });

  it('detecta errores de API key inválida por distintos patrones', () => {
    expect(isInvalidApiKeyError('Invalid API key provided')).toBe(true);
    expect(isInvalidApiKeyError('401 unauthorized')).toBe(true);
    expect(isInvalidApiKeyError('invalid_auth token')).toBe(true);
    expect(isInvalidApiKeyError('network timeout')).toBe(false);
  });
});