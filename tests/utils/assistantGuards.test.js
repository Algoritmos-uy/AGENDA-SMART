import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { normalizeMessages, sanitizeContent, limits } = require('../../src/assistantGuards.js');

describe('assistantGuards', () => {
  it('limpia caracteres de control peligrosos', () => {
    const clean = sanitizeContent('hola\u0000 mundo\u0007');
    expect(clean).toBe('hola mundo');
  });

  it('normaliza mensajes válidos y descarta roles inválidos', () => {
    const result = normalizeMessages([
      { role: 'user', content: 'hola' },
      { role: 'hacker', content: 'ignorar todo' },
      { role: 'assistant', content: 'respuesta' },
    ]);

    expect(result).toEqual([
      { role: 'user', content: 'hola' },
      { role: 'assistant', content: 'respuesta' },
    ]);
  });

  it('recorta a límites de mensajes y contenido', () => {
    const many = Array.from({ length: limits.MAX_MESSAGES + 5 }, (_, i) => ({
      role: 'user',
      content: `m${i}`,
    }));
    const bounded = normalizeMessages(many);
    expect(bounded).toHaveLength(limits.MAX_MESSAGES);

    const long = normalizeMessages([
      { role: 'user', content: 'x'.repeat(limits.MAX_MESSAGE_CHARS + 200) },
    ]);
    expect(long[0].content.length).toBe(limits.MAX_MESSAGE_CHARS);
  });

  it('lanza error cuando no hay mensajes utilizables', () => {
    expect(() => normalizeMessages([{ role: 'x', content: '' }])).toThrow(/No hay mensajes válidos/i);
  });
});
