export function normalizeSttProviderValue(value = '') {
    const raw = String(value || '').toLowerCase().trim();
    if (['browser', 'local', 'local-browser'].includes(raw)) return 'browser';
    if (['elevenlabs', '11labs', 'eleven'].includes(raw)) return 'elevenlabs';
    if (['openai', 'gpt-4o-mini-transcribe', 'gpt4o-mini-transcribe', 'gpt-4o'].includes(raw)) return 'openai';
    if (['google', 'google-speech', 'google speech'].includes(raw)) return 'google';
    return '';
}

export function normalizeTtsProviderValue(value = '') {
    const raw = String(value || '').toLowerCase().trim();
    if (['auto'].includes(raw)) return 'auto';
    if (['elevenlabs', '11labs', 'eleven'].includes(raw)) return 'elevenlabs';
    if (['fish', 'fishaudio', 'fish-audio', 'fishspeech', 'fish-speech'].includes(raw)) return 'fish';
    if (['openai', 'gpt-4o-mini-tts', 'gpt4o-mini-tts'].includes(raw)) return 'openai';
    if (['google', 'google-speech', 'google speech'].includes(raw)) return 'google';
    return '';
}

export function getTtsProviderListLabel(providers = {}) {
    return Object.keys(providers || {}).filter(Boolean).join(', ');
}

export function extractProviderFromFreeText(text = '') {
    const normalized = String(text || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const tokens = normalized.split(' ').filter(Boolean);
    for (const token of tokens) {
        const provider = normalizeTtsProviderValue(token);
        if (provider) return provider;
    }
    return normalizeTtsProviderValue(text);
}

export function extractTtsApiKeyInput(text = '', preferredProvider = '') {
    const raw = String(text || '').trim();
    if (!raw) return { provider: '', key: '' };

    const cmdMatch = raw.match(/^\/(?:ttskey|elevenlabs_key)\s+(?:(elevenlabs|fish|openai|google|11labs)\s+)?(.+)$/i);
    if (cmdMatch) {
        return {
            provider: normalizeTtsProviderValue(cmdMatch[1] || preferredProvider),
            key: String(cmdMatch[2] || '').trim(),
        };
    }

    const sentenceMatch = raw.match(/(?:api\s*key|apikey|clave|token)(?:\s+es|\s*[:=])?\s*([A-Za-z0-9._-]{8,})/i);
    if (sentenceMatch) {
        return {
            provider: normalizeTtsProviderValue(preferredProvider),
            key: String(sentenceMatch[1] || '').trim(),
        };
    }

    const plain = raw.replace(/^['"]|['"]$/g, '').trim();
    if (plain.length >= 8 && !/\s/.test(plain)) {
        return {
            provider: normalizeTtsProviderValue(preferredProvider),
            key: plain,
        };
    }

    return { provider: normalizeTtsProviderValue(preferredProvider), key: '' };
}