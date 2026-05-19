import { normalizeLooseText } from './assistantParserUtils.js';

export function getAvailableTtsProvidersForHelp(providersMap = {}) {
    return Object.keys(providersMap || {}).filter(Boolean).join(', ');
}

export function detectAssistantManualTopic(text = '') {
    const t = normalizeLooseText(text);
    if (!t) return null;

    const asksProvider = (
        /(proveedor|provider|provedor|motor)/.test(t)
        && /(\btts\b|voz|voice|elevenlabs|openai|google|fish)/.test(t)
    ) || /(ttsprovider|\/ttsprovider)/.test(t);

    const asksApiKey = /(api key|apikey|key|clave|token)/.test(t)
        && /(tts|voz|voice|stt|proveedor|provider|deepseek|openai|google|elevenlabs|fish)/.test(t);

    const asksVoice = (
        /(voz|voice|ttsvoice|ttsfemale|ttsmale)/.test(t)
        && /(cambiar|change|trocar|set|usar|use|comando|manual|como|how)/.test(t)
    ) || /(\/ttsvoice|\/ttsfemale|\/ttsmale)/.test(t);

    const asksManualEvents = /(manual|formulario|editar|agregar|anadir|añadir|crear|evento|event)/.test(t)
        && /(manualmente|manual|formulario|pantalla|lista|calendario|edit|add|create)/.test(t);

    const asksGeneralHelp = /(ayuda|help|manual|comandos|como usar|que puedo preguntar|consulta)/.test(t);

    if (asksProvider || asksApiKey) return 'tts-provider';
    if (asksVoice) return 'tts-voice';
    if (asksManualEvents) return 'events-manual';
    if (asksGeneralHelp) return 'general-manual';
    return null;
}

export function buildAssistantManualReply(topic = '', locale = 'es', providers = '') {
    const lang = String(locale || 'es').slice(0, 2);

    const dict = {
        es: {
            'tts-provider': `Puedes cambiar el proveedor TTS desde este chat. Proveedores disponibles: ${providers}. Comandos: /ttsprovider <proveedor> y /ttskey <proveedor> <api_key>.`,
            'tts-voice': 'Para cambiar la voz TTS usa /ttsvoice <voice_id>. Atajos: /ttsfemale y /ttsmale.',
            'events-manual': 'Para agregar eventos manualmente: completa título, fecha, inicio y fin; luego guarda. Para editar, abre un evento y actualiza.',
            'general-manual': `Puedo ayudarte con comandos de TTS y gestión de eventos. Ejemplos: /ttsprovider, /ttskey, /ttsvoice, /ttsfemale, /ttsmale.`
        },
        en: {
            'tts-provider': `You can change TTS provider from chat. Available providers: ${providers}. Commands: /ttsprovider <provider> and /ttskey <provider> <api_key>.`,
            'tts-voice': 'Use /ttsvoice <voice_id> to change TTS voice. Shortcuts: /ttsfemale and /ttsmale.',
            'events-manual': 'To add events manually: fill title, date, start and end; then save. To edit, open an event and update it.',
            'general-manual': 'I can help with TTS commands and event management. Examples: /ttsprovider, /ttskey, /ttsvoice, /ttsfemale, /ttsmale.'
        },
        pt: {
            'tts-provider': `Você pode trocar o provedor TTS pelo chat. Provedores disponíveis: ${providers}. Comandos: /ttsprovider <provedor> e /ttskey <provedor> <api_key>.`,
            'tts-voice': 'Use /ttsvoice <voice_id> para trocar voz TTS. Atalhos: /ttsfemale e /ttsmale.',
            'events-manual': 'Para adicionar eventos manualmente: preencha título, data, início e fim; depois salve. Para editar, abra um evento e atualize.',
            'general-manual': 'Posso ajudar com comandos de TTS e gestão de eventos. Exemplos: /ttsprovider, /ttskey, /ttsvoice, /ttsfemale, /ttsmale.'
        }
    };

    return dict[lang]?.[topic] || dict.es[topic] || '';
}

export function getAssistantManualHelp(text = '', locale = 'es', providers = '') {
    const topic = detectAssistantManualTopic(text);
    if (!topic) return '';
    return buildAssistantManualReply(topic, locale, providers);
}

export function ttsSetupText(key, locale = 'es', vars = {}) {
    const lang = String(locale || 'es').slice(0, 2);
    const dict = {
        es: {
            askProvider: 'Perfecto, te ayudo a cambiar el proveedor TTS. Proveedores disponibles: {{providers}}. ¿Cuál quieres usar?',
            askApiKey: 'Genial, usaré {{provider}}. Ahora indícame la API key de ese proveedor.',
            invalidProvider: 'No reconocí ese proveedor. Opciones válidas: {{providers}}.',
            apiKeySaved: 'Listo ✅ Guardé la API key de {{provider}} y quedó como proveedor TTS activo.',
            apiKeyMissing: 'No detecté una API key válida. Usa: /ttskey {{provider}} TU_API_KEY',
            setupCancelled: 'Configuración TTS cancelada.',
        }
    };
    const source = dict[lang] || dict.es;
    const template = source[key] || key;
    return Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{{${k}}}`, String(v ?? '')), template);
}

export function assistantShortText(key, locale = 'es', vars = {}) {
    const lang = String(locale || 'es').slice(0, 2);
    const dict = {
        es: {
            eventNotFound: 'No encontré un evento que coincida con tu solicitud.',
            actionCancelled: 'Acción cancelada.',
            pendingNeedDecision: 'Hay una acción pendiente. Responde "sí" para confirmar o "no" para cancelar.',
        },
        en: {
            eventNotFound: 'I could not find a matching event.',
            actionCancelled: 'Action cancelled.',
            pendingNeedDecision: 'There is a pending action. Reply "yes" to confirm or "no" to cancel.',
        },
        pt: {
            eventNotFound: 'Não encontrei um evento correspondente.',
            actionCancelled: 'Ação cancelada.',
            pendingNeedDecision: 'Há uma ação pendente. Responda "sim" para confirmar ou "não" para cancelar.',
        }
    };
    const source = dict[lang] || dict.es;
    const template = source[key] || key;
    return Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{{${k}}}`, String(v ?? '')), template);
}