import { describe, expect, it } from 'vitest';
import {
  buildAssistantPayloadMessages,
  compactAssistantHistory,
  parseAssistantHistory,
  selectAssistantThreadMessages,
} from '../../src/js/utils/assistantHistoryUtils.js';

describe('assistantHistoryUtils', () => {
  it('compacta historial con solo roles válidos y contenido string', () => {
    const compact = compactAssistantHistory([
      { role: 'system', content: 'hidden' },
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: 'respuesta' },
      { role: 'assistant', content: 123 },
      null,
    ], 30);

    expect(compact).toEqual([
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: 'respuesta' },
    ]);
  });

  it('respeta límite tomando los últimos mensajes válidos', () => {
    const compact = compactAssistantHistory([
      { role: 'user', content: '1' },
      { role: 'assistant', content: '2' },
      { role: 'user', content: '3' },
    ], 2);

    expect(compact).toEqual([
      { role: 'assistant', content: '2' },
      { role: 'user', content: '3' },
    ]);
  });

  it('parsea historial desde JSON y omite mensaje legado desktop-only', () => {
    const raw = JSON.stringify([
      { role: 'assistant', content: 'Feature available only in the desktop app (Electron).' },
      { role: 'user', content: 'ok' },
      { role: 'assistant', content: 'vamos' },
    ]);

    const parsed = parseAssistantHistory(raw, { limit: 30, omitLegacyDesktopOnly: true });

    expect(parsed).toEqual([
      { role: 'user', content: 'ok' },
      { role: 'assistant', content: 'vamos' },
    ]);
  });

  it('devuelve vacío si el JSON es inválido', () => {
    expect(parseAssistantHistory('not-json')).toEqual([]);
  });

  it('construye payload con system prompt, contexto e historial compacto', () => {
    const payload = buildAssistantPayloadMessages({
      messages: [
        { role: 'system', content: 'ignore' },
        { role: 'user', content: 'hola' },
        { role: 'assistant', content: '¿qué tal?' },
      ],
      systemPrompt: 'Prompt base',
      context: 'Contexto agenda',
      historyLimit: 12,
    });

    expect(payload).toEqual([
      { role: 'system', content: 'Prompt base' },
      { role: 'system', content: 'Contexto agenda' },
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: '¿qué tal?' },
    ]);
  });

  it('incluye solo system prompt cuando no hay contexto ni historial válido', () => {
    const payload = buildAssistantPayloadMessages({
      messages: [{ role: 'tool', content: 'x' }],
      systemPrompt: 'Solo prompt',
      context: '',
      historyLimit: 12,
    });

    expect(payload).toEqual([
      { role: 'system', content: 'Solo prompt' },
    ]);
  });

  it('selecciona los últimos mensajes visibles del hilo', () => {
    const visible = selectAssistantThreadMessages([
      { role: 'user', content: '1' },
      { role: 'assistant', content: '2' },
      { role: 'user', content: '3' },
    ], 2);

    expect(visible).toEqual([
      { role: 'assistant', content: '2' },
      { role: 'user', content: '3' },
    ]);
  });

  it('si limit es inválido usa fallback de 20', () => {
    const source = Array.from({ length: 22 }, (_, i) => ({ role: 'user', content: String(i + 1) }));
    const visible = selectAssistantThreadMessages(source, 0);

    expect(visible).toHaveLength(20);
    expect(visible[0].content).toBe('3');
    expect(visible[19].content).toBe('22');
  });
});
