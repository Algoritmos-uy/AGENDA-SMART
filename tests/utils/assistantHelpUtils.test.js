import { describe, it, expect } from 'vitest';
import {
    detectAssistantManualTopic,
    getAssistantManualHelp,
    ttsSetupText
} from '../../src/js/utils/assistantHelpUtils.js';

describe('assistantHelpUtils', () => {
    it('detecta tema de proveedor tts', () => {
        expect(detectAssistantManualTopic('como cambio proveedor tts')).toBe('tts-provider');
    });

    it('genera ayuda manual', () => {
        const out = getAssistantManualHelp('ayuda con ttsprovider', 'es', 'auto, fish');
        expect(out.length).toBeGreaterThan(0);
    });

    it('renderiza texto de setup', () => {
        const out = ttsSetupText('askApiKey', 'es', { provider: 'fish' });
        expect(out.includes('fish')).toBe(true);
    });
});