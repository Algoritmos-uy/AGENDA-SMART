import { describe, it, expect } from 'vitest';
import {
    appendVoiceTranscriptBuffer,
    getFinalVoiceTranscript,
    resetVoiceCaptureFlags
} from '../../src/js/utils/assistantVoiceCaptureUtils.js';

describe('assistantVoiceCaptureUtils', () => {
    it('resetea estado base', () => {
        expect(resetVoiceCaptureFlags()).toEqual({ buffer: '', submitting: false });
    });

    it('acumula transcript sin duplicar cola', () => {
        const a = appendVoiceTranscriptBuffer('', 'hola mundo');
        const b = appendVoiceTranscriptBuffer(a, 'mundo');
        expect(a).toBe('hola mundo');
        expect(b).toBe('hola mundo');
    });

    it('normaliza transcript final', () => {
        expect(getFinalVoiceTranscript('  hola   mundo  ')).toBe('hola mundo');
    });
});