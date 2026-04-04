import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { isAutoStartSupported, isAutoStartLaunch } = require('../../src/autoStartUtils.js');

describe('autoStartUtils', () => {
  it('detecta plataformas soportadas para login item', () => {
    expect(isAutoStartSupported('win32')).toBe(true);
    expect(isAutoStartSupported('darwin')).toBe(true);
    expect(isAutoStartSupported('linux')).toBe(false);
  });

  it('detecta arranque automático por argumentos o settings del sistema', () => {
    expect(isAutoStartLaunch({ argv: ['--autostart'], loginItemSettings: {} })).toBe(true);
    expect(isAutoStartLaunch({ argv: [], loginItemSettings: { wasOpenedAtLogin: true } })).toBe(true);
    expect(isAutoStartLaunch({ argv: [], loginItemSettings: {} })).toBe(false);
  });
});
