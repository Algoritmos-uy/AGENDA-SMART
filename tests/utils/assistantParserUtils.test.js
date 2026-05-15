import { describe, it, expect } from 'vitest';
import {
    normalizeLooseText,
    stripLeadingCommandWords,
    isAssistantConfirmText,
    isAssistantCancelText,
    parseAssistantTimeHint
} from '../../src/js/utils/assistantParserUtils.js';

describe('assistantParserUtils', () => {
    it('normaliza texto con tildes', () => {
        expect(normalizeLooseText('Mañana reunión')).toBe('manana reunion');
    });

    it('limpia prefijos de comando', () => {
        expect(stripLeadingCommandWords('crear evento reunión con pablo')).toBe('reunión con pablo');
    });

    it('detecta confirmación/cancelación', () => {
        expect(isAssistantConfirmText('sí')).toBe(true);
        expect(isAssistantCancelText('no')).toBe(true);
    });

    it('parsea hora básica', () => {
        expect(parseAssistantTimeHint('mañana a las 3')).toBe('03:00');
        expect(parseAssistantTimeHint('at 15:30')).toBe('15:30');
    });
});