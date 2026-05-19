import { describe, it, expect } from 'vitest';
import {
    isInvalidApiKeyError,
    sanitizeAssistantErrorMessage
} from '../../src/js/utils/assistantRuntimeUtils.js';

describe('assistantRuntimeUtils', () => {
    it('detecta errores de API key inválida', () => {
        expect(isInvalidApiKeyError('401 Unauthorized')).toBe(true);
        expect(isInvalidApiKeyError('invalid api key')).toBe(true);
    });

    it('enmascara posibles claves en errores', () => {
        const out = sanitizeAssistantErrorMessage('token sk-1234567890ABCDE fallo');
        expect(out.includes('[API_KEY]')).toBe(true);
    });
});