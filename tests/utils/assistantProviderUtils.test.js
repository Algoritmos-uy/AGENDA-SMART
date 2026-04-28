import { describe, it, expect } from 'vitest';
import {
  getApiKeyByProvider,
  getGenderPromptSuffix,
  normalizeSttProviderValue,
  normalizeTtsGender,
  normalizeTtsProviderValue,
} from '../../src/js/utils/assistantProviderUtils.js';

describe('assistantProviderUtils', () => {
  it('normaliza género TTS con aliases frecuentes', () => {
    expect(normalizeTtsGender('f')).toBe('feminine');
    expect(normalizeTtsGender('MASCULINA')).toBe('masculine');
    expect(normalizeTtsGender('desconocido')).toBe('');
  });

  it('construye sufijo del prompt por idioma y género', () => {
    expect(getGenderPromptSuffix('en', 'male')).toMatch(/masculine form/i);
    expect(getGenderPromptSuffix('pt', 'female')).toMatch(/feminino/i);
    expect(getGenderPromptSuffix('es', 'm')).toMatch(/masculino/i);
  });

  it('normaliza proveedores STT con aliases', () => {
    expect(normalizeSttProviderValue('local-browser')).toBe('browser');
    expect(normalizeSttProviderValue('11labs')).toBe('elevenlabs');
    expect(normalizeSttProviderValue('gpt-4o')).toBe('openai');
    expect(normalizeSttProviderValue('Google Speech')).toBe('google');
    expect(normalizeSttProviderValue('otro')).toBe('');
  });

  it('normaliza proveedores TTS con aliases', () => {
    expect(normalizeTtsProviderValue('auto')).toBe('auto');
    expect(normalizeTtsProviderValue('eleven')).toBe('elevenlabs');
    expect(normalizeTtsProviderValue('gpt4o-mini-tts')).toBe('openai');
    expect(normalizeTtsProviderValue('gemini flash tts')).toBe('gemini');
    expect(normalizeTtsProviderValue('otro')).toBe('');
  });

  it('obtiene api key según proveedor activo con fallback Android TTS', () => {
    const cfg = {
      openaiApiKey: ' oa ',
      googleApiKey: ' gg ',
      geminiApiKey: ' ge ',
      androidTtsApiKey: ' and ',
    };

    expect(getApiKeyByProvider(cfg, 'openai')).toBe('oa');
    expect(getApiKeyByProvider(cfg, 'google')).toBe('gg');
    expect(getApiKeyByProvider(cfg, 'gemini')).toBe('ge');
    expect(getApiKeyByProvider(cfg, 'elevenlabs')).toBe('and');
  });
});