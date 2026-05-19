import { describe, it, expect } from 'vitest';
import {
    getSttRetryDelayMs,
    isRetryableSttError,
    resolveRecorderMimeType
} from '../../src/js/utils/assistantVoiceRecorderUtils.js';

describe('assistantVoiceRecorderUtils', () => {
    it('calcula backoff acotado', () => {
        expect(getSttRetryDelayMs(1)).toBe(700);
        expect(getSttRetryDelayMs(10)).toBe(3500);
    });

    it('detecta errores reintentables de red', () => {
        expect(isRetryableSttError('network timeout')).toBe(true);
        expect(isRetryableSttError('503 service unavailable')).toBe(true);
        expect(isRetryableSttError('invalid api key')).toBe(false);
    });

    it('resuelve mimeType soportado', () => {
        const fakeWindow = {
            MediaRecorder: {
                isTypeSupported: (t) => t === 'audio/webm'
            }
        };
        expect(resolveRecorderMimeType(fakeWindow)).toBe('audio/webm');
    });
});