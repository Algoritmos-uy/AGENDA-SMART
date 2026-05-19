import { describe, expect, it } from 'vitest';
import {
    isAssistantCreateIntent,
    parseAssistantCreateFromText,
    parseAssistantDeleteFromText,
    parseAttendanceFromText
} from '../../src/js/utils/assistantIntentParsers.js';

describe('assistantIntentParsers', () => {
    it('detecta intención create', () => {
        expect(isAssistantCreateIntent('crear evento mañana a las 10')).toBe(true);
    });

    it('parsea create básico', () => {
        const out = parseAssistantCreateFromText('crear reunión 2026-05-20 a las 10');
        expect(out?.action).toBe('create_event');
        expect(out?.date).toBe('2026-05-20');
        expect(out?.start).toBe('10:00');
    });

    it('parsea delete básico', () => {
        const out = parseAssistantDeleteFromText('eliminar evento reunión para 2026-05-20');
        expect(out?.action).toBe('delete_event');
    });

    it('parsea asistencia', () => {
        expect(parseAttendanceFromText('confirmar asistencia')).toBe('confirmed');
    });
});