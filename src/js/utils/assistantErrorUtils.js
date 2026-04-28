export function sanitizeAssistantErrorMessage(message = '', { fallbackMessage = '' } = {}) {
    const raw = String(message || '').trim();
    if (!raw) return String(fallbackMessage || '').trim();

    return raw
        // evita exponer tokens completos (ej: sk-xxxx...)
        .replace(/\b(?:sk|dsk|api)[-_][A-Za-z0-9_-]{10,}\b/gi, '[API_KEY]')
        // evita exponer sufijos mostrados por algunos proveedores
        .replace(/(ending\s+(?:in|with)\s+)[A-Za-z0-9_-]{2,}/gi, '$1****');
}

export function isInvalidApiKeyError(message = '') {
    const raw = String(message || '');
    return /(invalid[\s_-]*api[\s_-]*key|api[\s_-]*key[\s_-]*invalid|unauthorized|\b401\b|invalid_auth|authentication)/i.test(raw);
}