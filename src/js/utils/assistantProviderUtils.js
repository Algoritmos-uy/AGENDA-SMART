export function normalizeTtsGender(value = '') {
    const raw = String(value || '').toLowerCase().trim();
    if (['f', 'female', 'feminine', 'femenina', 'mujer'].includes(raw)) return 'feminine';
    if (['m', 'male', 'masculine', 'masculina', 'hombre'].includes(raw)) return 'masculine';
    return '';
}

export function getGenderPromptSuffix(locale = 'es', gender = 'feminine') {
    const g = normalizeTtsGender(gender) || 'feminine';
    if (locale === 'en') {
        return g === 'masculine'
            ? ' Self-reference in masculine form when applicable.'
            : ' Self-reference in feminine form when applicable.';
    }
    if (locale === 'pt') {
        return g === 'masculine'
            ? ' Auto-referencie-se no masculino quando aplicável (ex.: "estou pronto").'
            : ' Auto-referencie-se no feminino quando aplicável (ex.: "estou pronta").';
    }
    return g === 'masculine'
        ? ' Autorreferénciate en masculino cuando aplique (ej.: "estoy listo").'
        : ' Autorreferénciate en femenino cuando aplique (ej.: "estoy lista").';
}

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
    if (['openai', 'gpt-4o-mini-tts', 'gpt4o-mini-tts'].includes(raw)) return 'openai';
    if (['google', 'google-speech', 'google speech'].includes(raw)) return 'google';
    if (['gemini', 'gemini-tts', 'gemini-3.1-flash-tts-preview', 'gemini flash tts'].includes(raw)) return 'gemini';
    return '';
}

export function getApiKeyByProvider(cfg = {}, provider = '') {
    const p = String(provider || '').trim();
    if (p === 'openai') return String(cfg.openaiApiKey || '').trim();
    if (p === 'google') return String(cfg.googleApiKey || '').trim();
    if (p === 'gemini') return String(cfg.geminiApiKey || '').trim();
    return String(cfg.androidTtsApiKey || '').trim();
}