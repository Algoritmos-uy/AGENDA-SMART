export function createVoiceRecognizer({
    windowRef = globalThis.window,
    locale = 'es',
    getVoiceLang = () => 'es-ES',
    handlers = {}
} = {}) {
    const SpeechRecognitionCtor = windowRef?.SpeechRecognition || windowRef?.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return null;

    const rec = new SpeechRecognitionCtor();
    rec.lang = getVoiceLang(locale);
    rec.interimResults = false;
    rec.continuous = true;
    rec.maxAlternatives = 1;

    if (typeof handlers.onstart === 'function') rec.onstart = handlers.onstart;
    if (typeof handlers.onend === 'function') rec.onend = handlers.onend;
    if (typeof handlers.onerror === 'function') rec.onerror = handlers.onerror;
    if (typeof handlers.onresult === 'function') rec.onresult = handlers.onresult;

    return rec;
}