export const ANDROID_MANUAL_KEY_FLAG = 'coordinalia-allow-manual-android-key';

export function isAndroidRuntime() {
    const ua = String(globalThis?.navigator?.userAgent || '');
    const platform = String(globalThis?.window?.Capacitor?.getPlatform?.() || '').toLowerCase();
    return platform === 'android' || /android/i.test(ua);
}

export function canPromptAndroidManualApiKey() {
    try {
        return globalThis?.localStorage?.getItem(ANDROID_MANUAL_KEY_FLAG) === '1';
    } catch (_e) {
        return false;
    }
}

export function sanitizeAssistantErrorMessage(message = '') {
    const raw = String(message || '').trim();
    if (!raw) return 'Error de conexión con el asistente.';
    return raw
        .replace(/\b(?:sk|dsk|api)[-_][A-Za-z0-9_-]{10,}\b/gi, '[API_KEY]')
        .replace(/(ending\s+(?:in|with)\s+)[A-Za-z0-9_-]{2,}/gi, '$1****');
}

export function isInvalidApiKeyError(message = '') {
    const raw = String(message || '');
    return /(invalid[\s_-]*api[\s_-]*key|api[\s_-]*key[\s_-]*invalid|unauthorized|\b401\b|invalid_auth|authentication)/i.test(raw);
}