import { describe, it, expect } from 'vitest';
import { getVoiceLang, cleanVoiceTranscript, mapVoiceErrorCode } from '../../src/js/utils/voiceUtils.js';

describe('voiceUtils', () => {
  it('mapea locale a idioma de reconocimiento', () => {
    expect(getVoiceLang('es')).toBe('es-UY');
    expect(getVoiceLang('en-US')).toBe('en-US');
    expect(getVoiceLang('pt-BR')).toBe('pt-BR');
    expect(getVoiceLang('fr-FR')).toBe('es-UY');
  });

  it('limpia transcript de voz', () => {
    expect(cleanVoiceTranscript('  crear   evento   mañana  ')).toBe('crear evento mañana');
    expect(cleanVoiceTranscript('')).toBe('');
  });

  it('mapea códigos de error de reconocimiento a mensajes útiles', () => {
    expect(mapVoiceErrorCode('not-allowed')).toMatch(/Permiso de micrófono/i);
    expect(mapVoiceErrorCode('audio-capture')).toMatch(/No se detectó micrófono/i);
    expect(mapVoiceErrorCode('no-speech')).toMatch(/No se detectó voz/i);
    expect(mapVoiceErrorCode('network')).toMatch(/Error de red/i);
    expect(mapVoiceErrorCode('network', 'en-US')).toMatch(/network/i);
  });
});
