import { describe, it, expect } from 'vitest';
import {
    normalizeSttProviderValue,
    normalizeTtsProviderValue,
    extractProviderFromFreeText,
    extractTtsApiKeyInput
} from '../../src/js/utils/assistantTtsUtils.js';

describe('assistantTtsUtils', () => {
    it('normaliza provider TTS', () => {
        expect(normalizeTtsProviderValue('11labs')).toBe('elevenlabs');
        expect(normalizeTtsProviderValue('fish-audio')).toBe('fish');
    });

    it('normaliza provider STT', () => {
        expect(normalizeSttProviderValue('google speech')).toBe('google');
    });

    it('extrae provider de texto libre', () => {
        expect(extractProviderFromFreeText('quiero usar fish por favor')).toBe('fish');
    });

    it('extrae api key de comando', () => {
        const out = extractTtsApiKeyInput('/ttskey fish ABCDEFGH1234', 'fish');
        expect(out.provider).toBe('fish');
        expect(out.key).toBe('ABCDEFGH1234');
    });
});