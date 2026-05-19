import { describe, it, expect, vi } from 'vitest';
import { createVoiceRecognizer } from '../../src/js/utils/assistantVoiceRecognitionUtils.js';

describe('assistantVoiceRecognitionUtils', () => {
    it('retorna null si no hay SpeechRecognition', () => {
        const rec = createVoiceRecognizer({ windowRef: {} });
        expect(rec).toBeNull();
    });

    it('crea recognizer con configuración base y handlers', () => {
        class FakeRec { }
        const onstart = vi.fn();
        const onend = vi.fn();
        const onerror = vi.fn();
        const onresult = vi.fn();

        const rec = createVoiceRecognizer({
            windowRef: { SpeechRecognition: FakeRec },
            locale: 'es',
            getVoiceLang: () => 'es-ES',
            handlers: { onstart, onend, onerror, onresult }
        });

        expect(rec).toBeTruthy();
        expect(rec.lang).toBe('es-ES');
        expect(rec.interimResults).toBe(false);
        expect(rec.continuous).toBe(true);
        expect(rec.maxAlternatives).toBe(1);

        rec.onstart();
        rec.onend();
        rec.onerror({ error: 'network' });
        rec.onresult({ results: [] });

        expect(onstart).toHaveBeenCalledTimes(1);
        expect(onend).toHaveBeenCalledTimes(1);
        expect(onerror).toHaveBeenCalledTimes(1);
        expect(onresult).toHaveBeenCalledTimes(1);
    });
});