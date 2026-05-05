import { describe, it, expect } from 'vitest';
import { toPlainAssistantText } from '../../src/js/utils/assistantTextUtils.js';

describe('assistantTextUtils', () => {
  it('elimina símbolos markdown comunes para lectura limpia', () => {
    const input = '# Título\n\n- **Punto 1**\n- *Punto 2*\n\nTexto con `código`.';
    const out = toPlainAssistantText(input);

    expect(out).toContain('Título');
    expect(out).toContain('Punto 1');
    expect(out).toContain('Punto 2');
    expect(out).toContain('Texto con código.');
    expect(out).not.toContain('#');
    expect(out).not.toContain('**');
    expect(out).not.toContain('*Punto');
    expect(out).not.toContain('`código`');
  });

  it('convierte enlaces markdown a texto visible y limpia tablas simples', () => {
    const input = 'Mira [documentación](https://ejemplo.com).\n\n| col1 | col2 |\n| --- | --- |\n| a | b |';
    const out = toPlainAssistantText(input);

    expect(out).toContain('Mira documentación.');
    expect(out).toContain('col1');
    expect(out).toContain('a b');
    expect(out).not.toContain('[documentación]');
    expect(out).not.toContain('| --- | --- |');
  });

  it('retorna vacío cuando el contenido no tiene texto útil', () => {
    expect(toPlainAssistantText('   ')).toBe('');
    expect(toPlainAssistantText(null)).toBe('');
  });
});
