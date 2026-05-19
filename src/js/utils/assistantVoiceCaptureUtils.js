import { cleanVoiceTranscript } from './voiceUtils.js';

export function resetVoiceCaptureFlags() {
    return {
        buffer: '',
        submitting: false,
    };
}

export function appendVoiceTranscriptBuffer(currentBuffer = '', segment = '') {
    const clean = cleanVoiceTranscript(segment || '');
    if (!clean) return cleanVoiceTranscript(currentBuffer || '');

    const current = cleanVoiceTranscript(currentBuffer || '');
    if (!current) return clean;

    if (current === clean || current.endsWith(clean)) {
        return current;
    }

    return `${current} ${clean}`.replace(/\s+/g, ' ').trim();
}

export function getFinalVoiceTranscript(buffer = '') {
    return cleanVoiceTranscript(buffer || '');
}