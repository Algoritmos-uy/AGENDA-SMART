import { Notifier } from './notifications.js';
import {
    addDays,
    addMonths,
    buildSlots,
    formatISODate,
    formatReadableDate,
    generateId,
    isInSlot,
    normalizeLocale,
    sameDate,
    sortEvents,
    startOfWeek
} from './utils/agendaDateUtils.js';
import {
    detectAssistantRange,
    findEventConflicts,
    extractAssistantAction,
    inferEndFromStart,
    getEventAttendanceById,
    normalizeAttendanceStatus,
    normalizeEventRecord as normalizeStoredEventRecord,
    suggestRescheduleSlots,
    toEventPayload,
    validateEventPayload
} from './utils/assistantEventUtils.js';
import {
    cleanVoiceTranscript,
    getVoiceLang,
    hasVoiceRecognitionSupport,
    mapVoiceErrorCode
} from './utils/voiceUtils.js';
import { toPlainAssistantText } from './utils/assistantTextUtils.js';
import { applyDocumentI18n, getIntlLocale, t } from './utils/i18n.js';

// Módulo IIFE: aísla la lógica de la agenda en un ámbito propio.
(() => {
    const notifier = new Notifier();

    // Persistencia: preferir store nativo (IPC) y hacer fallback a localStorage.
    const STORAGE_KEY = 'agenda-online-events';
    const hasNativeStore = typeof window !== 'undefined' && !!window.appBridge?.getEvents;
    let eventsCache = [];

    // Referencias de UI y campos del formulario.
    const form = document.getElementById('event-form');
    const statusEl = document.getElementById('form-status');
    const submitBtn = document.getElementById('submit-btn');
    const resetBtn = document.getElementById('reset-btn');
    const baseDateInput = document.getElementById('base-date');
    const weeklyPrevBtn = document.getElementById('weekly-prev');
    const weeklyNextBtn = document.getElementById('weekly-next');
    const monthlyPrevBtn = document.getElementById('monthly-prev');
    const monthlyNextBtn = document.getElementById('monthly-next');

    const titleInput = document.getElementById('title');
    const dateInput = document.getElementById('date');
    const startInput = document.getElementById('start');
    const endInput = document.getElementById('end');
    const descInput = document.getElementById('description');
    const colorInput = document.getElementById('color');
    const eventIdInput = document.getElementById('event-id');
    const reminderOptionInputs = Array.from(document.querySelectorAll('input[name="reminder-opt"]'));
    const reminderCustomRadio = document.getElementById('reminder-custom-radio');
    const reminderCustomInput = document.getElementById('reminder-custom');
    const reminderCustomWrapper = document.getElementById('reminder-custom-wrapper');

    const DEFAULT_REMINDER_OFFSETS_S = [900, 1800];
    const EVENT_RETENTION_PAST_DAYS = 30;

    const viewButtons = Array.from(document.querySelectorAll('[data-target]'));
    const views = document.querySelectorAll('.agenda-view');

    const versionEl = document.getElementById('app-version');

    const dailySlotsEl = document.getElementById('daily-slots');
    const weeklyGridEl = document.getElementById('weekly-grid');
    const monthlyGridEl = document.getElementById('monthly-grid');
    const eventListEl = document.getElementById('event-list');

    const dailyCaption = document.getElementById('daily-caption');
    const weeklyCaption = document.getElementById('weekly-caption');
    const monthlyCaption = document.getElementById('monthly-caption');

    const clockEl = document.getElementById('live-clock');
    const assistantOpenBtn = document.getElementById('assistant-open');
    const assistantModal = document.getElementById('assistant-modal');
    const assistantCloseBtn = document.getElementById('assistant-close');
    const assistantCloseFooterBtn = document.getElementById('assistant-close-footer');
    const assistantThread = document.getElementById('assistant-thread');
    const assistantForm = document.getElementById('assistant-form');
    const assistantInput = document.getElementById('assistant-input');
    const assistantStatus = document.getElementById('assistant-status');
    const assistantSendBtn = document.getElementById('assistant-send');
    const assistantVoiceBtn = document.getElementById('assistant-voice');
    const assistantTtsToggle = document.getElementById('assistant-tts-toggle');
    const assistantClearBtn = document.getElementById('assistant-clear');

    const ASSISTANT_STORE_KEY = 'coordinalia-thread';
    const ASSISTANT_WELCOME_VERSION_KEY = 'coordinalia-welcome-version';
    const ASSISTANT_WELCOME_VERSION = '1.3.6-manual-help';
    const ASSISTANT_TEXT = {
        es: {
            prompt: 'Eres CoordinalIA, asistente de Agenda Inteligente. Tono: profesional y cercano, empático y claro. Responde breve, en español, y ayuda a gestionar eventos (crear, listar, reprogramar) con pasos concretos. La app NO tiene sección de configuración; no inventes rutas ni pantallas inexistentes. Cuando el usuario pregunte por cambios de proveedor TTS, voz o API key, explica comandos de consola del chat (por ejemplo /ttsprovider, /ttskey, /ttsvoice, /ttsfemale, /ttsmale) y proveedores disponibles (auto, elevenlabs, fish, openai, google). Si falta la API key, indícalo de forma amable. Para acciones operativas (crear, actualizar, reprogramar, eliminar o cambiar asistencia), responde con un único bloque JSON plano y sin texto adicional. Si el usuario pide crear/agendar un evento y tienes título, fecha (YYYY-MM-DD) e inicio (HH:mm), responde con la forma {"action":"create_event","title":"...","date":"YYYY-MM-DD","start":"HH:mm","end":"HH:mm","duration_minutes":90,"description":"...","color":"#2563eb"}. Para eliminar usa {"action":"delete_event",...}. Para asistencia usa {"action":"set_attendance","attendance":"confirmed|tentative|declined|pending",...}. end es opcional; si no está, se calcula con duration_minutes (si viene) o por defecto +60 min desde start. Si el usuario dice “duración 90 minutos”, usa duration_minutes: 90. Si falta algún dato, pídele al usuario solo ese dato faltante.',
            welcome: 'Hola, soy CoordinalIA. Puedo ayudarte a crear, consultar o reprogramar eventos, y también a usar comandos del chat (por ejemplo cambiar proveedor/voz TTS o API key). Puedes preguntarme “¿cómo cambio el proveedor TTS?”, “¿qué proveedores hay?” o “¿cómo agrego/edito eventos manualmente?”.',
            noEvents: {
                today: 'No hay eventos para hoy.',
                week: 'No hay eventos esta semana.',
                month: 'No hay eventos este mes.'
            },
            headers: {
                today: 'Eventos de hoy:',
                week: 'Eventos de la semana:',
                month: 'Eventos del mes:'
            }
        },
        en: {
            prompt: 'You are CoordinalIA, assistant of Smart Agenda. Tone: professional yet friendly and clear. Reply briefly in English and help manage events (create, list, reschedule) with concrete steps. The app has NO settings section; never invent screens or paths. If users ask about TTS provider, voice, or API keys, explain chat-console commands (for example /ttsprovider, /ttskey, /ttsvoice, /ttsfemale, /ttsmale) and available providers (auto, elevenlabs, fish, openai, google). If the API key is missing, mention it politely. For operational actions (create, update, reschedule, delete, or attendance changes), answer with a single plain JSON block and no extra text. If the user asks to create/schedule an event and you have title, date (YYYY-MM-DD), and start (HH:mm), answer with: {"action":"create_event","title":"...","date":"YYYY-MM-DD","start":"HH:mm","end":"HH:mm","duration_minutes":90,"description":"...","color":"#2563eb"}. For delete use {"action":"delete_event",...}. For attendance use {"action":"set_attendance","attendance":"confirmed|tentative|declined|pending",...}. end is optional; if missing, compute it with duration_minutes (when provided) or default to start +60 min. If user says “duration 90 minutes”, set duration_minutes: 90. If a field is missing, ask only for that missing field.',
            welcome: "Hi, I'm CoordinalIA. I can help with events and with chat commands (like changing TTS provider/voice or API key). You can ask: 'how do I change TTS provider?', 'which providers are available?', or 'how do I add/edit events manually?'.",
            noEvents: {
                today: 'No events for today.',
                week: 'No events this week.',
                month: 'No events this month.'
            },
            headers: {
                today: "Today's events:",
                week: 'This week\'s events:',
                month: 'This month\'s events:'
            }
        },
        pt: {
            prompt: 'Você é a CoordinalIA, assistente da Agenda Inteligente. Tom: profissional e próximo, claro e empático. Responda de forma breve, em português, ajudando a gerir eventos (criar, listar, reagendar) com passos concretos. O app NÃO tem seção de configurações; não invente telas ou caminhos inexistentes. Se o usuário perguntar sobre provedor TTS, voz ou API key, explique os comandos no chat (por exemplo /ttsprovider, /ttskey, /ttsvoice, /ttsfemale, /ttsmale) e os provedores disponíveis (auto, elevenlabs, fish, openai, google). Se faltar API key, avise gentilmente. Para ações operacionais (criar, atualizar, reagendar, excluir ou mudar presença), responda com um único JSON simples e sem texto extra. Se o usuário pedir para criar/agendar um evento e você tiver título, data (AAAA-MM-DD) e início (HH:mm), responda com: {"action":"create_event","title":"...","date":"AAAA-MM-DD","start":"HH:mm","end":"HH:mm","duration_minutes":90,"description":"...","color":"#2563eb"}. Para excluir use {"action":"delete_event",...}. Para presença use {"action":"set_attendance","attendance":"confirmed|tentative|declined|pending",...}. end é opcional; se faltar, calcule com duration_minutes (quando vier) ou padrão +60 min a partir de start. Se o usuário disser “duração 90 minutos”, use duration_minutes: 90. Se faltar algum campo, peça apenas esse campo faltante.',
            welcome: 'Olá, sou a CoordinalIA. Posso ajudar com eventos e com comandos do chat (como trocar provedor/voz TTS ou API key). Você pode perguntar: “como trocar o provedor TTS?”, “quais provedores existem?” ou “como adicionar/editar eventos manualmente?”.',
            noEvents: {
                today: 'Sem eventos para hoje.',
                week: 'Sem eventos nesta semana.',
                month: 'Sem eventos neste mês.'
            },
            headers: {
                today: 'Eventos de hoje:',
                week: 'Eventos da semana:',
                month: 'Eventos do mês:'
            }
        }
    };

    const ASSISTANT_CONFIG_KEY = 'coordinalia-config';
    const ASSISTANT_ANDROID_APIKEY_KEY = 'coordinalia-android-api-key';
    const ASSISTANT_ANDROID_APIURL_KEY = 'coordinalia-android-api-url';
    const ASSISTANT_ANDROID_MODEL_KEY = 'coordinalia-android-model';
    const ASSISTANT_ANDROID_DEFAULT_API_URL = 'https://api.deepseek.com/v1/chat/completions';
    const ASSISTANT_ANDROID_DEFAULT_MODEL = 'deepseek-chat';
    const ASSISTANT_STT_PROVIDER_KEY = 'coordinalia-stt-provider';
    const ASSISTANT_STT_MODEL_KEY = 'coordinalia-stt-model';
    const ASSISTANT_STT_APIURL_KEY = 'coordinalia-stt-api-url';
    const ASSISTANT_OPENAI_APIKEY_KEY = 'coordinalia-openai-api-key';
    const ASSISTANT_GOOGLE_APIKEY_KEY = 'coordinalia-google-api-key';
    const ASSISTANT_FISH_APIKEY_KEY = 'coordinalia-fish-api-key';
    const ASSISTANT_ANDROID_TTS_APIKEY_KEY = 'coordinalia-android-tts-api-key';
    const ASSISTANT_ANDROID_TTS_APIURL_KEY = 'coordinalia-android-tts-api-url';
    const ASSISTANT_ANDROID_TTS_MODEL_KEY = 'coordinalia-android-tts-model';
    const ASSISTANT_ANDROID_TTS_VOICE_KEY = 'coordinalia-android-tts-voice';
    const ASSISTANT_TTS_GENDER_KEY = 'coordinalia-tts-gender';
    const ASSISTANT_ANDROID_DEFAULT_TTS_API_URL = 'https://api.elevenlabs.io/v1';
    const ASSISTANT_ANDROID_DEFAULT_TTS_MODEL = 'eleven_v3';
    const ASSISTANT_ANDROID_DEFAULT_TTS_VOICE = 'EXAVITQu4vr4xnSDxMaL';
    const ASSISTANT_ANDROID_FEMALE_TTS_VOICE = 'EXAVITQu4vr4xnSDxMaL';
    const ASSISTANT_ANDROID_MALE_TTS_VOICE = '452WrNT9o8dphaYW5YGU';
    const ASSISTANT_FISH_DEFAULT_TTS_MODEL = 's2-pro';
    const ASSISTANT_FISH_FEMALE_TTS_VOICE = 'bfed5c7ab1944ecabf0ccfc67fe28f6f';
    const ASSISTANT_FISH_MALE_TTS_VOICE = 'dc0746a3f6f848ceaf8c4507be3fb7d9';
    const ASSISTANT_PROVIDERS = {
        deepseek: { id: 'deepseek', label: 'DeepSeek' }
    };
    const ASSISTANT_STT_PROVIDERS = {
        browser: { id: 'browser', label: 'Browser STT' },
        elevenlabs: { id: 'elevenlabs', label: 'ElevenLabs STT' },
        openai: { id: 'openai', label: 'gpt-4o-mini-transcribe' },
        google: { id: 'google', label: 'Google Speech' },
    };
    const ASSISTANT_TTS_PROVIDERS = {
        auto: { id: 'auto' },
        elevenlabs: { id: 'elevenlabs' },
        fish: { id: 'fish' },
        openai: { id: 'openai' },
        google: { id: 'google' },
    };

    const assistantMessages = [];
    let assistantUnsubscribe = null;
    let assistantPendingAction = null;
    let assistantPendingTtsSetup = null;
    let assistantLocale = 'es';
    let assistantStrings = ASSISTANT_TEXT.es;
    let assistantSystemPrompt = assistantStrings.prompt;
    let assistantProvider = 'deepseek';
    let assistantProviderBtn = null;
    let assistantRecognizer = null;
    let assistantListening = false;
    let assistantVoiceRetryCount = 0;
    let assistantVoiceRetryTimer = null;
    let assistantVoiceStopRequested = false;
    let assistantVoiceHasResult = false;
    let assistantVoiceOnEndRetryCount = 0;
    let assistantVoiceTranscriptBuffer = '';
    let assistantVoiceFinalizeTimer = null;
    let assistantVoiceSubmitting = false;
    let assistantRecorder = null;
    let assistantRecorderChunks = [];
    let assistantRecorderStream = null;
    let assistantTtsAudio = null;
    let assistantTtsEnabled = true;
    let assistantTtsProvider = 'auto';
    let assistantVoiceMode = 'recognition';
    let appInitialized = false;
    let initInFlight = false;
    let assistantModalBound = false;
    let lifecycleBound = false;
    let notificationAudioLogBound = false;
    let clockIntervalId = null;
    const ASSISTANT_VOICE_MAX_RETRIES = 2;
    const ASSISTANT_VOICE_ONEND_MAX_RETRIES = 1;
    const ASSISTANT_VOICE_SILENCE_SUBMIT_MS = 2400;

    function tr(key, vars = {}) {
        return t(assistantLocale, key, vars);
    }

    function getCurrentIntlLocale() {
        return getIntlLocale(assistantLocale);
    }

    function applyI18n() {
        applyDocumentI18n(document, assistantLocale);
        if (submitBtn) {
            submitBtn.textContent = eventIdInput?.value ? tr('form.update') : tr('form.save');
        }
        renderAssistantProviderBtn();
        renderAssistantTtsToggle();
        updateVoiceUi();
    }

    function loadAssistantConfig() {
        try {
            const raw = localStorage.getItem(ASSISTANT_CONFIG_KEY);
            const parsed = raw ? JSON.parse(raw) : {};
            const provider = ASSISTANT_PROVIDERS[parsed.provider]?.id || 'deepseek';
            const ttsEnabled = parsed.ttsEnabled !== false;
            const ttsProvider = ASSISTANT_TTS_PROVIDERS[parsed.ttsProvider]?.id || 'auto';
            const sttProvider = ASSISTANT_STT_PROVIDERS[parsed.sttProvider]?.id
                || ASSISTANT_STT_PROVIDERS[String(localStorage.getItem(ASSISTANT_STT_PROVIDER_KEY) || '').trim()]?.id
                || 'browser';
            const sttModel = String(parsed.sttModel || localStorage.getItem(ASSISTANT_STT_MODEL_KEY) || '').trim();
            const sttApiUrl = String(parsed.sttApiUrl || localStorage.getItem(ASSISTANT_STT_APIURL_KEY) || '').trim();
            const openaiApiKey = String(parsed.openaiApiKey || localStorage.getItem(ASSISTANT_OPENAI_APIKEY_KEY) || '').trim();
            const googleApiKey = String(parsed.googleApiKey || localStorage.getItem(ASSISTANT_GOOGLE_APIKEY_KEY) || '').trim();
            const fishApiKey = String(parsed.fishApiKey || localStorage.getItem(ASSISTANT_FISH_APIKEY_KEY) || '').trim();
            const androidApiKey = String(parsed.androidApiKey || localStorage.getItem(ASSISTANT_ANDROID_APIKEY_KEY) || '').trim();
            const androidApiUrl = String(parsed.androidApiUrl || localStorage.getItem(ASSISTANT_ANDROID_APIURL_KEY) || ASSISTANT_ANDROID_DEFAULT_API_URL).trim();
            const androidModel = String(parsed.androidModel || localStorage.getItem(ASSISTANT_ANDROID_MODEL_KEY) || ASSISTANT_ANDROID_DEFAULT_MODEL).trim();
            const androidTtsApiKey = String(parsed.androidTtsApiKey || localStorage.getItem(ASSISTANT_ANDROID_TTS_APIKEY_KEY) || '').trim();
            const androidTtsApiUrl = String(parsed.androidTtsApiUrl || localStorage.getItem(ASSISTANT_ANDROID_TTS_APIURL_KEY) || ASSISTANT_ANDROID_DEFAULT_TTS_API_URL).trim();
            const androidTtsModel = String(parsed.androidTtsModel || localStorage.getItem(ASSISTANT_ANDROID_TTS_MODEL_KEY) || ASSISTANT_ANDROID_DEFAULT_TTS_MODEL).trim();
            const androidTtsVoice = String(parsed.androidTtsVoice || localStorage.getItem(ASSISTANT_ANDROID_TTS_VOICE_KEY) || ASSISTANT_ANDROID_DEFAULT_TTS_VOICE).trim();
            const ttsGender = String(parsed.ttsGender || localStorage.getItem(ASSISTANT_TTS_GENDER_KEY) || '').trim();
            return {
                provider,
                ttsEnabled,
                ttsProvider,
                sttProvider,
                sttModel,
                sttApiUrl,
                openaiApiKey,
                googleApiKey,
                fishApiKey,
                androidApiKey,
                androidApiUrl,
                androidModel,
                androidTtsApiKey,
                androidTtsApiUrl,
                androidTtsModel,
                androidTtsVoice,
                ttsGender,
            };
        } catch (_e) {
            return {
                provider: 'deepseek',
                ttsEnabled: true,
                ttsProvider: 'auto',
                sttProvider: String(localStorage.getItem(ASSISTANT_STT_PROVIDER_KEY) || 'browser').trim() || 'browser',
                sttModel: String(localStorage.getItem(ASSISTANT_STT_MODEL_KEY) || '').trim(),
                sttApiUrl: String(localStorage.getItem(ASSISTANT_STT_APIURL_KEY) || '').trim(),
                openaiApiKey: String(localStorage.getItem(ASSISTANT_OPENAI_APIKEY_KEY) || '').trim(),
                googleApiKey: String(localStorage.getItem(ASSISTANT_GOOGLE_APIKEY_KEY) || '').trim(),
                fishApiKey: String(localStorage.getItem(ASSISTANT_FISH_APIKEY_KEY) || '').trim(),
                androidApiKey: String(localStorage.getItem(ASSISTANT_ANDROID_APIKEY_KEY) || '').trim(),
                androidApiUrl: String(localStorage.getItem(ASSISTANT_ANDROID_APIURL_KEY) || ASSISTANT_ANDROID_DEFAULT_API_URL).trim(),
                androidModel: String(localStorage.getItem(ASSISTANT_ANDROID_MODEL_KEY) || ASSISTANT_ANDROID_DEFAULT_MODEL).trim(),
                androidTtsApiKey: String(localStorage.getItem(ASSISTANT_ANDROID_TTS_APIKEY_KEY) || '').trim(),
                androidTtsApiUrl: String(localStorage.getItem(ASSISTANT_ANDROID_TTS_APIURL_KEY) || ASSISTANT_ANDROID_DEFAULT_TTS_API_URL).trim(),
                androidTtsModel: String(localStorage.getItem(ASSISTANT_ANDROID_TTS_MODEL_KEY) || ASSISTANT_ANDROID_DEFAULT_TTS_MODEL).trim(),
                androidTtsVoice: String(localStorage.getItem(ASSISTANT_ANDROID_TTS_VOICE_KEY) || ASSISTANT_ANDROID_DEFAULT_TTS_VOICE).trim(),
                ttsGender: String(localStorage.getItem(ASSISTANT_TTS_GENDER_KEY) || '').trim(),
            };
        }
    }

    function saveAssistantConfig(config) {
        try {
            localStorage.setItem(ASSISTANT_CONFIG_KEY, JSON.stringify(config));
            if (typeof config?.androidApiKey === 'string') {
                localStorage.setItem(ASSISTANT_ANDROID_APIKEY_KEY, config.androidApiKey);
            }
            if (typeof config?.sttProvider === 'string') {
                localStorage.setItem(ASSISTANT_STT_PROVIDER_KEY, config.sttProvider);
            }
            if (typeof config?.sttModel === 'string') {
                localStorage.setItem(ASSISTANT_STT_MODEL_KEY, config.sttModel);
            }
            if (typeof config?.sttApiUrl === 'string') {
                localStorage.setItem(ASSISTANT_STT_APIURL_KEY, config.sttApiUrl);
            }
            if (typeof config?.openaiApiKey === 'string') {
                localStorage.setItem(ASSISTANT_OPENAI_APIKEY_KEY, config.openaiApiKey);
            }
            if (typeof config?.googleApiKey === 'string') {
                localStorage.setItem(ASSISTANT_GOOGLE_APIKEY_KEY, config.googleApiKey);
            }
            if (typeof config?.fishApiKey === 'string') {
                localStorage.setItem(ASSISTANT_FISH_APIKEY_KEY, config.fishApiKey);
            }
            if (typeof config?.androidApiUrl === 'string') {
                localStorage.setItem(ASSISTANT_ANDROID_APIURL_KEY, config.androidApiUrl);
            }
            if (typeof config?.androidModel === 'string') {
                localStorage.setItem(ASSISTANT_ANDROID_MODEL_KEY, config.androidModel);
            }
            if (typeof config?.androidTtsApiKey === 'string') {
                localStorage.setItem(ASSISTANT_ANDROID_TTS_APIKEY_KEY, config.androidTtsApiKey);
            }
            if (typeof config?.androidTtsApiUrl === 'string') {
                localStorage.setItem(ASSISTANT_ANDROID_TTS_APIURL_KEY, config.androidTtsApiUrl);
            }
            if (typeof config?.androidTtsModel === 'string') {
                localStorage.setItem(ASSISTANT_ANDROID_TTS_MODEL_KEY, config.androidTtsModel);
            }
            if (typeof config?.androidTtsVoice === 'string') {
                localStorage.setItem(ASSISTANT_ANDROID_TTS_VOICE_KEY, config.androidTtsVoice);
            }
            if (typeof config?.ttsGender === 'string') {
                localStorage.setItem(ASSISTANT_TTS_GENDER_KEY, config.ttsGender);
            }
        } catch (e) {
            console.warn('No se pudo guardar la configuración del asistente', e);
        }
    }

    function getAssistantConfig() {
        const cfg = loadAssistantConfig();
        assistantProvider = cfg.provider;
        assistantTtsEnabled = cfg.ttsEnabled !== false;
        assistantTtsProvider = cfg.ttsProvider || 'auto';
        return cfg;
    }

    function isAndroidRuntime() {
        const ua = String(navigator?.userAgent || '');
        const platform = String(window?.Capacitor?.getPlatform?.() || '').toLowerCase();
        return platform === 'android' || /android/i.test(ua);
    }

    function saveAndroidAssistantApiKey(apiKey = '') {
        const key = String(apiKey || '').trim();
        const cfg = getAssistantConfig();
        cfg.androidApiKey = key;
        saveAssistantConfig(cfg);
        return key;
    }

    function ensureAndroidAssistantApiKey() {
        if (!isAndroidRuntime()) return null;
        const cfg = getAssistantConfig();
        let apiKey = String(cfg.androidApiKey || '').trim();
        if (apiKey) return apiKey;

        const entered = window.prompt(tr('assistant.askApiKeyPrompt'), '');
        if (entered && entered.trim()) {
            apiKey = saveAndroidAssistantApiKey(entered);
            if (apiKey) {
                setAssistantStatus(tr('assistant.apiKeySaved'));
                return apiKey;
            }
        }
        return '';
    }

    function normalizeSttProviderValue(value = '') {
        const raw = String(value || '').toLowerCase().trim();
        if (['browser', 'local', 'local-browser'].includes(raw)) return 'browser';
        if (['elevenlabs', '11labs', 'eleven'].includes(raw)) return 'elevenlabs';
        if (['openai', 'gpt-4o-mini-transcribe', 'gpt4o-mini-transcribe', 'gpt-4o'].includes(raw)) return 'openai';
        if (['google', 'google-speech', 'google speech'].includes(raw)) return 'google';
        return '';
    }

    function normalizeTtsProviderValue(value = '') {
        const raw = String(value || '').toLowerCase().trim();
        if (['auto'].includes(raw)) return 'auto';
        if (['elevenlabs', '11labs', 'eleven'].includes(raw)) return 'elevenlabs';
        if (['fish', 'fishaudio', 'fish-audio', 'fishspeech', 'fish-speech'].includes(raw)) return 'fish';
        if (['openai', 'gpt-4o-mini-tts', 'gpt4o-mini-tts'].includes(raw)) return 'openai';
        if (['google', 'google-speech', 'google speech'].includes(raw)) return 'google';
        return '';
    }

    function saveApiKeyByProvider(provider = '', apiKey = '') {
        const p = String(provider || '').trim();
        const key = String(apiKey || '').trim();
        if (p !== 'openai' && p !== 'google' && p !== 'fish') {
            return saveAndroidAssistantTtsApiKey(key);
        }

        const cfg = getAssistantConfig();
        if (p === 'openai') cfg.openaiApiKey = key;
        if (p === 'google') cfg.googleApiKey = key;
        if (p === 'fish') cfg.fishApiKey = key;
        saveAssistantConfig(cfg);
        return key;
    }

    function saveAssistantSttProvider(provider = '') {
        const normalized = normalizeSttProviderValue(provider);
        if (!normalized) return '';
        const cfg = getAssistantConfig();
        cfg.sttProvider = normalized;
        if (normalized === 'openai' && !cfg.sttModel) cfg.sttModel = 'gpt-4o-mini-transcribe';
        saveAssistantConfig(cfg);
        return normalized;
    }

    function saveAssistantTtsProvider(provider = '') {
        const normalized = normalizeTtsProviderValue(provider);
        if (!normalized) return '';
        const cfg = getAssistantConfig();
        cfg.ttsProvider = normalized;
        saveAssistantConfig(cfg);
        assistantTtsProvider = normalized;
        return normalized;
    }

    function saveAndroidAssistantTtsApiKey(apiKey = '') {
        const key = String(apiKey || '').trim();
        const cfg = getAssistantConfig();
        cfg.androidTtsApiKey = key;
        saveAssistantConfig(cfg);
        return key;
    }

    function saveAndroidAssistantTtsVoice(voiceId = '') {
        const voice = String(voiceId || '').trim();
        const cfg = getAssistantConfig();
        cfg.androidTtsVoice = voice;
        saveAssistantConfig(cfg);
        return voice;
    }

    function saveAssistantTtsGender(gender = '') {
        const normalized = String(gender || '').toLowerCase().trim();
        const value = normalized === 'male' || normalized === 'masculine'
            ? 'masculine'
            : 'feminine';
        const cfg = getAssistantConfig();
        cfg.ttsGender = value;
        saveAssistantConfig(cfg);
        try {
            localStorage.setItem(ASSISTANT_TTS_GENDER_KEY, value);
        } catch (_e) {
            // no-op
        }
        return value;
    }

    async function callAssistantAndroid(messages = [], options = {}) {
        const cfg = getAssistantConfig();
        const apiKey = String(cfg.androidApiKey || '').trim();
        if (!apiKey) {
            const err = new Error('Falta API key para Android');
            err.code = 'NO_API_KEY';
            throw err;
        }

        const apiUrl = String(options.apiUrl || cfg.androidApiUrl || ASSISTANT_ANDROID_DEFAULT_API_URL).trim();
        const model = String(options.model || cfg.androidModel || ASSISTANT_ANDROID_DEFAULT_MODEL).trim();
        const safeMessages = Array.isArray(messages)
            ? messages.filter(m => m && typeof m.content === 'string').map(m => ({ role: m.role || 'user', content: m.content }))
            : [];

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        try {
            const res = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    messages: safeMessages,
                    temperature: 0.3,
                    stream: false,
                }),
                signal: controller.signal,
            });

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                const err = new Error(`DeepSeek error ${res.status}: ${text}`);
                err.code = 'API_ERROR';
                throw err;
            }

            const data = await res.json();
            const content = String(data?.choices?.[0]?.message?.content || '').trim();
            if (!content) {
                const err = new Error('Respuesta vacía del asistente');
                err.code = 'EMPTY_RESPONSE';
                throw err;
            }
            return content;
        } finally {
            clearTimeout(timeout);
        }
    }

    function renderAssistantTtsToggle() {
        if (!assistantTtsToggle) return;
        assistantTtsToggle.checked = !!assistantTtsEnabled;
        assistantTtsToggle.title = assistantTtsEnabled
            ? tr('assistant.ttsToggleTitleOn')
            : tr('assistant.ttsToggleTitleOff');
    }

    function handleAssistantTtsToggle() {
        if (!assistantTtsToggle) return;
        assistantTtsEnabled = !!assistantTtsToggle.checked;
        const cfg = getAssistantConfig();
        cfg.ttsEnabled = assistantTtsEnabled;
        saveAssistantConfig(cfg);
        renderAssistantTtsToggle();
        setAssistantStatus(assistantTtsEnabled ? tr('assistant.ttsOn') : tr('assistant.ttsOff'));
    }

    function renderAssistantProviderBtn() {
        if (!assistantProviderBtn) return;
        assistantProviderBtn.textContent = tr('assistant.providerLabel', { provider: getAssistantProviderLabel() });
        assistantProviderBtn.title = tr('assistant.providerTitle');
    }

    async function promptAssistantProvider(force = false) {
        const current = assistantProvider || 'deepseek';
        const cfg = getAssistantConfig();
        if (!force) return { provider: current };
        const prov = 'deepseek';
        cfg.provider = 'deepseek';
        saveAssistantConfig(cfg);
        assistantProvider = 'deepseek';
        renderAssistantProviderBtn();
        return { provider: prov };
    }

    function getAssistantProviderLabel() {
        const prov = assistantProvider || 'deepseek';
        return ASSISTANT_PROVIDERS[prov]?.label || 'DeepSeek';
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        void init();
    }

    // Configuración inicial: valores por defecto, listeners y primer render.
    async function init() {
        if (initInFlight) return;
        initInFlight = true;
        try {
            if (!baseDateInput || !dateInput || !startInput || !endInput || !form) {
                console.error('Init incompleto: faltan elementos críticos del DOM.');
                return;
            }

            const today = new Date();
            if (!baseDateInput.value) baseDateInput.value = formatISODate(today);
            if (!dateInput.value) dateInput.value = formatISODate(today);
            if (!startInput.value) startInput.value = '09:00';
            if (!endInput.value) endInput.value = '10:00';
            setReminderDefault();

            await hydrateAssistantLocale();
            applyI18n();

            startClock();
            try { await notifier.init(); } catch (e) { console.warn('Notifier init failed', e); }
            notifier.setLocale?.(assistantLocale);
            try { await notifier.purgeLegacyPendingNativeNotifications?.(); } catch (e) { console.warn('Legacy pending cleanup failed', e); }

            await loadEventsFromStore();
            renderAll();
            try { notifier.rescheduleAll(getEvents()); } catch (e) { console.warn('Reschedule failed', e); }

            getAssistantConfig();
            renderAssistantProviderBtn();
            renderAssistantTtsToggle();
            loadAssistantHistory();

            if (!appInitialized) {
                form.addEventListener('submit', handleSubmit);
                resetBtn?.addEventListener('click', resetForm);
                viewButtons.forEach(btn => btn.addEventListener('click', handleViewSwitch));
                baseDateInput.addEventListener('change', renderAll);
                weeklyPrevBtn?.addEventListener('click', () => shiftBaseDateDays(-7));
                weeklyNextBtn?.addEventListener('click', () => shiftBaseDateDays(7));
                monthlyPrevBtn?.addEventListener('click', () => shiftBaseDateMonths(-1));
                monthlyNextBtn?.addEventListener('click', () => shiftBaseDateMonths(1));
                reminderOptionInputs.forEach((input) => input.addEventListener('change', handleReminderChange));
                reminderCustomRadio?.addEventListener('change', handleReminderChange);
                reminderCustomInput?.addEventListener('input', () => {
                    if (reminderCustomRadio?.checked) {
                        reminderCustomWrapper.style.display = 'flex';
                    }
                });
                bindLifecycleRecovery();
                bindNotificationAudioDebugLog();
            }

            hydrateVersion();
            setupAssistantModal();
            appInitialized = true;
        } finally {
            initInFlight = false;
        }
    }

    function bindLifecycleRecovery() {
        if (lifecycleBound) return;
        lifecycleBound = true;

        const recoverUi = () => {
            if (!baseDateInput || !dateInput) return;
            const today = formatISODate(new Date());
            if (!baseDateInput.value) baseDateInput.value = today;
            if (!dateInput.value) dateInput.value = baseDateInput.value || today;
            startClock();
            renderAll();
            setupAssistantModal();
        };

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') recoverUi();
        });
        window.addEventListener('focus', recoverUi);
        window.addEventListener('pageshow', recoverUi);
    }

    function bindNotificationAudioDebugLog() {
        if (notificationAudioLogBound) return;
        notificationAudioLogBound = true;
        if (!statusEl || !window?.addEventListener) return;

        window.addEventListener('agenda:notification-audio-selected', (event) => {
            const detail = event?.detail || {};
            const minutesBefore = Number(detail?.minutesBefore);
            const locale = String(detail?.locale || '').toUpperCase();
            const gender = String(detail?.ttsGender || '').toLowerCase() === 'masculine' ? 'M' : 'F';
            const sound = String(detail?.sound || '').trim();
            const channelId = String(detail?.channelId || '').trim();
            if (!Number.isFinite(minutesBefore) || !sound) return;

            const parts = [
                `[Audio notif] -${minutesBefore}m`,
                locale || 'ES',
                `voz ${gender}`,
                sound,
            ];
            if (channelId) parts.push(`(${channelId})`);
            setStatus(parts.join(' · '), 'muted');
        });
    }

    // Crear o actualizar eventos desde el formulario.
    function handleSubmit(event) {
        event.preventDefault();
        const payload = getFormData();
        if (!payload) return;

        const autoCompletedEnd = !!payload.autoCompletedEnd;
        delete payload.autoCompletedEnd;

        const events = getEvents();
        if (payload.id) {
            const index = events.findIndex(e => e.id === payload.id);
            if (index !== -1) {
                events[index] = payload;
            }
            const message = autoCompletedEnd
                ? `${tr('form.statusEventUpdated')} ${tr('form.statusAutoEnd', { end: payload.end })}`
                : tr('form.statusEventUpdated');
            setStatus(message, 'success');
        } else {
            payload.id = generateId();
            events.push(payload);
            const message = autoCompletedEnd
                ? `${tr('form.statusEventSaved')} ${tr('form.statusAutoEnd', { end: payload.end })}`
                : tr('form.statusEventSaved');
            setStatus(message, 'success');
        }
        saveEvents(events);
        resetForm();
        renderAll();
        try { notifier.scheduleFor(payload); } catch (e) { console.warn('Schedule failed', e); }
    }

    function shiftBaseDateDays(days) {
        const current = parseLocalDate(baseDateInput.value) || new Date();
        baseDateInput.value = formatISODate(addDays(current, days));
        renderAll();
    }

    function shiftBaseDateMonths(months) {
        const current = parseLocalDate(baseDateInput.value) || new Date();
        baseDateInput.value = formatISODate(addMonths(current, months));
        renderAll();
    }

    function setActiveView(target, { shouldRender = true } = {}) {
        viewButtons.forEach(btn => {
            const isActive = normalizeViewTarget(btn.dataset.target) === target;
            btn.classList.toggle('is-active', isActive);
            btn.setAttribute('aria-pressed', String(isActive));
        });
        views.forEach(view => {
            view.classList.toggle('is-hidden', view.dataset.view !== target);
        });
        if (shouldRender) renderAll();
    }

    function openDailyViewForDate(day) {
        if (!day || Number.isNaN(day.getTime?.())) return;
        if (baseDateInput) {
            baseDateInput.value = formatISODate(day);
        }
        setActiveView('daily', { shouldRender: true });
    }

    // Cambia entre vistas (diaria, semanal, mensual) con estado accesible.
    function handleViewSwitch(evt) {
        const target = normalizeViewTarget(evt.currentTarget.dataset.target);
        setActiveView(target, { shouldRender: true }); // re-render al cambiar vista
    }

    // Limpia el formulario y regresa a modo "nuevo evento".
    function resetForm() {
        form.reset();
        eventIdInput.value = '';
        submitBtn.textContent = tr('form.save');
        setStatus('');
        setReminderDefault();
    }

    // Lee y valida campos del formulario; devuelve un objeto de evento o null.
    function getFormData() {
        const title = titleInput.value.trim();
        const date = dateInput.value;
        const start = startInput.value;
        let end = endInput.value.trim();
        const description = descInput.value.trim();
        const color = colorInput.value || '#2563eb';
        const id = eventIdInput.value || null;
        const reminderOffsets = getReminderOffsetsFromForm();
        if (reminderOffsets === null) return null;

        let autoCompletedEnd = false;
        if (!end && start) {
            const inferredEnd = inferEndFromStart(start, 60);
            if (inferredEnd) {
                end = inferredEnd;
                autoCompletedEnd = true;
                if (endInput) endInput.value = inferredEnd;
            }
        }

        if (!title || !date || !start) {
            setStatus(tr('form.statusRequired'), 'danger');
            return null;
        }

        if (!end || end <= start) {
            setStatus(tr('form.statusEndAfterStart'), 'danger');
            return null;
        }

        return {
            id,
            title,
            date,
            start,
            end,
            description,
            color,
            reminder_offsets: reminderOffsets,
            reminder_offset: reminderOffsets[0],
            attendance: getExistingEventAttendance(id),
            autoCompletedEnd
        };
    }

    // Muestra mensajes de estado contextuales.
    function setStatus(message, type = 'muted') {
        statusEl.textContent = message;
        statusEl.className = `status ${type ? `text-${type}` : ''}`.trim();
    }


    // Persistencia de eventos (cache + store nativo o localStorage como fallback).
    function getEvents() {
        return eventsCache;
    }

    function normalizeEventRecord(ev = {}) {
        return normalizeStoredEventRecord(ev);
    }

    function getExistingEventAttendance(id = '') {
        return getEventAttendanceById(getEvents(), id, 'pending');
    }

    function getEventEndTimestampMs(ev = {}) {
        const date = String(ev?.date || '').trim();
        const end = String(ev?.end || ev?.start || '').trim();
        if (!date || !end) return Number.NaN;
        const ts = new Date(`${date}T${end}`).getTime();
        return Number.isFinite(ts) ? ts : Number.NaN;
    }

    function pruneExpiredEvents(list = []) {
        if (!Array.isArray(list) || list.length === 0) {
            return { events: [], removedCount: 0 };
        }

        const cutoffMs = Date.now() - (EVENT_RETENTION_PAST_DAYS * 24 * 60 * 60 * 1000);
        const kept = [];
        let removedCount = 0;

        list.forEach((ev) => {
            const endTs = getEventEndTimestampMs(ev);
            if (Number.isFinite(endTs) && endTs < cutoffMs) {
                removedCount += 1;
                return;
            }
            kept.push(ev);
        });

        return { events: kept, removedCount };
    }

    async function applyEventSanitizationAndPersist(source = 'local') {
        const normalized = eventsCache.map(normalizeEventRecord);
        const { events: sanitized, removedCount } = pruneExpiredEvents(normalized);
        eventsCache = sanitized;
        if (!removedCount) return;

        if (hasNativeStore && window.appBridge?.saveEvents) {
            try {
                await window.appBridge.saveEvents(eventsCache);
            } catch (e) {
                console.warn('No se pudo persistir limpieza de eventos en store nativo', e);
            }
        }
        saveEventsToLocal(eventsCache);
        console.info(`Se eliminaron ${removedCount} evento(s) expirados (${source}).`);
    }

    async function loadEventsFromStore() {
        if (hasNativeStore && window.appBridge?.getEvents) {
            try {
                const nativeEvents = await window.appBridge.getEvents();
                if (Array.isArray(nativeEvents) && nativeEvents.length) {
                    eventsCache = nativeEvents.map(normalizeEventRecord);
                    await applyEventSanitizationAndPersist('native');
                    return;
                }
                // Migración inicial: si no hay datos en store nativo, usa localStorage si existe.
                const legacy = loadEventsFromLocal();
                eventsCache = legacy.map(normalizeEventRecord);
                await applyEventSanitizationAndPersist('legacy');
                await window.appBridge.saveEvents(eventsCache);
                return;
            } catch (e) {
                console.warn('No se pudo cargar store nativo, se usa localStorage', e);
                eventsCache = loadEventsFromLocal().map(normalizeEventRecord);
                await applyEventSanitizationAndPersist('local-fallback');
                return;
            }
        }
        eventsCache = loadEventsFromLocal().map(normalizeEventRecord);
        await applyEventSanitizationAndPersist('local-only');
    }

    function saveEvents(list) {
        eventsCache = Array.isArray(list) ? list.map(normalizeEventRecord) : [];
        if (hasNativeStore && window.appBridge?.saveEvents) {
            window.appBridge.saveEvents(eventsCache).catch((e) => console.warn('Persistencia nativa falló', e));
        }
        // Mantener localStorage sincronizado como respaldo.
        saveEventsToLocal(eventsCache);
    }

    function loadEventsFromLocal() {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.warn('No se pudo parsear eventos locales', e);
            return [];
        }
    }

    function saveEventsToLocal(list) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        } catch (e) {
            console.warn('No se pudo guardar en localStorage', e);
        }
    }

    function renderAll() {
        try {
            const events = sortEvents(getEvents());
            renderDaily(events);
            renderWeekly(events);
            renderMonthly(events);
            renderList(events);
            notifier.rescheduleAll(events);
        } catch (err) {
            console.error('Error al renderizar', err);
        }
    }

    // Parseo seguro de fechas en formato YYYY-MM-DD como fecha local (sin desfase UTC).
    function parseLocalDate(dateStr) {
        if (!dateStr) return null;
        const [y, m, d] = dateStr.split('-').map(Number);
        return new Date(y, m - 1, d);
    }

    // Render de la vista diaria: slots por hora y chips de eventos.
    function renderDaily(events) {
        if (!dailySlotsEl) return;
        const base = parseLocalDate(baseDateInput.value);
        if (!base || Number.isNaN(base)) return;
        if (dailyCaption) dailyCaption.textContent = base.toLocaleDateString(getCurrentIntlLocale(), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

        const slots = buildSlots(8, 20);
        dailySlotsEl.innerHTML = '';

        slots.forEach(slot => {
            const slotEl = document.createElement('div');
            slotEl.className = 'slot';
            slotEl.innerHTML = `
                <div class="slot__label">${slot.label}</div>
                <div class="slot__events"></div>
            `;
            const slotEventsEl = slotEl.querySelector('.slot__events');

            const slotEvents = events.filter(e => sameDate(e.date, base) && isInSlot(e, slot));
            slotEvents.forEach(ev => {
                const chip = document.createElement('div');
                chip.className = 'event-chip';
                chip.style.background = ev.color;
                chip.innerHTML = `
                    <span class="event-chip__title">${ev.title}</span>
                    <span class="event-chip__time">${ev.start} - ${ev.end}</span>
                `;
                chip.addEventListener('click', () => loadToForm(ev));
                slotEventsEl.appendChild(chip);
            });

            dailySlotsEl.appendChild(slotEl);
        });
    }

    // Vista semanal: 7 columnas desde el lunes de la semana base.
    function renderWeekly(events) {
        if (!weeklyGridEl) return;
        const base = parseLocalDate(baseDateInput.value);
        if (!base || Number.isNaN(base)) return;
        const weekStart = startOfWeek(base);
        if (weeklyCaption) weeklyCaption.textContent = `${formatISODate(weekStart)} - ${formatISODate(addDays(weekStart, 6))}`;

        weeklyGridEl.innerHTML = '';
        for (let i = 0; i < 7; i++) {
            const day = addDays(weekStart, i);
            const dayEvents = events.filter(e => sameDate(e.date, day));
            const column = document.createElement('div');
            column.className = 'week-day';
            column.innerHTML = `
                <div class="week-day__label">${day.toLocaleDateString(getCurrentIntlLocale(), { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                <div class="week-day__events"></div>
            `;

            const label = column.querySelector('.week-day__label');
            const openDay = () => openDailyViewForDate(day);
            if (label) {
                label.setAttribute('role', 'button');
                label.setAttribute('tabindex', '0');
                label.addEventListener('click', openDay);
                label.addEventListener('keydown', (event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    openDay();
                });
            }

            const list = column.querySelector('.week-day__events');
            if (!dayEvents.length) {
                list.innerHTML = `<p class="muted">${tr('calendar.noEvents')}</p>`;
            } else {
                dayEvents.forEach(ev => {
                    const item = document.createElement('div');
                    item.className = 'event-chip';
                    item.style.background = ev.color;
                    item.innerHTML = `
                        <span class="event-chip__title">${ev.title}</span>
                        <span class="event-chip__time">${ev.start} - ${ev.end}</span>
                    `;
                    item.addEventListener('click', () => loadToForm(ev));
                    list.appendChild(item);
                });
            }

            weeklyGridEl.appendChild(column);
        }
    }

    // Vista mensual: celdas por día del mes, con badges de eventos.
    function renderMonthly(events) {
        if (!monthlyGridEl) return;
        const base = parseLocalDate(baseDateInput.value);
        if (!base || Number.isNaN(base)) return;
        const startMonth = new Date(base.getFullYear(), base.getMonth(), 1);
        const endMonth = new Date(base.getFullYear(), base.getMonth() + 1, 0);
        if (monthlyCaption) monthlyCaption.textContent = startMonth.toLocaleDateString(getCurrentIntlLocale(), { month: 'long', year: 'numeric' });

        monthlyGridEl.innerHTML = '';
        for (let d = 1; d <= endMonth.getDate(); d++) {
            const day = new Date(base.getFullYear(), base.getMonth(), d);
            const dayEvents = events.filter(e => sameDate(e.date, day));
            const cell = document.createElement('div');
            cell.className = 'month-day';
            cell.innerHTML = `
                <div class="month-day__header">
                    <span>${d}</span>
                    <span class="muted">${day.toLocaleDateString(getCurrentIntlLocale(), { weekday: 'short' })}</span>
                </div>
                <div class="month-day__events"></div>
            `;

            const header = cell.querySelector('.month-day__header');
            const openDay = () => openDailyViewForDate(day);
            if (header) {
                header.setAttribute('role', 'button');
                header.setAttribute('tabindex', '0');
                header.addEventListener('click', openDay);
                header.addEventListener('keydown', (event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    openDay();
                });
            }

            const list = cell.querySelector('.month-day__events');
            dayEvents.forEach(ev => {
                const badge = document.createElement('div');
                badge.className = 'badge';
                badge.style.background = ev.color + '20';
                badge.style.color = ev.color;
                badge.textContent = `${ev.start} · ${ev.title}`;
                badge.addEventListener('click', () => loadToForm(ev));
                list.appendChild(badge);
            });

            monthlyGridEl.appendChild(cell);
        }
    }

    // Lista cronológica de próximos eventos con acciones de editar/eliminar.
    function renderList(events) {
        if (!eventListEl) return;
        eventListEl.innerHTML = '';
        if (!events.length) {
            eventListEl.innerHTML = `<p class="muted">${tr('list.empty')}</p>`;
            return;
        }

        events.forEach(ev => {
            const attendance = normalizeAttendanceStatus(ev.attendance);
            const attendanceLabel = getAttendanceLabel(attendance);
            const card = document.createElement('article');
            card.className = 'event-card';
            card.innerHTML = `
                <div class="event-card__title">
                    <h3>${ev.title}</h3>
                </div>
                <div class="event-card__meta">
                    <span class="event-card__color" style="background:${ev.color}"></span>
                    <span>${formatReadableDate(ev.date, getCurrentIntlLocale())}</span>
                    <span>${ev.start} - ${ev.end}</span>
                    <span class="badge badge--attendance badge--attendance-${attendance}">${attendanceLabel}</span>
                    ${ev.description ? `<span class="badge">${ev.description}</span>` : ''}
                </div>
                <div class="event-card__attendance-actions">
                    <button class="btn btn--ghost" data-attendance="confirmed">${getAttendanceActionLabel('confirmed')}</button>
                    <button class="btn btn--ghost" data-attendance="tentative">${getAttendanceActionLabel('tentative')}</button>
                    <button class="btn btn--ghost" data-attendance="declined">${getAttendanceActionLabel('declined')}</button>
                    <button class="btn btn--ghost" data-attendance="pending">${getAttendanceActionLabel('pending')}</button>
                </div>
                <div class="event-card__actions">
                    <button class="btn btn--ghost" data-action="edit">${tr('list.edit')}</button>
                    <button class="btn btn--ghost" data-action="delete">${tr('list.delete')}</button>
                </div>
            `;

            card.querySelector('[data-action="edit"]').addEventListener('click', () => loadToForm(ev));
            card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteEvent(ev.id));
            card.querySelectorAll('[data-attendance]').forEach((btn) => {
                btn.addEventListener('click', () => setEventAttendance(ev.id, btn.dataset.attendance));
            });

            eventListEl.appendChild(card);
        });
    }

    function getAttendanceLabel(status = 'pending') {
        const key = normalizeAttendanceStatus(status);
        const dict = {
            es: {
                pending: 'Pendiente',
                confirmed: 'Confirmado',
                declined: 'No asiste',
                tentative: 'Tentativo',
            },
            en: {
                pending: 'Pending',
                confirmed: 'Confirmed',
                declined: 'Declined',
                tentative: 'Tentative',
            },
            pt: {
                pending: 'Pendente',
                confirmed: 'Confirmado',
                declined: 'Recusado',
                tentative: 'Tentativo',
            }
        };
        const lang = String(assistantLocale || 'es').slice(0, 2);
        return (dict[lang] && dict[lang][key]) || dict.es[key] || dict.es.pending;
    }

    function getAttendanceActionLabel(status = 'pending') {
        const key = normalizeAttendanceStatus(status);
        const dict = {
            es: {
                pending: 'Marcar pendiente',
                confirmed: 'Confirmar asistencia',
                declined: 'Marcar no asiste',
                tentative: 'Marcar tentativo',
            },
            en: {
                pending: 'Mark pending',
                confirmed: 'Confirm attendance',
                declined: 'Mark declined',
                tentative: 'Mark tentative',
            },
            pt: {
                pending: 'Marcar pendente',
                confirmed: 'Confirmar presença',
                declined: 'Marcar recusado',
                tentative: 'Marcar tentativo',
            }
        };
        const lang = String(assistantLocale || 'es').slice(0, 2);
        return (dict[lang] && dict[lang][key]) || dict.es[key] || dict.es.pending;
    }

    function setEventAttendance(id, status) {
        const nextStatus = normalizeAttendanceStatus(status, '');
        if (!nextStatus) {
            setStatus(getAttendanceStatusText('invalid'), 'danger');
            return;
        }

        const events = getEvents();
        const index = events.findIndex((e) => e.id === id);
        if (index < 0) {
            setStatus(assistantShortText('eventNotFound'), 'danger');
            return;
        }

        events[index] = {
            ...events[index],
            attendance: nextStatus,
        };
        saveEvents(events);
        renderAll();
        setStatus(getAttendanceStatusText('updated', { title: events[index].title, status: getAttendanceLabel(nextStatus) }), 'success');
    }

    function getAttendanceStatusText(type = 'updated', vars = {}) {
        const dict = {
            es: {
                updated: 'Asistencia actualizada para "{{title}}": {{status}}.',
                invalid: 'Estado de asistencia inválido.',
            },
            en: {
                updated: 'Attendance updated for "{{title}}": {{status}}.',
                invalid: 'Invalid attendance status.',
            },
            pt: {
                updated: 'Presença atualizada para "{{title}}": {{status}}.',
                invalid: 'Status de presença inválido.',
            }
        };
        const lang = String(assistantLocale || 'es').slice(0, 2);
        const template = (dict[lang] && dict[lang][type]) || dict.es[type] || '';
        return Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{{${k}}}`, String(v ?? '')), template);
    }

    function deleteEvent(id) {
        const filtered = getEvents().filter((e) => e.id !== id);
        saveEvents(filtered);
        renderAll();
        try { notifier.cancelFor(id); } catch (e) { console.warn('Cancel failed', e); }
        setStatus(tr('form.statusEventDeleted'));
    }

    // Carga un evento existente en el formulario para editarlo.
    function loadToForm(ev) {
        titleInput.value = ev.title;
        dateInput.value = ev.date;
        startInput.value = ev.start;
        endInput.value = ev.end;
        descInput.value = ev.description || '';
        colorInput.value = ev.color;
        eventIdInput.value = ev.id;
        applyReminderToForm(ev.reminder_offset, ev.reminder_offsets);
        submitBtn.textContent = tr('form.update');
        setStatus(tr('form.statusEditing'), 'muted');
    }

    function handleReminderChange(event) {
        const target = event?.target;
        if (target === reminderCustomRadio && reminderCustomRadio?.checked) {
            reminderOptionInputs.forEach((input) => {
                input.checked = false;
            });
        }

        if (target?.name === 'reminder-opt' && target.checked) {
            if (reminderCustomRadio) reminderCustomRadio.checked = false;
        }

        const isCustom = !!reminderCustomRadio?.checked;
        if (isCustom) {
            reminderCustomWrapper.style.display = 'flex';
            if (!reminderCustomInput.value) reminderCustomInput.value = '';
            reminderCustomInput.focus();
        } else {
            reminderCustomWrapper.style.display = 'none';
            reminderCustomInput.value = '';
        }
    }

    function setReminderDefault() {
        const defaultOffsets = new Set(DEFAULT_REMINDER_OFFSETS_S);
        reminderOptionInputs.forEach((input) => {
            input.checked = defaultOffsets.has(Number(input.value));
        });
        if (reminderCustomRadio) reminderCustomRadio.checked = false;
        reminderCustomInput.value = '';
        reminderCustomWrapper.style.display = 'none';
    }

    function getReminderOffsetsFromForm() {
        const checkedOffsets = reminderOptionInputs
            .filter((input) => input.checked)
            .map((input) => Number(input.value))
            .filter((seconds) => Number.isFinite(seconds) && seconds > 0);

        if (reminderCustomRadio?.checked) {
            const minutes = parseInt(reminderCustomInput.value, 10);
            if (Number.isFinite(minutes) && minutes > 0) return [minutes * 60];
            setStatus(tr('form.statusReminderInvalid'), 'danger');
            return null;
        }

        if (checkedOffsets.length > 0) return checkedOffsets;
        return [...DEFAULT_REMINDER_OFFSETS_S];
    }

    function applyReminderToForm(reminderOffsetSeconds, reminderOffsets = []) {
        const offsets = Array.isArray(reminderOffsets) && reminderOffsets.length > 0
            ? reminderOffsets.map(Number)
            : [Number(reminderOffsetSeconds)];
        const validOffsets = offsets.filter((seconds) => Number.isFinite(seconds) && seconds > 0);
        if (!validOffsets.length) {
            setReminderDefault();
            return;
        }

        const presetSet = new Set(reminderOptionInputs.map((input) => Number(input.value)));
        const presetOffsets = validOffsets.filter((seconds) => presetSet.has(seconds));
        const customOffsets = validOffsets.filter((seconds) => !presetSet.has(seconds));

        if (customOffsets.length > 0) {
            reminderOptionInputs.forEach((input) => {
                input.checked = false;
            });
            if (reminderCustomRadio) reminderCustomRadio.checked = true;
            reminderCustomWrapper.style.display = 'flex';
            reminderCustomInput.value = Math.round(customOffsets[0] / 60);
            return;
        }

        reminderOptionInputs.forEach((input) => {
            input.checked = presetOffsets.includes(Number(input.value));
        });
        if (reminderCustomRadio) reminderCustomRadio.checked = false;
        reminderCustomWrapper.style.display = 'none';
        reminderCustomInput.value = '';
    }

    // Helpers
    function normalizeViewTarget(target) {
        const map = { day: 'daily', week: 'weekly', month: 'monthly', diaria: 'daily', semanal: 'weekly', mensual: 'monthly' };
        return map[target] || target;
    }


    function getEventsByRange(range) {
        const events = sortEvents(getEvents());
        const today = new Date();
        const todayFloor = new Date(today.getFullYear(), today.getMonth(), today.getDate());

        if (range === 'today') {
            return events.filter(ev => sameDate(ev.date, todayFloor));
        }

        if (range === 'week') {
            const start = startOfWeek(todayFloor);
            const end = addDays(start, 6);
            return events.filter(ev => {
                const d = parseLocalDate(ev.date);
                return d && d >= start && d <= end;
            });
        }

        if (range === 'month') {
            const month = todayFloor.getMonth();
            const year = todayFloor.getFullYear();
            return events.filter(ev => {
                const d = parseLocalDate(ev.date);
                return d && d.getMonth() === month && d.getFullYear() === year;
            });
        }

        return [];
    }

    function formatAssistantEvents(list, range) {
        const headers = assistantStrings.headers;
        const noEvents = assistantStrings.noEvents;
        if (!list.length) {
            return (noEvents && noEvents[range]) || tr('calendar.noEvents');
        }
        const title = (headers && headers[range]) || tr('assistant.eventsTitle');
        const lines = list.map(ev => {
            const desc = ev.description ? ` — ${ev.description}` : '';
            const attendance = getAttendanceLabel(ev.attendance);
            return `- ${ev.date} ${ev.start}-${ev.end} ${ev.title}${desc} [${attendance}]`;
        });
        return `${title}\n${lines.join('\n')}`;
    }

    function startClock() {
        if (!clockEl) return;
        if (clockIntervalId) {
            clearInterval(clockIntervalId);
            clockIntervalId = null;
        }
        const update = () => {
            const now = new Date();
            clockEl.textContent = now.toLocaleTimeString(getCurrentIntlLocale(), { hour12: false });
        };
        update();
        clockIntervalId = setInterval(update, 1000);
    }

    async function hydrateVersion() {
        if (!versionEl || !window.appBridge?.getVersion) return;
        try {
            const version = await window.appBridge.getVersion();
            if (version) versionEl.textContent = `v${version}`;
        } catch (err) {
            console.warn('No se pudo obtener la versión', err);
        }
    }

    async function hydrateAssistantLocale() {
        try {
            const detected = (await window.appBridge?.getLocale?.()) || navigator.language || 'es';
            assistantLocale = normalizeLocale(detected);
            assistantStrings = ASSISTANT_TEXT[assistantLocale] || ASSISTANT_TEXT.es;
            assistantSystemPrompt = assistantStrings.prompt;
            notifier.setLocale?.(assistantLocale);
        } catch (e) {
            assistantLocale = 'es';
            assistantStrings = ASSISTANT_TEXT.es;
            assistantSystemPrompt = assistantStrings.prompt;
            notifier.setLocale?.('es');
        }
        applyI18n();
    }

    function loadAssistantHistory() {
        try {
            const raw = localStorage.getItem(ASSISTANT_STORE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return;
            const legacyDesktopOnlyRx = /(available only in the desktop app|solo en la app de escritorio|apenas no app desktop).*(electron)/i;
            parsed.slice(-30).forEach((m) => {
                if (m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') {
                    if (m.role === 'assistant' && legacyDesktopOnlyRx.test(m.content)) return;
                    assistantMessages.push({ role: m.role, content: m.content });
                }
            });
            renderAssistantMessages();
        } catch (e) {
            console.warn('No se pudo cargar el hilo de CoordinalIA', e);
        }
    }

    function saveAssistantHistory() {
        try {
            const clean = assistantMessages
                .filter(m => m.role === 'user' || m.role === 'assistant')
                .slice(-30)
                .map(m => ({ role: m.role, content: m.content }));
            localStorage.setItem(ASSISTANT_STORE_KEY, JSON.stringify(clean));
        } catch (e) {
            console.warn('No se pudo guardar el hilo de CoordinalIA', e);
        }
    }

    function setupAssistantModal() {
        const modal = assistantModal || document.getElementById('assistant-modal');
        const openBtn = assistantOpenBtn || document.getElementById('assistant-open');
        if (!modal || !openBtn) return;

        if (assistantModalBound) {
            renderAssistantProviderBtn();
            return;
        }

        assistantModalBound = true;

        const closeButtons = [assistantCloseBtn || document.getElementById('assistant-close'), assistantCloseFooterBtn || document.getElementById('assistant-close-footer')];
        const backdrop = modal.querySelector('[data-dismiss="assistant"]');

        // Botón para alternar proveedor dentro del título del modal
        const titleGroup = modal.querySelector('.modal__title-group');
        if (titleGroup) {
            let existing = titleGroup.querySelector('#assistant-provider');
            assistantProviderBtn = existing;
            if (!assistantProviderBtn) {
                assistantProviderBtn = document.createElement('button');
                assistantProviderBtn.type = 'button';
                assistantProviderBtn.id = 'assistant-provider';
                assistantProviderBtn.className = 'btn btn--ghost';
                assistantProviderBtn.style.marginLeft = '0.5rem';
                titleGroup.appendChild(assistantProviderBtn);
            }
            assistantProviderBtn.addEventListener('click', () => promptAssistantProvider(true));
            renderAssistantProviderBtn();
        }

        openBtn.addEventListener('click', openAssistantModal);
        closeButtons.forEach(btn => btn?.addEventListener('click', closeAssistantModal));
        backdrop?.addEventListener('click', closeAssistantModal);

        document.addEventListener('keydown', (evt) => {
            const currentModal = assistantModal || document.getElementById('assistant-modal');
            if (evt.key === 'Escape' && currentModal && !currentModal.classList.contains('is-hidden')) {
                closeAssistantModal();
            }
        });

        assistantForm?.addEventListener('submit', handleAssistantSubmit);
        setupAssistantVoice();
        assistantTtsToggle?.addEventListener('change', handleAssistantTtsToggle);
        assistantClearBtn?.addEventListener('click', clearAssistantThread);
    }

    function setupAssistantVoice() {
        if (!assistantVoiceBtn) return;

        if (!hasVoiceRecognitionSupport(window)) {
            assistantVoiceBtn.disabled = true;
            assistantVoiceBtn.title = tr('assistant.voiceUnsupported');
            return;
        }

        assistantVoiceBtn.addEventListener('click', toggleAssistantVoice);
        updateVoiceUi();
    }

    function resetAssistantVoiceCaptureState() {
        assistantVoiceTranscriptBuffer = '';
        assistantVoiceSubmitting = false;
        clearTimeout(assistantVoiceFinalizeTimer);
        assistantVoiceFinalizeTimer = null;
    }

    function appendAssistantVoiceTranscript(segment = '') {
        const clean = cleanVoiceTranscript(segment || '');
        if (!clean) return;

        const current = cleanVoiceTranscript(assistantVoiceTranscriptBuffer || '');
        if (!current) {
            assistantVoiceTranscriptBuffer = clean;
            return;
        }

        if (current === clean || current.endsWith(clean)) {
            assistantVoiceTranscriptBuffer = current;
            return;
        }

        assistantVoiceTranscriptBuffer = `${current} ${clean}`.replace(/\s+/g, ' ').trim();
    }

    function finalizeAssistantVoiceTranscript() {
        if (assistantVoiceSubmitting) return;
        const transcript = cleanVoiceTranscript(assistantVoiceTranscriptBuffer || '');
        if (!transcript) {
            setAssistantStatus(tr('assistant.transcriptFailed'));
            return;
        }

        assistantVoiceSubmitting = true;
        assistantVoiceStopRequested = true;
        clearTimeout(assistantVoiceFinalizeTimer);
        assistantVoiceFinalizeTimer = null;

        if (assistantInput) assistantInput.value = transcript;
        submitAssistantFromVoice();
    }

    function scheduleAssistantVoiceFinalize() {
        clearTimeout(assistantVoiceFinalizeTimer);
        assistantVoiceFinalizeTimer = setTimeout(() => {
            finalizeAssistantVoiceTranscript();
        }, ASSISTANT_VOICE_SILENCE_SUBMIT_MS);
    }

    function createAssistantRecognizer() {
        const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognitionCtor) return null;
        const rec = new SpeechRecognitionCtor();
        rec.lang = getVoiceLang(assistantLocale);
        rec.interimResults = false;
        rec.continuous = true;
        rec.maxAlternatives = 1;

        rec.onstart = () => {
            assistantListening = true;
            if (!assistantVoiceTranscriptBuffer) {
                assistantVoiceHasResult = false;
            }
            setAssistantStatus(tr('assistant.listening'));
            updateVoiceUi();
        };

        rec.onend = () => {
            if (
                !assistantVoiceStopRequested
                && assistantVoiceMode === 'recognition'
                && !assistantVoiceSubmitting
                && assistantVoiceTranscriptBuffer
            ) {
                if (assistantVoiceFinalizeTimer) {
                    setTimeout(() => {
                        if (!assistantVoiceStopRequested && !assistantVoiceSubmitting) {
                            startAssistantVoiceRecognition({ fromRetry: true });
                        }
                    }, 220);
                    return;
                }
                finalizeAssistantVoiceTranscript();
                return;
            }

            if (
                !assistantVoiceStopRequested
                && assistantVoiceMode === 'recognition'
                && !assistantVoiceHasResult
                && assistantVoiceOnEndRetryCount < ASSISTANT_VOICE_ONEND_MAX_RETRIES
            ) {
                assistantVoiceOnEndRetryCount += 1;
                setAssistantStatus(mapVoiceErrorCode('no-speech', assistantLocale));
                setTimeout(() => {
                    if (!assistantVoiceStopRequested) {
                        startAssistantVoiceRecognition({ fromRetry: true });
                    }
                }, 350);
                return;
            }

            assistantListening = false;
            updateVoiceUi();
        };

        rec.onerror = (event) => {
            const code = event?.error || 'unknown';
            const isNetworkError = code === 'network';

            if (isNetworkError && !assistantVoiceStopRequested && assistantVoiceRetryCount < ASSISTANT_VOICE_MAX_RETRIES) {
                assistantVoiceRetryCount += 1;
                const waitMs = 700 * assistantVoiceRetryCount;
                setAssistantStatus(tr('assistant.networkRetry', {
                    current: assistantVoiceRetryCount,
                    max: ASSISTANT_VOICE_MAX_RETRIES,
                }));
                clearTimeout(assistantVoiceRetryTimer);
                assistantVoiceRetryTimer = setTimeout(() => {
                    startAssistantVoiceRecognition({ fromRetry: true });
                }, waitMs);
                return;
            }

            if (isNetworkError && !assistantVoiceStopRequested) {
                setAssistantStatus(tr('assistant.voiceServiceFallback'));
                assistantVoiceMode = 'recorder';
                assistantListening = false;
                updateVoiceUi();
                startVoiceRecorderFlow();
                return;
            }

            const msg = mapVoiceErrorCode(code, assistantLocale);
            setAssistantStatus(msg);
            assistantListening = false;
            updateVoiceUi();
        };

        rec.onresult = (event) => {
            assistantVoiceHasResult = true;
            assistantVoiceOnEndRetryCount = 0;

            const startIndex = Number.isFinite(event?.resultIndex) ? event.resultIndex : 0;
            const results = event?.results || [];

            for (let i = startIndex; i < results.length; i += 1) {
                const item = results[i];
                const chunk = item?.[0]?.transcript || '';
                appendAssistantVoiceTranscript(chunk);
            }

            if (!assistantVoiceTranscriptBuffer) {
                setAssistantStatus(tr('assistant.transcriptFailed'));
                return;
            }

            setAssistantStatus(tr('assistant.listening'));
            scheduleAssistantVoiceFinalize();
        };

        return rec;
    }

    function submitAssistantFromVoice() {
        setAssistantStatus(tr('assistant.textCapturedPreparing'));
        setTimeout(() => {
            if (!assistantInput?.value?.trim()) {
                setAssistantStatus(tr('assistant.textMissing'));
                return;
            }
            setAssistantStatus(tr('assistant.textCapturedSending'));
            assistantForm?.requestSubmit?.();
        }, 650);
    }

    function base64ToUint8Array(base64 = '') {
        const clean = String(base64 || '').trim();


        if (!clean) return new Uint8Array();
        const normalized = clean.includes(',') ? clean.split(',').pop() : clean;
        const binary = window.atob(normalized);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    async function playAssistantAudioBytes(bytes, mimeType = 'audio/mpeg') {
        const payload = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
        if (!payload.length) {
            throw new Error('EMPTY_TTS_AUDIO');
        }

        if (assistantTtsAudio) {
            try {
                assistantTtsAudio.pause();
            } catch (_e) {
                // no-op
            }
            assistantTtsAudio = null;
        }

        const blob = new Blob([payload], { type: mimeType || 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        assistantTtsAudio = new Audio(url);
        assistantTtsAudio.onended = () => URL.revokeObjectURL(url);
        assistantTtsAudio.onerror = () => URL.revokeObjectURL(url);
        await assistantTtsAudio.play();
    }

    function resolveAndroidElevenLabsTtsUrl(baseUrl = '', voiceId = '') {
        let url = String(baseUrl || ASSISTANT_ANDROID_DEFAULT_TTS_API_URL).trim().replace(/\/+$/, '');
        const safeVoice = encodeURIComponent(String(voiceId || ASSISTANT_ANDROID_DEFAULT_TTS_VOICE).trim());

        if (!/\/text-to-speech(?:\/|$)/i.test(url)) {
            url = `${url}/text-to-speech`;
        }
        if (!/\/text-to-speech\/[^/]+$/i.test(url)) {
            url = `${url}/${safeVoice}`;
        }
        return url;
    }

    async function speakAssistantTextWithAndroidElevenLabs(text = '') {
        if (!isAndroidRuntime()) return false;
        const cfg = getAssistantConfig();
        const apiKey = String(cfg.androidTtsApiKey || '').trim();
        if (!apiKey) return false;

        const endpoint = resolveAndroidElevenLabsTtsUrl(cfg.androidTtsApiUrl, cfg.androidTtsVoice);
        const model = String(cfg.androidTtsModel || ASSISTANT_ANDROID_DEFAULT_TTS_MODEL).trim();

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'audio/mpeg',
                    'xi-api-key': apiKey,
                },
                body: JSON.stringify({
                    text: String(text || '').trim(),
                    model_id: model,
                    output_format: 'mp3_44100_128',
                }),
                signal: controller.signal,
            });

            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                const err = new Error(`ELEVENLABS_TTS_ERROR ${res.status}: ${errText}`);
                err.code = res.status === 401 ? 'NO_TTS_API_KEY' : 'TTS_ERROR';
                throw err;
            }

            const arr = new Uint8Array(await res.arrayBuffer());
            await playAssistantAudioBytes(arr, res.headers.get('content-type') || 'audio/mpeg');
            return true;
        } finally {
            clearTimeout(timeout);
        }
    }

    function supportsBrowserTts() {
        return !!window?.speechSynthesis && typeof window.SpeechSynthesisUtterance === 'function';
    }

    function supportsCapacitorTts() {
        return typeof window?.Capacitor?.Plugins?.TextToSpeech?.speak === 'function';
    }

    async function speakAssistantTextWithCapacitorTts(text = '') {
        if (!supportsCapacitorTts()) return false;
        try {
            await window.Capacitor.Plugins.TextToSpeech.speak({
                text: String(text || '').trim(),
                lang: getVoiceLang(assistantLocale),
                rate: 1,
                pitch: 1,
                volume: 1,
                category: 'playback',
            });
            return true;
        } catch (_e) {
            return false;
        }
    }

    function pickBrowserTtsVoice(preferredLang = '') {
        if (!window?.speechSynthesis?.getVoices) return null;
        const voices = window.speechSynthesis.getVoices() || [];
        if (!voices.length) return null;

        const preferred = String(preferredLang || '').toLowerCase();
        const primary = preferred.split('-')[0];

        const femaleHints = [
            'female', 'woman', 'girl', 'femenina', 'mujer', 'garota',
            'lucia', 'sofia', 'paulina', 'camila', 'elena', 'maria',
            'ana', 'clara', 'paula', 'isabela', 'isabella', 'monica'
        ];

        const voiceLooksFemale = (voice) => {
            const name = normalizeLooseText(voice?.name || '');
            if (!name) return false;
            return femaleHints.some(h => name.includes(h));
        };

        const rankVoice = (voice) => {
            const lang = String(voice?.lang || '').toLowerCase();
            const femaleBoost = voiceLooksFemale(voice) ? 100 : 0;
            if (lang === preferred) return 300 + femaleBoost;
            if (lang.startsWith(`${primary}-`)) return 200 + femaleBoost;
            if (lang === primary) return 150 + femaleBoost;
            return femaleBoost;
        };

        const ranked = [...voices].sort((a, b) => rankVoice(b) - rankVoice(a));
        return ranked[0] || null;
    }

    async function ensureBrowserTtsVoices() {
        if (!supportsBrowserTts()) return [];
        const voicesNow = window.speechSynthesis.getVoices() || [];
        if (voicesNow.length) return voicesNow;

        return new Promise((resolve) => {
            let settled = false;
            const done = () => {
                if (settled) return;
                settled = true;
                window.speechSynthesis.onvoiceschanged = null;
                resolve(window.speechSynthesis.getVoices() || []);
            };
            window.speechSynthesis.onvoiceschanged = () => done();
            setTimeout(done, 1200);
        });
    }

    function stopAssistantBrowserTts() {
        if (!window?.speechSynthesis) return;
        try {
            window.speechSynthesis.cancel();
        } catch (_e) {
            // no-op
        }
    }

    async function speakAssistantTextWithBrowserTts(text = '') {
        if (!supportsBrowserTts()) return false;
        await ensureBrowserTtsVoices();

        return new Promise((resolve) => {
            try {
                stopAssistantBrowserTts();
                const utterance = new window.SpeechSynthesisUtterance(String(text || '').trim());
                const preferredLang = getVoiceLang(assistantLocale);
                const voice = pickBrowserTtsVoice(preferredLang);
                if (voice) {
                    utterance.voice = voice;
                    utterance.lang = voice.lang || preferredLang;
                } else {
                    utterance.lang = preferredLang;
                }
                utterance.rate = 1;
                utterance.pitch = 1;
                utterance.volume = 1;
                utterance.onend = () => resolve(true);
                utterance.onerror = () => resolve(false);
                window.speechSynthesis.speak(utterance);
                setTimeout(() => resolve(false), 8000);
            } catch (_e) {
                resolve(false);
            }
        });
    }

    async function speakAssistantText(text = '') {
        const speechText = toPlainAssistantText(text);
        if (!assistantTtsEnabled || !speechText) return;

        const cfg = getAssistantConfig();
        const selectedProvider = normalizeTtsProviderValue(assistantTtsProvider || cfg.ttsProvider || 'auto') || 'auto';
        const canUseElevenLabsShortcut = selectedProvider === 'auto' || selectedProvider === 'elevenlabs';

        if (canUseElevenLabsShortcut) {
            const elevenLabsOk = await speakAssistantTextWithAndroidElevenLabs(speechText).catch((e) => {
                console.warn('Fallback ElevenLabs TTS Android falló', e);
                return false;
            });
            if (elevenLabsOk) {
                setAssistantStatus('');
                return;
            }
        }

        if (!window.appBridge?.synthesizeSpeech) {
            const capacitorOk = await speakAssistantTextWithCapacitorTts(speechText);
            if (capacitorOk) {
                setAssistantStatus('');
                return;
            }

            const browserOk = await speakAssistantTextWithBrowserTts(speechText);
            if (browserOk) {
                setAssistantStatus('');
                return;
            }
            setAssistantStatus(tr('assistant.ttsUnavailableLocal'));
            return;
        }

        try {
            const synthPayload = {
                text: speechText,
                provider: selectedProvider,
                language: getVoiceLang(assistantLocale),
                format: 'mp3'
            };

            if (selectedProvider === 'openai') {
                synthPayload.apiKey = String(cfg.openaiApiKey || '').trim();
            } else if (selectedProvider === 'google') {
                synthPayload.apiKey = String(cfg.googleApiKey || '').trim();
            } else if (selectedProvider === 'fish') {
                synthPayload.apiKey = String(cfg.fishApiKey || '').trim();
                synthPayload.model = String(cfg.androidTtsModel || ASSISTANT_FISH_DEFAULT_TTS_MODEL).trim();
                synthPayload.voice = String(cfg.androidTtsVoice || ASSISTANT_FISH_FEMALE_TTS_VOICE).trim();
            } else if (selectedProvider === 'elevenlabs') {
                synthPayload.apiKey = String(cfg.androidTtsApiKey || '').trim();
                synthPayload.apiUrl = String(cfg.androidTtsApiUrl || ASSISTANT_ANDROID_DEFAULT_TTS_API_URL).trim();
                synthPayload.model = String(cfg.androidTtsModel || ASSISTANT_ANDROID_DEFAULT_TTS_MODEL).trim();
                synthPayload.voice = String(cfg.androidTtsVoice || ASSISTANT_ANDROID_DEFAULT_TTS_VOICE).trim();
            }

            setAssistantStatus(tr('assistant.synthesizing'));
            const result = await window.appBridge.synthesizeSpeech(synthPayload);

            const bytes = base64ToUint8Array(result?.audioBase64 || '');
            await playAssistantAudioBytes(bytes, result?.mimeType || 'audio/mpeg');
            setAssistantStatus('');
        } catch (e) {
            if (canUseElevenLabsShortcut) {
                const elevenLabsRetryOk = await speakAssistantTextWithAndroidElevenLabs(speechText).catch(() => false);
                if (elevenLabsRetryOk) {
                    setAssistantStatus('');
                    return;
                }
            }

            const capacitorTtsOk = await speakAssistantTextWithCapacitorTts(speechText);
            if (capacitorTtsOk) {
                setAssistantStatus('');
                return;
            }

            const browserTtsOk = await speakAssistantTextWithBrowserTts(speechText);
            if (browserTtsOk) {
                setAssistantStatus('');
                return;
            }

            const raw = String(e?.message || '');
            const quotaOrBillingIssue = /(\b402\b|insufficient|quota|billing|payment required|credit)/i.test(raw);
            if (quotaOrBillingIssue && assistantTtsEnabled) {
                assistantTtsEnabled = false;
                const cfg = getAssistantConfig();
                cfg.ttsEnabled = false;
                saveAssistantConfig(cfg);
                renderAssistantTtsToggle();
                setAssistantStatus(tr('assistant.ttsAutoDisabledQuota'));
                return;
            }

            const msg = /NO_TTS_API_KEY|ELEVENLABS_API_KEY/i.test(e?.message || '')
                ? tr('assistant.ttsApiKey')
                : /TTS error|EMPTY_TTS_AUDIO/i.test(e?.message || '')
                    ? tr('assistant.ttsError', { error: (e.message || '').slice(0, 120) })
                    : tr('assistant.ttsFailed');
            console.warn('No se pudo reproducir TTS', e);
            setAssistantStatus(msg);
        }
    }

    async function ensureAssistantMicrophonePermission() {
        if (!navigator?.mediaDevices?.getUserMedia) return true;
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach(track => track.stop());
            return true;
        } catch (e) {
            const code = e?.name === 'NotAllowedError' ? 'not-allowed'
                : e?.name === 'NotFoundError' ? 'audio-capture'
                    : 'unknown';
            setAssistantStatus(mapVoiceErrorCode(code, assistantLocale));
            return false;
        }
    }

    function startAssistantVoiceRecognition({ fromRetry = false } = {}) {
        if (!assistantRecognizer) {
            assistantRecognizer = createAssistantRecognizer();
        }
        if (!assistantRecognizer) {
            setAssistantStatus(tr('assistant.recognitionUnavailable'));
            return;
        }

        assistantRecognizer.lang = getVoiceLang(assistantLocale);
        try {
            assistantRecognizer.start();
            if (!fromRetry) {
                setAssistantStatus(tr('assistant.listening'));
            }
        } catch (e) {
            console.warn('No se pudo iniciar reconocimiento de voz', e);
            setAssistantStatus(tr('assistant.recognitionStartFailed'));
        }
    }

    async function toggleAssistantVoice() {
        if (!assistantVoiceBtn) return;
        if (assistantListening) {
            assistantVoiceStopRequested = true;
            clearTimeout(assistantVoiceRetryTimer);
            if (assistantVoiceMode === 'recorder') {
                stopVoiceRecorderFlow();
                return;
            }
            assistantRecognizer?.stop?.();
            return;
        }

        if (navigator && 'onLine' in navigator && !navigator.onLine) {
            setAssistantStatus(tr('assistant.offline'));
            return;
        }

        const micReady = await ensureAssistantMicrophonePermission();
        if (!micReady) {
            updateVoiceUi();
            return;
        }

        assistantVoiceStopRequested = false;
        assistantVoiceRetryCount = 0;
        assistantVoiceOnEndRetryCount = 0;
        assistantVoiceHasResult = false;
        resetAssistantVoiceCaptureState();
        clearTimeout(assistantVoiceRetryTimer);

        if (assistantVoiceMode === 'recorder') {
            startVoiceRecorderFlow();
            return;
        }

        startAssistantVoiceRecognition({ fromRetry: false });
    }

    async function startVoiceRecorderFlow() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            assistantRecorderStream = stream;
            assistantRecorderChunks = [];

            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : 'audio/webm';
            assistantRecorder = new MediaRecorder(stream, { mimeType });

            assistantRecorder.ondataavailable = (evt) => {
                if (evt?.data && evt.data.size > 0) {
                    assistantRecorderChunks.push(evt.data);
                }
            };

            assistantRecorder.onstop = async () => {
                try {
                    const blob = new Blob(assistantRecorderChunks, { type: assistantRecorder.mimeType || 'audio/webm' });
                    if (!blob.size) {
                        setAssistantStatus(tr('assistant.noAudioCaptured'));
                        return;
                    }

                    setAssistantStatus(tr('assistant.transcribing'));
                    const buffer = await blob.arrayBuffer();
                    const cfg = getAssistantConfig();
                    const transcript = await window.appBridge?.transcribeAudio?.({
                        provider: cfg.provider,
                        language: getVoiceLang(assistantLocale),
                        mimeType: blob.type || 'audio/webm',
                        audioBuffer: buffer,
                    });

                    const text = cleanVoiceTranscript(transcript || '');
                    if (!text) {
                        setAssistantStatus(tr('assistant.transcriptFailed'));
                        return;
                    }

                    if (assistantInput) assistantInput.value = text;
                    submitAssistantFromVoice();
                } catch (e) {
                    console.warn('Fallo transcripción de audio', e);
                    const raw = String(e?.message || '');
                    const errCode = String(e?.code || '');
                    const quotaOrBillingIssue = /(\b402\b|insufficient|quota|billing|payment required|credit|saldo)/i.test(raw);
                    if (quotaOrBillingIssue) {
                        assistantVoiceMode = 'recognition';
                        assistantListening = false;
                        updateVoiceUi();
                        setAssistantStatus(tr('assistant.sttAutoFallbackRecognition'));
                        return;
                    }

                    if (/NO_STT_API_KEY/i.test(errCode) || /NO_STT_API_KEY/i.test(raw)) {
                        assistantVoiceMode = 'recognition';
                        assistantListening = false;
                        updateVoiceUi();
                        setAssistantStatus(tr('assistant.transcribeApiKey'));
                        return;
                    }

                    const msg = /STT error/i.test(e?.message || '')
                        ? tr('assistant.transcribeError', { error: (e.message || '').slice(0, 120) })
                        : tr('assistant.transcribeRecordedFail');
                    setAssistantStatus(msg);
                } finally {
                    assistantListening = false;
                    updateVoiceUi();
                    stopRecorderTracks();
                }
            };

            assistantRecorder.start();
            assistantListening = true;
            setAssistantStatus(tr('assistant.recording'));
            updateVoiceUi();
        } catch (e) {
            console.warn('No se pudo iniciar grabación de voz', e);
            setAssistantStatus(tr('assistant.recordingStartFailed'));
            assistantListening = false;
            updateVoiceUi();
            stopRecorderTracks();
        }
    }

    function stopRecorderTracks() {
        if (assistantRecorderStream) {
            assistantRecorderStream.getTracks().forEach(t => t.stop());
            assistantRecorderStream = null;
        }
    }

    function stopVoiceRecorderFlow() {
        if (assistantRecorder && assistantRecorder.state !== 'inactive') {
            assistantRecorder.stop();
        } else {
            assistantListening = false;
            updateVoiceUi();
            stopRecorderTracks();
        }
    }

    function updateVoiceUi() {
        if (!assistantVoiceBtn) return;
        assistantVoiceBtn.classList.toggle('is-listening', assistantListening);
        assistantVoiceBtn.textContent = assistantListening ? tr('assistant.voiceButtonStop') : tr('assistant.voiceButton');
        assistantVoiceBtn.title = assistantListening
            ? tr('assistant.voiceButtonStop')
            : assistantVoiceMode === 'recorder'
                ? tr('assistant.voiceRecorderMode')
                : tr('assistant.voiceTitle');
    }

    function openAssistantModal() {
        const modal = assistantModal || document.getElementById('assistant-modal');
        if (!modal) return;
        modal.classList.remove('is-hidden');
        modal.querySelector('.modal__dialog')?.focus?.();
        setAssistantStatus(tr('assistant.scopeHint'));
        if (shouldShowAssistantWelcome()) {
            appendAssistantMessage({
                role: 'assistant',
                content: assistantStrings.welcome
            });
            markAssistantWelcomeSeen();
        }
        scrollAssistantBottom();
    }

    function closeAssistantModal() {
        const modal = assistantModal || document.getElementById('assistant-modal');
        const openBtn = assistantOpenBtn || document.getElementById('assistant-open');
        assistantVoiceStopRequested = true;
        clearTimeout(assistantVoiceRetryTimer);
        clearTimeout(assistantVoiceFinalizeTimer);
        assistantVoiceFinalizeTimer = null;
        stopVoiceRecorderFlow();
        if (assistantListening) assistantRecognizer?.stop?.();
        modal?.classList?.add('is-hidden');
        openBtn?.focus();
    }

    function clearAssistantThread() {
        assistantMessages.length = 0;
        saveAssistantHistory();
        renderAssistantMessages();
        setAssistantStatus(tr('assistant.scopeHint'));
        if (assistantInput) assistantInput.value = '';
    }

    function isAssistantCreateIntent(text = '') {
        const t = String(text || '').toLowerCase();
        return /(\bcrear\b|\bcrea\b|\bagendar\b|\bagenda\b|\bprogramar\b|\bprograma\b|\banadir\b|\bañadir\b|\badd\b|\bcreate\b|\bschedule\b|\bnovo\b|\bcriar\b)/i.test(t);
    }

    function isAssistantRescheduleIntent(text = '') {
        const t = String(text || '').toLowerCase();
        return /(\breprogramar\b|\breprograma\b|\breagendar\b|\breagenda\b|\bmover\b|\bcambiar\b|\bposponer\b|\baplazar\b|\breschedule\b)/i.test(t);
    }
    function stripLeadingCommandWords(text = '') {
        let out = String(text || '').trim();
        if (!out) return out;

        const cmd = '(?:crear|crea|agendar|agenda|programar|programa|anadir|añadir|add|create|schedule|criar|reprogramar|reprograma|reagendar|reagenda|mover|mueve|cambiar|cambia|reschedule|eliminar|elimina|borrar|borra|cancelar|cancela)';
        const lead = new RegExp(`^(?:${cmd})(?:\\s+|[:.,;-])+`, 'i');
        const article = /^(?:el|la|los|las|un|una)\s+/i;
        const eventWord = /^(?:evento|evento:)\s*/i;

        let changed = true;
        while (changed) {
            const before = out;
            out = out.replace(lead, '').replace(article, '').replace(eventWord, '').trim();
            changed = out !== before;
        }

        return out.replace(/^[\s:.,;-]+/, '').trim();
    }

    function isAssistantDeleteIntent(text = '') {
        const t = String(text || '').toLowerCase();
        return /(\beliminar\b|\belimina\b|\bborrar\b|\bborra\b|\bcancelar\b|\bcancela\b|\bdelete\b|\bremove\b)/i.test(t);
    }

    function parseAttendanceFromText(text = '') {
        const t = normalizeLooseText(text);
        if (/\b(confirmad[oa]|confirmar|confirm|accepted|aceptad[oa]|yes|si|sim)\b/.test(t)) return 'confirmed';
        if (/\b(no asiste|rechazad[oa]|declined?|cancelad[oa]|no)\b/.test(t)) return 'declined';
        if (/\b(tentativ[oa]|maybe|tal vez|quizas|quiza)\b/.test(t)) return 'tentative';
        if (/\b(pendiente|pendente|pending|sin confirmar)\b/.test(t)) return 'pending';
        return '';
    }

    function parseAssistantDateHint(text = '') {
        const original = String(text || '').trim();
        if (!original) return '';
        const normalized = normalizeLooseText(original);
        if (/\b(hoy|today|hoje)\b/.test(normalized)) return formatISODate(new Date());
        if (/\b(pasado\s+manana|pasado\s+mañana|day\s+after\s+tomorrow|depois\s+de\s+amanha|depois\s+de\s+amanhã)\b/.test(normalized)) {
            return formatISODate(addDays(new Date(), 2));
        }
        if (/\b(manana|mañana|tomorrow|amanha|amanhã|dia siguiente|d[ií]a siguiente|next day)\b/.test(normalized)) {
            return formatISODate(addDays(new Date(), 1));
        }
        if (/\b(semana\s+que\s+viene|proxima\s+semana|pr[oó]xima\s+semana|next\s+week|proxima\s+semana)\b/.test(normalized)) {
            return formatISODate(addDays(new Date(), 7));
        }
        if (/\b(proximo\s+mes|pr[oó]ximo\s+mes|next\s+month|mes\s+que\s+viene)\b/.test(normalized)) {
            const d = new Date();
            d.setMonth(d.getMonth() + 1);
            return formatISODate(d);
        }
        const dateMatch = original.match(/\b(\d{4}-\d{2}-\d{2})\b/);
        return dateMatch ? dateMatch[1] : '';
    }

    function hasFutureDateIntentHint(text = '') {
        const t = normalizeLooseText(text);
        if (!t) return false;
        return /(manana|mañana|pasado manana|pasado mañana|tomorrow|next day|day after tomorrow|amanha|amanhã|depois de amanha|depois de amanhã|proxima semana|próxima semana|next week|proximo mes|próximo mes|next month|a futuro|future|futuro|la semana que viene|mes que viene)/.test(t);
    }

    function normalizeCreateActionDateForFuture(action = {}, userText = '') {
        const rawDate = String(action?.date || '').trim();
        if (!rawDate) return action;

        const parsed = parseLocalDate(rawDate);
        if (!parsed) return action;

        const userRelativeDate = parseAssistantDateHint(userText);
        if (userRelativeDate) {
            return {
                ...action,
                date: userRelativeDate,
            };
        }

        if (!hasFutureDateIntentHint(userText)) return action;

        const today = new Date();
        const todayFloor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        if (parsed >= todayFloor) return action;

        const rolled = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
        let guard = 0;
        while (rolled < todayFloor && guard < 6) {
            rolled.setFullYear(rolled.getFullYear() + 1);
            guard += 1;
        }

        return {
            ...action,
            date: formatISODate(rolled),
        };
    }

    function parseAssistantTimeHint(text = '') {
        const original = String(text || '').trim();
        if (!original) return '';
        const hhmm = original.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
        if (hhmm) return `${String(hhmm[1]).padStart(2, '0')}:${hhmm[2]}`;

        const hourMatch = original.match(/(?:a\s+las|a\s+la|at|às|as)\s*([01]?\d|2[0-3])\b/i);
        if (hourMatch) return `${String(hourMatch[1]).padStart(2, '0')}:00`;
        return '';
    }

    function parseAssistantRescheduleFromText(text = '') {
        const original = String(text || '').trim();
        if (!original || !isAssistantRescheduleIntent(original)) return null;

        const isoDates = Array.from(original.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)).map(m => m[1]);
        const hhmmTimes = Array.from(original.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g))
            .map(m => `${String(m[1]).padStart(2, '0')}:${m[2]}`);

        const inferredDate = parseAssistantDateHint(original);
        const inferredTime = parseAssistantTimeHint(original);

        const targetDate = isoDates.length >= 2 ? isoDates[0] : '';
        const targetStart = hhmmTimes.length >= 2 ? hhmmTimes[0] : '';
        const newDate = isoDates.length >= 2 ? isoDates[isoDates.length - 1] : inferredDate;
        const newStart = hhmmTimes.length >= 2 ? hhmmTimes[hhmmTimes.length - 1] : inferredTime;

        if (!newStart && !newDate) return null;

        const titleMatch = original.match(/(?:reprograma(?:r)?|reagenda(?:r)?|mueve?|cambia(?:r)?(?:\s+el\s+horario)?|reschedule)(?:\s+|[:.,;-])+(?:el|la)?\s*(?:evento\s*)?(?:de\s*)?(.+?)(?:\s+(?:para|to)\b|$)/i);
        const title = stripLeadingCommandWords(String(titleMatch?.[1] || '').trim());
        if (!title) return null;

        return {
            action: 'reschedule_event',
            title,
            ...(newDate ? { new_date: newDate } : {}),
            ...(newStart ? { new_start: newStart } : {}),
            ...(targetDate ? { target_date: targetDate } : {}),
            ...(targetStart ? { target_start: targetStart } : {}),
        };
    }

    function parseAssistantDeleteFromText(text = '') {
        const original = String(text || '').trim();
        if (!original || !isAssistantDeleteIntent(original)) return null;

        const date = parseAssistantDateHint(original);
        const start = parseAssistantTimeHint(original);
        const titleMatch = original.match(/(?:elimina(?:r)?|borra(?:r)?|cancela(?:r)?|delete|remove)\s+(?:el|la)?\s*(?:evento\s*)?(?:de\s*)?(.+?)(?:\s+(?:para|de|del|el|la)\b|$)/i);
        const title = String(titleMatch?.[1] || '').trim();
        if (!title) return null;

        return {
            action: 'delete_event',
            title,
            ...(date ? { date } : {}),
            ...(start ? { start } : {}),
        };
    }

    function parseAssistantAttendanceFromText(text = '') {
        const original = String(text || '').trim();
        if (!original) return null;

        const attendance = parseAttendanceFromText(original);
        if (!attendance) return null;

        const titleMatch = original.match(/(?:confirma(?:r)?(?:\s+asistencia)?|marcar?\s+(?:como\s+)?(?:pendiente|confirmad[oa]|tentativ[oa]|no\s+asiste)|set\s+attendance\s+to\s+\w+)\s+(?:el|la)?\s*(?:evento\s*)?(?:de\s*)?(.+?)(?:\s+(?:para|de|del|el|la)\b|$)/i);
        const title = String(titleMatch?.[1] || '').trim();
        if (!title) return null;

        const date = parseAssistantDateHint(original);
        const start = parseAssistantTimeHint(original);
        return {
            action: 'set_attendance',
            title,
            attendance,
            ...(date ? { date } : {}),
            ...(start ? { start } : {}),
        };
    }

    function parseAssistantCreateFromText(text = '') {
        const original = String(text || '').trim();
        if (!original || !isAssistantCreateIntent(original)) return null;
        if (isAssistantRescheduleIntent(original)) return null;

        const lower = original.toLowerCase();

        let date = '';
        if (/\bhoy\b|\btoday\b|\bhoje\b/i.test(lower)) {
            date = formatISODate(new Date());
        } else if (/\bmañana\b|\bmanana\b|\btomorrow\b|\bamanh[ãa]\b/i.test(lower)) {
            date = formatISODate(addDays(new Date(), 1));
        } else {
            const dateMatch = original.match(/\b(\d{4}-\d{2}-\d{2})\b/);
            if (dateMatch) date = dateMatch[1];
        }

        let start = '';
        const hhmm = original.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
        if (hhmm) {
            start = `${String(hhmm[1]).padStart(2, '0')}:${hhmm[2]}`;
        } else {
            const hourMatch = original.match(/(?:a\s+las|a\s+la|at|às|as)\s*([01]?\d|2[0-3])\b/i);
            if (hourMatch) {
                start = `${String(hourMatch[1]).padStart(2, '0')}:00`;
            }
        }

        let title = '';
        const titleMatch = original.match(/(?:llamad[oa]|titulad[oa]|title|named)\s+(.+)$/i);
        if (titleMatch?.[1]) {
            title = stripLeadingCommandWords(titleMatch[1].trim());
        } else {
            const cleaned = original
                .replace(/^(?:crear|crea|agendar|agenda|programar|programa|add|create|schedule|criar)(?:\s+|[:.,;-])+/i, '')
                .replace(/\b(hoy|mañana|manana|today|tomorrow|hoje|amanhã|amanha)\b/ig, '')
                .replace(/(?:a\s+las|a\s+la|at|às|as)\s*([01]?\d|2[0-3])(?::([0-5]\d))?/ig, '')
                .replace(/\b(\d{4}-\d{2}-\d{2})\b/g, '')
                .replace(/\s+/g, ' ')
                .trim();
            title = stripLeadingCommandWords(cleaned) || 'Evento';
        }

        if (!date || !start) return null;

        return {
            action: 'create_event',
            title,
            date,
            start,
            duration_minutes: 60,
            description: '',
            color: '#2563eb',
        };
    }

    function getAvailableTtsProvidersForHelp() {
        return Object.keys(ASSISTANT_TTS_PROVIDERS || {})
            .filter(Boolean)
            .join(', ');
    }

    function detectAssistantManualTopic(text = '') {
        const t = normalizeLooseText(text);
        if (!t) return null;

        const asksProvider = (
            /(proveedor|provider|provedor|motor)/.test(t)
            && /(\btts\b|voz|voice|elevenlabs|openai|google)/.test(t)
        ) || /(ttsprovider|\/ttsprovider)/.test(t);
        const asksApiKey = /(api key|apikey|key|clave|token)/.test(t) && /(tts|voz|voice|stt|proveedor|provider|deepseek|openai|google|elevenlabs)/.test(t);
        const asksVoice = (
            /(voz|voice|ttsvoice|ttsfemale|ttsmale)/.test(t)
            && /(cambiar|change|trocar|set|usar|use|comando|manual|como|how)/.test(t)
        ) || /(\/ttsvoice|\/ttsfemale|\/ttsmale)/.test(t);
        const asksManualEvents = /(manual|formulario|editar|edito|edicion|edicion|agregar|anadir|añadir|crear|evento|evento manual|evento manualmente|edit event|add event)/.test(t)
            && /(manualmente|manual|formulario|pantalla|lista|calendario|editar|agregar|anadir|añadir|crear)/.test(t);
        const asksGeneralHelp = /(ayuda|help|manual|comandos|como usar|como se usa|que puedo preguntar|que puedes hacer|consulta)/.test(t);

        if (asksProvider || asksApiKey) return 'tts-provider';
        if (asksVoice) return 'tts-voice';
        if (asksManualEvents) return 'events-manual';
        if (asksGeneralHelp) return 'general-manual';
        return null;
    }

    function buildAssistantManualReply(topic = '') {
        const providers = getAvailableTtsProvidersForHelp();
        const lang = String(assistantLocale || 'es').slice(0, 2);

        const dict = {
            es: {
                'tts-provider': `Puedes cambiar el proveedor TTS desde este chat, sin sección de configuración. Proveedores disponibles: ${providers}. Comandos: /ttsprovider <proveedor> y /ttskey <proveedor> <api_key>. Ejemplo: /ttsprovider openai. Luego: /ttskey openai TU_API_KEY. También puedes usar /ttskey TU_API_KEY para el proveedor TTS actual.`,
                'tts-voice': 'Para cambiar la voz TTS usa /ttsvoice <voice_id>. Atajos de género: /ttsfemale y /ttsmale. Si necesitas voz específica de ElevenLabs, primero define proveedor/key y luego aplica /ttsvoice con el ID de voz.',
                'events-manual': 'Para agregar eventos manualmente: completa título, fecha, inicio, fin y guarda. Para editar: toca/clic en un evento de la lista o calendario, se carga en el formulario, modifica y actualiza. Para eliminar: usa el botón eliminar del evento.',
                'general-manual': `Puedo ayudarte con manual rápido de la app. Ejemplos: “cómo cambiar proveedor TTS”, “qué proveedores TTS hay”, “cómo cargar API key”, “cómo cambiar voz TTS”, “cómo agregar/editar eventos manualmente”. Comandos útiles: /ttsprovider <proveedor>, /ttskey <proveedor> <api_key>, /ttsvoice <voice_id>, /ttsfemale, /ttsmale.`
            },
            en: {
                'tts-provider': `You can change the TTS provider from this chat (no settings screen). Available providers: ${providers}. Commands: /ttsprovider <provider> and /ttskey <provider> <api_key>. Example: /ttsprovider openai, then /ttskey openai YOUR_API_KEY. You can also use /ttskey YOUR_API_KEY for the current provider.`,
                'tts-voice': 'To change TTS voice use /ttsvoice <voice_id>. Gender shortcuts: /ttsfemale and /ttsmale. For a specific ElevenLabs voice, set provider/key first and then run /ttsvoice with the voice ID.',
                'events-manual': 'To add events manually: fill title, date, start, end and save. To edit: click an event in the list/calendar, update fields in the form, then save update. To delete: use the event delete button.',
                'general-manual': 'I can answer quick app manual questions. Ask: “how to change TTS provider”, “which TTS providers are available”, “how to set API key”, “how to change TTS voice”, or “how to add/edit events manually”. Useful commands: /ttsprovider <provider>, /ttskey <provider> <api_key>, /ttsvoice <voice_id>, /ttsfemale, /ttsmale.'
            },
            pt: {
                'tts-provider': `Você pode trocar o provedor TTS por este chat (sem tela de configurações). Provedores disponíveis: ${providers}. Comandos: /ttsprovider <provedor> e /ttskey <provedor> <api_key>. Exemplo: /ttsprovider openai e depois /ttskey openai SUA_API_KEY. Também funciona /ttskey SUA_API_KEY para o provedor atual.`,
                'tts-voice': 'Para trocar a voz TTS use /ttsvoice <voice_id>. Atalhos de gênero: /ttsfemale e /ttsmale. Para voz específica do ElevenLabs, ajuste provedor/chave e depois use /ttsvoice com o ID da voz.',
                'events-manual': 'Para adicionar eventos manualmente: preencha título, data, início, fim e salve. Para editar: clique/toque no evento na lista/calendário, ajuste os campos do formulário e atualize. Para excluir: use o botão de excluir do evento.',
                'general-manual': 'Posso responder dúvidas rápidas do manual do app. Pergunte: “como trocar provedor TTS”, “quais provedores TTS existem”, “como inserir API key”, “como trocar voz TTS” ou “como adicionar/editar eventos manualmente”. Comandos úteis: /ttsprovider <provedor>, /ttskey <provedor> <api_key>, /ttsvoice <voice_id>, /ttsfemale, /ttsmale.'
            }
        };

        return dict[lang]?.[topic] || dict.es[topic] || '';
    }

    function getAssistantManualHelp(text = '') {
        const topic = detectAssistantManualTopic(text);
        if (!topic) return '';
        return buildAssistantManualReply(topic);
    }

    function ttsSetupText(key, vars = {}) {
        const lang = String(assistantLocale || 'es').slice(0, 2);
        const dict = {
            es: {
                askProvider: 'Perfecto, te ayudo a cambiar el proveedor TTS. Proveedores disponibles: {{providers}}. ¿Cuál quieres usar?',
                askApiKey: 'Genial, usaré {{provider}}. Ahora indícame la API key de ese proveedor.',
                invalidProvider: 'No reconocí ese proveedor. Opciones válidas: {{providers}}.',
                apiKeySaved: 'Listo ✅ Guardé la API key de {{provider}} y quedó como proveedor TTS activo.',
                apiKeyMissing: 'No detecté una API key válida. Escríbela directamente o usa: /ttskey {{provider}} TU_API_KEY',
                setupCancelled: 'Configuración TTS cancelada.',
            },
            en: {
                askProvider: 'Great, I can help you change the TTS provider. Available providers: {{providers}}. Which one do you want?',
                askApiKey: 'Great, I will use {{provider}}. Now please provide the API key for that provider.',
                invalidProvider: 'I could not recognize that provider. Valid options: {{providers}}.',
                apiKeySaved: 'Done ✅ I saved the API key for {{provider}} and set it as active TTS provider.',
                apiKeyMissing: 'I could not detect a valid API key. Type it directly or use: /ttskey {{provider}} YOUR_API_KEY',
                setupCancelled: 'TTS setup cancelled.',
            },
            pt: {
                askProvider: 'Perfeito, te ajudo a trocar o provedor TTS. Provedores disponíveis: {{providers}}. Qual você quer usar?',
                askApiKey: 'Ótimo, vou usar {{provider}}. Agora informe a API key desse provedor.',
                invalidProvider: 'Não reconheci esse provedor. Opções válidas: {{providers}}.',
                apiKeySaved: 'Pronto ✅ Salvei a API key de {{provider}} e defini como provedor TTS ativo.',
                apiKeyMissing: 'Não detectei uma API key válida. Digite diretamente ou use: /ttskey {{provider}} SUA_API_KEY',
                setupCancelled: 'Configuração de TTS cancelada.',
            }
        };
        const template = (dict[lang] && dict[lang][key]) || dict.es[key] || key;
        return Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{{${k}}}`, String(v ?? '')), template);
    }

    function getTtsProviderListLabel() {
        const list = Object.keys(ASSISTANT_TTS_PROVIDERS || {}).filter(Boolean);
        return list.join(', ');
    }

    function extractProviderFromFreeText(text = '') {
        const normalized = normalizeLooseText(text);
        const tokens = normalized.split(' ').filter(Boolean);
        for (const token of tokens) {
            const provider = normalizeTtsProviderValue(token);
            if (provider) return provider;
        }
        return normalizeTtsProviderValue(text);
    }

    function extractTtsApiKeyInput(text = '', preferredProvider = '') {
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

    function shouldStartTtsSetupFlow(text = '') {
        if (!text || String(text).trim().startsWith('/')) return false;
        return detectAssistantManualTopic(text) === 'tts-provider';
    }

    function shouldShowAssistantWelcome() {
        if (!assistantMessages.length) return true;
        try {
            const current = String(localStorage.getItem(ASSISTANT_WELCOME_VERSION_KEY) || '').trim();
            return current !== ASSISTANT_WELCOME_VERSION;
        } catch (_e) {
            return false;
        }
    }

    function markAssistantWelcomeSeen() {
        try {
            localStorage.setItem(ASSISTANT_WELCOME_VERSION_KEY, ASSISTANT_WELCOME_VERSION);
        } catch (_e) {
            // no-op
        }
    }

    function assistantShortText(key, vars = {}) {
        const lang = String(assistantLocale || 'es').slice(0, 2);
        const dict = {
            es: {
                confirmDelete: '¿Confirmas eliminar este evento? Responde "sí" para confirmar o "no" para cancelar.\n- {{event}}',
                confirmUpdate: '¿Confirmas actualizar este evento? Responde "sí" para confirmar o "no" para cancelar.\nAntes: {{before}}\nDespués: {{after}}',
                pendingNeedDecision: 'Hay una acción pendiente. Responde "sí" para confirmar o "no" para cancelar.',
                actionCancelled: 'Acción cancelada.',
                eventNotFound: 'No encontré un evento que coincida con tu solicitud.',
                eventAmbiguous: 'Encontré varios eventos posibles. Indica más detalle (fecha/hora) o usa el formulario para seleccionar uno.\n{{options}}',
                eventUpdated: 'Evento actualizado: {{event}}',
                eventDeleted: 'Evento eliminado: {{event}}',
                rescheduleConflict: 'Ese horario entra en conflicto con: {{conflicts}}\nSugerencias: {{suggestions}}',
                rescheduleNoSuggestion: 'Ese horario entra en conflicto y no encontré huecos cercanos. Indica otra fecha/hora.',
                attendanceUpdated: 'Asistencia actualizada: {{event}} · {{status}}',
                attendanceInvalid: 'No entendí el estado de asistencia. Usa: pendiente, confirmado, tentativo o no asiste.',
            },
            en: {
                confirmDelete: 'Do you confirm deleting this event? Reply "yes" to confirm or "no" to cancel.\n- {{event}}',
                confirmUpdate: 'Do you confirm updating this event? Reply "yes" to confirm or "no" to cancel.\nBefore: {{before}}\nAfter: {{after}}',
                pendingNeedDecision: 'There is a pending action. Reply "yes" to confirm or "no" to cancel.',
                actionCancelled: 'Action cancelled.',
                eventNotFound: 'I could not find a matching event for your request.',
                eventAmbiguous: 'I found multiple possible events. Please provide more detail (date/time) or use the form to pick one.\n{{options}}',
                eventUpdated: 'Event updated: {{event}}',
                eventDeleted: 'Event deleted: {{event}}',
                rescheduleConflict: 'That time conflicts with: {{conflicts}}\nSuggestions: {{suggestions}}',
                rescheduleNoSuggestion: 'That time conflicts and I could not find nearby free slots. Please provide another date/time.',
                attendanceUpdated: 'Attendance updated: {{event}} · {{status}}',
                attendanceInvalid: 'I could not understand the attendance status. Use: pending, confirmed, tentative, or declined.',
            },
            pt: {
                confirmDelete: 'Você confirma excluir este evento? Responda "sim" para confirmar ou "não" para cancelar.\n- {{event}}',
                confirmUpdate: 'Você confirma atualizar este evento? Responda "sim" para confirmar ou "não" para cancelar.\nAntes: {{before}}\nDepois: {{after}}',
                pendingNeedDecision: 'Há uma ação pendente. Responda "sim" para confirmar ou "não" para cancelar.',
                actionCancelled: 'Ação cancelada.',
                eventNotFound: 'Não encontrei um evento correspondente ao seu pedido.',
                eventAmbiguous: 'Encontrei vários eventos possíveis. Informe mais detalhes (data/hora) ou use o formulário para selecionar um.\n{{options}}',
                eventUpdated: 'Evento atualizado: {{event}}',
                eventDeleted: 'Evento excluído: {{event}}',
                rescheduleConflict: 'Esse horário conflita com: {{conflicts}}\nSugestões: {{suggestions}}',
                rescheduleNoSuggestion: 'Esse horário conflita e não encontrei horários livres próximos. Informe outra data/hora.',
                attendanceUpdated: 'Presença atualizada: {{event}} · {{status}}',
                attendanceInvalid: 'Não entendi o status de presença. Use: pendente, confirmado, tentativo ou recusado.',
            }
        };
        const template = (dict[lang] && dict[lang][key]) || dict.es[key] || key;
        return Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{{${k}}}`, String(v ?? '')), template);
    }

    function normalizeLooseText(value = '') {
        return String(value || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function titleMatchesLoose(eventTitle = '', requestedTitle = '') {
        const evTitle = normalizeLooseText(eventTitle);
        const reqTitle = normalizeLooseText(requestedTitle);
        if (!evTitle || !reqTitle) return false;

        if (evTitle === reqTitle || evTitle.includes(reqTitle) || reqTitle.includes(evTitle)) {
            return true;
        }

        const evTokens = new Set(evTitle.split(' ').filter(Boolean));
        const reqTokens = reqTitle.split(' ').filter(Boolean);
        if (!evTokens.size || !reqTokens.length) return false;

        const relevantReqTokens = reqTokens.filter(t => t.length >= 3);
        const source = relevantReqTokens.length ? relevantReqTokens : reqTokens;
        const overlap = source.filter(t => evTokens.has(t)).length;
        if (!source.length) return false;
        return overlap >= Math.min(2, source.length);
    }

    function isAssistantConfirmText(text = '') {
        const t = normalizeLooseText(text);
        return /^(si|yes|y|ok|dale|confirmo|confirmar|confirm|sim)\b/.test(t);
    }

    function isAssistantCancelText(text = '') {
        const t = normalizeLooseText(text);
        return /^(no|cancel|cancelar|negar|nao|não)\b/.test(t);
    }

    function formatEventLine(ev = {}) {
        const title = String(ev.title || 'Evento').trim();
        const date = String(ev.date || '').trim();
        const start = String(ev.start || '').trim();
        const end = String(ev.end || '').trim();
        const attendance = getAttendanceLabel(ev.attendance);
        return `${date} ${start}-${end} ${title} [${attendance}]`.trim();
    }

    function getAttendanceFromAction(action = {}) {
        return normalizeAttendanceStatus(
            action.attendance
            || action.attendance_status
            || action.rsvp
            || action.status,
            ''
        );
    }

    function resolveActionCandidates(action = {}, events = []) {
        if (!Array.isArray(events) || !events.length) return [];
        const target = action.target || action.where || {};

        const id = String(action.event_id || action.id || target.id || '').trim();
        if (id) {
            return events.filter(ev => String(ev.id) === id);
        }

        const title = normalizeLooseText(
            action.title
            || action.event_title
            || action.event
            || action.name
            || action.target_title
            || target.title
            || target.event_title
            || target.event
            || target.name
            || ''
        );

        const rawTargetDate = String(
            action.target_date
            || action.current_date
            || target.date
            || target.current_date
            || ''
        ).trim();
        const rawDate = rawTargetDate || String(action.date || '').trim();
        const parsedDate = parseAssistantDateHint(rawDate);
        const date = /^\d{4}-\d{2}-\d{2}$/.test(parsedDate)
            ? parsedDate
            : (/^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : '');

        const rawTargetStart = String(
            action.target_start
            || action.current_start
            || target.start
            || target.current_start
            || ''
        ).trim();
        const rawStart = rawTargetStart || String(action.start || '').trim();
        const parsedStart = parseAssistantTimeHint(rawStart);
        const start = /^\d{2}:\d{2}$/.test(parsedStart)
            ? parsedStart
            : (/^\d{2}:\d{2}$/.test(rawStart) ? rawStart : '');

        if (!title && !date && !start) return [];

        const narrowIfAny = (list, predicate) => {
            const narrowed = list.filter(predicate);
            return narrowed.length ? narrowed : list;
        };

        let candidates = [...events];
        if (title) {
            candidates = candidates.filter(ev => titleMatchesLoose(ev.title || '', title));
        }
        if (date) {
            candidates = rawTargetDate
                ? candidates.filter(ev => String(ev.date || '') === date)
                : narrowIfAny(candidates, ev => String(ev.date || '') === date);
        }
        if (start) {
            candidates = rawTargetStart
                ? candidates.filter(ev => String(ev.start || '') === start)
                : narrowIfAny(candidates, ev => String(ev.start || '') === start);
        }
        return candidates;
    }

    function getUpdatePayloadFromAction(action = {}) {
        const explicit = action.updates || action.set || action.changes || {};
        const normalizedDate = parseAssistantDateHint(
            action.new_date
            || explicit.date
            || ''
        );
        const fromRoot = {
            title: action.new_title,
            date: normalizedDate || action.new_date,
            start: action.new_start,
            end: action.new_end,
            description: action.new_description,
            color: action.new_color,
            reminder_offset: action.reminder_offset,
            duration_minutes: action.duration_minutes,
            attendance: action.new_attendance || action.attendance || action.attendance_status || action.status,
        };
        const merged = {
            ...fromRoot,
            ...explicit,
        };

        if (merged.date) {
            const normalized = parseAssistantDateHint(merged.date);
            if (normalized) merged.date = normalized;
        }

        Object.keys(merged).forEach((k) => {
            if (merged[k] === undefined || merged[k] === null || merged[k] === '') {
                delete merged[k];
            }
        });
        return merged;
    }

    function buildUpdateCandidate(event, action) {
        const updates = getUpdatePayloadFromAction(action);
        const merged = {
            ...event,
            ...updates,
        };

        const hasStartUpdate = typeof updates.start === 'string' && updates.start.trim() !== '';
        const hasEndUpdate = typeof updates.end === 'string' && updates.end.trim() !== '';
        const currentDuration = (() => {
            const [sh, sm] = String(event.start || '').split(':').map(Number);
            const [eh, em] = String(event.end || '').split(':').map(Number);
            if (![sh, sm, eh, em].every(Number.isFinite)) return 60;
            const startMin = (sh * 60) + sm;
            const endMin = (eh * 60) + em;
            return endMin > startMin ? (endMin - startMin) : 60;
        })();

        if (hasStartUpdate && !hasEndUpdate) {
            const preferredDuration = Number(updates.duration_minutes);
            const duration = Number.isFinite(preferredDuration) && preferredDuration > 0
                ? preferredDuration
                : currentDuration;
            const inferredEnd = inferEndFromStart(merged.start, duration);
            if (inferredEnd) merged.end = inferredEnd;
        }

        const validation = validateEventPayload({
            title: merged.title,
            date: merged.date,
            start: merged.start,
            end: merged.end,
            description: merged.description,
            color: merged.color,
            reminder_offset: merged.reminder_offset,
            duration_minutes: updates.duration_minutes,
        }, assistantLocale);

        if (!validation.ok) {
            return { ok: false, error: validation.error };
        }

        return {
            ok: true,
            nextEvent: {
                ...event,
                ...validation.data,
                attendance: normalizeAttendanceStatus(merged.attendance, event.attendance || 'pending'),
                id: event.id,
            }
        };
    }

    function applyAssistantPendingAction() {
        if (!assistantPendingAction) return null;

        const pending = assistantPendingAction;
        const events = getEvents();
        const index = events.findIndex(ev => ev.id === pending.eventId);
        if (index === -1) {
            assistantPendingAction = null;
            return assistantShortText('eventNotFound');
        }

        if (pending.type === 'delete') {
            const current = events[index];
            const filtered = events.filter(ev => ev.id !== current.id);
            saveEvents(filtered);
            renderAll();
            try { notifier.cancelFor(current.id); } catch (e) { console.warn('Cancel failed', e); }
            assistantPendingAction = null;
            return assistantShortText('eventDeleted', { event: formatEventLine(current) });
        }

        if (pending.type === 'update') {
            events[index] = pending.nextEvent;
            saveEvents(events);
            renderAll();
            assistantPendingAction = null;
            return assistantShortText('eventUpdated', { event: formatEventLine(events[index]) });
        }

        assistantPendingAction = null;
        return null;
    }

    function sanitizeAssistantErrorMessage(message = '') {
        const raw = String(message || '').trim();
        if (!raw) return tr('assistant.contactError');
        return raw
            // evita exponer tokens completos (ej: sk-xxxx...)
            .replace(/\b(?:sk|dsk|api)[-_][A-Za-z0-9_-]{10,}\b/gi, '[API_KEY]')
            // evita exponer sufijos mostrados por algunos proveedores
            .replace(/(ending\s+(?:in|with)\s+)[A-Za-z0-9_-]{2,}/gi, '$1****');
    }

    function isInvalidApiKeyError(message = '') {
        const raw = String(message || '');
        return /(invalid[\s_-]*api[\s_-]*key|api[\s_-]*key[\s_-]*invalid|unauthorized|\b401\b|invalid_auth|authentication)/i.test(raw);
    }

    async function handleAssistantSubmit(evt) {
        evt.preventDefault();
        if (!assistantInput) return;
        const text = assistantInput.value.trim();
        if (!text) return;

        if (assistantPendingTtsSetup) {
            appendAssistantMessage({ role: 'user', content: text });
            assistantInput.value = '';

            if (isAssistantCancelText(text)) {
                assistantPendingTtsSetup = null;
                const msg = ttsSetupText('setupCancelled');
                appendAssistantMessage({ role: 'assistant', content: msg });
                setAssistantStatus(msg);
                await speakAssistantText(msg);
                return;
            }

            if (assistantPendingTtsSetup.step === 'provider') {
                const provider = extractProviderFromFreeText(text);
                if (!provider) {
                    const msg = ttsSetupText('invalidProvider', { providers: getTtsProviderListLabel() });
                    appendAssistantMessage({ role: 'assistant', content: msg });
                    setAssistantStatus(msg);
                    await speakAssistantText(msg);
                    return;
                }

                saveAssistantTtsProvider(provider);
                assistantPendingTtsSetup = { step: 'apiKey', provider };
                const msg = ttsSetupText('askApiKey', { provider });
                appendAssistantMessage({ role: 'assistant', content: msg });
                setAssistantStatus(msg);
                await speakAssistantText(msg);
                return;
            }

            if (assistantPendingTtsSetup.step === 'apiKey') {
                const fallbackProvider = normalizeTtsProviderValue(assistantPendingTtsSetup.provider || assistantTtsProvider || 'elevenlabs') || 'elevenlabs';
                const parsed = extractTtsApiKeyInput(text, fallbackProvider);
                const provider = normalizeTtsProviderValue(parsed.provider || fallbackProvider) || fallbackProvider;
                const key = saveApiKeyByProvider(provider, parsed.key);

                if (!key) {
                    const msg = ttsSetupText('apiKeyMissing', { provider });
                    appendAssistantMessage({ role: 'assistant', content: msg });
                    setAssistantStatus(msg);
                    await speakAssistantText(msg);
                    return;
                }

                saveAssistantTtsProvider(provider);
                assistantPendingTtsSetup = null;
                const msg = ttsSetupText('apiKeySaved', { provider });
                appendAssistantMessage({ role: 'assistant', content: msg });
                setAssistantStatus(msg);
                await speakAssistantText(msg);
                return;
            }
        }

        const apiKeyCmd = text.match(/^\/(?:apikey|api_key)\s+(.+)$/i);
        if (apiKeyCmd) {
            const key = saveAndroidAssistantApiKey(apiKeyCmd[1]);
            assistantInput.value = '';
            appendAssistantMessage({ role: 'assistant', content: key ? tr('assistant.apiKeySaved') : tr('assistant.apiKeyMissing') });
            setAssistantStatus(key ? tr('assistant.apiKeySaved') : tr('assistant.apiKeyMissing'));
            return;
        }

        const ttsApiKeyCmd = text.match(/^\/(?:ttskey|elevenlabs_key)\s+(.+)$/i);
        if (ttsApiKeyCmd) {
            const cfg = getAssistantConfig();
            const selectedProvider = normalizeTtsProviderValue(cfg.ttsProvider || 'elevenlabs') || 'elevenlabs';
            const key = saveApiKeyByProvider(selectedProvider, ttsApiKeyCmd[1]);
            if (key && assistantPendingTtsSetup?.step === 'apiKey') assistantPendingTtsSetup = null;
            assistantInput.value = '';
            appendAssistantMessage({ role: 'assistant', content: key ? tr('assistant.ttsApiKeySaved') : tr('assistant.ttsApiKeyMissing') });
            setAssistantStatus(key ? tr('assistant.ttsApiKeySaved') : tr('assistant.ttsApiKeyMissing'));
            return;
        }

        const ttsApiKeyProviderCmd = text.match(/^\/(?:ttskey|elevenlabs_key)\s+(elevenlabs|fish|openai|google|11labs)\s+(.+)$/i);
        if (ttsApiKeyProviderCmd) {
            const provider = normalizeTtsProviderValue(ttsApiKeyProviderCmd[1]);
            const key = saveApiKeyByProvider(provider, ttsApiKeyProviderCmd[2]);
            if (key && assistantPendingTtsSetup?.step === 'apiKey') assistantPendingTtsSetup = null;
            assistantInput.value = '';
            const msg = key
                ? tr('assistant.ttsApiKeySavedProvider', { provider })
                : tr('assistant.ttsApiKeyMissing');
            appendAssistantMessage({ role: 'assistant', content: msg });
            setAssistantStatus(msg);
            return;
        }

        const ttsProviderCmd = text.match(/^\/(?:ttsprovider)\s+(.+)$/i);
        if (ttsProviderCmd) {
            const provider = saveAssistantTtsProvider(ttsProviderCmd[1]);
            if (provider) {
                assistantPendingTtsSetup = { step: 'apiKey', provider };
            }
            assistantInput.value = '';
            const msg = provider
                ? tr('assistant.ttsProviderSaved', { provider })
                : tr('assistant.ttsProviderInvalid');
            appendAssistantMessage({ role: 'assistant', content: msg });
            setAssistantStatus(msg);
            return;
        }

        const sttProviderCmd = text.match(/^\/(?:sttprovider|stt)\s+(.+)$/i);
        if (sttProviderCmd) {
            const provider = saveAssistantSttProvider(sttProviderCmd[1]);
            assistantInput.value = '';
            const msg = provider
                ? tr('assistant.sttProviderSaved', { provider })
                : tr('assistant.sttProviderInvalid');
            appendAssistantMessage({ role: 'assistant', content: msg });
            setAssistantStatus(msg);
            return;
        }

        const sttKeyCmd = text.match(/^\/(?:sttkey)\s+(?:(elevenlabs|openai|google|11labs)\s+)?(.+)$/i);
        if (sttKeyCmd) {
            const cfg = getAssistantConfig();
            const provider = normalizeSttProviderValue(sttKeyCmd[1] || cfg.sttProvider || 'elevenlabs') || 'elevenlabs';
            const key = saveApiKeyByProvider(provider, sttKeyCmd[2]);
            assistantInput.value = '';
            const msg = key
                ? tr('assistant.sttApiKeySaved', { provider })
                : tr('assistant.sttApiKeyMissing');
            appendAssistantMessage({ role: 'assistant', content: msg });
            setAssistantStatus(msg);
            return;
        }

        const ttsVoiceCmd = text.match(/^\/(?:ttsvoice|voiceid)\s+(.+)$/i);
        if (ttsVoiceCmd) {
            const voice = saveAndroidAssistantTtsVoice(ttsVoiceCmd[1]);
            assistantInput.value = '';
            appendAssistantMessage({ role: 'assistant', content: voice ? tr('assistant.ttsVoiceSaved', { voice }) : tr('assistant.ttsVoiceMissing') });
            setAssistantStatus(voice ? tr('assistant.ttsVoiceSaved', { voice }) : tr('assistant.ttsVoiceMissing'));
            return;
        }

        const ttsFemaleCmd = text.match(/^\/(?:ttsfemale|voxfemenina|vozfemenina)$/i);
        if (ttsFemaleCmd) {
            const cfg = getAssistantConfig();
            const selectedProvider = normalizeTtsProviderValue(assistantTtsProvider || cfg.ttsProvider || 'auto') || 'auto';
            saveAssistantTtsGender('feminine');
            let voice = saveAndroidAssistantTtsVoice(ASSISTANT_ANDROID_FEMALE_TTS_VOICE);
            if (selectedProvider === 'fish') {
                cfg.androidTtsModel = ASSISTANT_FISH_DEFAULT_TTS_MODEL;
                cfg.androidTtsVoice = ASSISTANT_FISH_FEMALE_TTS_VOICE;
                saveAssistantConfig(cfg);
                voice = cfg.androidTtsVoice;
            }
            try { notifier.rescheduleAll(getEvents()); } catch (_e) { /* no-op */ }
            assistantInput.value = '';
            appendAssistantMessage({ role: 'assistant', content: tr('assistant.ttsFemaleVoiceSet', { voice }) });
            setAssistantStatus(tr('assistant.ttsFemaleVoiceSet', { voice }));
            return;
        }

        const ttsMaleCmd = text.match(/^\/(?:ttsmale|vozmasculina|voxmasculina)$/i);
        if (ttsMaleCmd) {
            const cfg = getAssistantConfig();
            const selectedProvider = normalizeTtsProviderValue(assistantTtsProvider || cfg.ttsProvider || 'auto') || 'auto';
            saveAssistantTtsGender('masculine');

            let currentVoice = '';
            if (selectedProvider === 'fish') {
                cfg.androidTtsModel = ASSISTANT_FISH_DEFAULT_TTS_MODEL;
                cfg.androidTtsVoice = ASSISTANT_FISH_MALE_TTS_VOICE;
            } else {
                cfg.androidTtsVoice = ASSISTANT_ANDROID_MALE_TTS_VOICE;
            }
            saveAssistantConfig(cfg);
            currentVoice = String(cfg.androidTtsVoice || '').trim();

            try { await notifier.rescheduleAll(getEvents()); } catch (_e) { /* no-op */ }

            assistantInput.value = '';
            appendAssistantMessage({ role: 'assistant', content: tr('assistant.ttsMaleVoiceSet', { voice: currentVoice }) });
            setAssistantStatus(tr('assistant.ttsMaleVoiceSet', { voice: currentVoice }));
            return;
        }

        if (assistantPendingAction) {
            appendAssistantMessage({ role: 'user', content: text });
            assistantInput.value = '';

            if (isAssistantCancelText(text)) {
                assistantPendingAction = null;
                const msg = assistantShortText('actionCancelled');
                appendAssistantMessage({ role: 'assistant', content: msg });
                setAssistantStatus(msg);
                return;
            }

            if (isAssistantConfirmText(text)) {
                const msg = applyAssistantPendingAction() || assistantShortText('eventNotFound');
                appendAssistantMessage({ role: 'assistant', content: msg });
                setAssistantStatus('');
                await speakAssistantText(msg);
                return;
            }

            const msg = assistantShortText('pendingNeedDecision');
            appendAssistantMessage({ role: 'assistant', content: msg });
            setAssistantStatus(msg);
            return;
        }

        appendAssistantMessage({ role: 'user', content: text });
        assistantInput.value = '';

        if (shouldStartTtsSetupFlow(text)) {
            const provider = extractProviderFromFreeText(text);
            let msg = '';

            if (provider) {
                saveAssistantTtsProvider(provider);
                assistantPendingTtsSetup = { step: 'apiKey', provider };
                msg = ttsSetupText('askApiKey', { provider });
            } else {
                assistantPendingTtsSetup = { step: 'provider' };
                msg = ttsSetupText('askProvider', { providers: getTtsProviderListLabel() });
            }

            appendAssistantMessage({ role: 'assistant', content: msg });
            setAssistantStatus(msg);
            await speakAssistantText(msg);
            setAssistantBusy(false);
            scrollAssistantBottom();
            return;
        }

        const localManualHelp = getAssistantManualHelp(text);
        if (localManualHelp) {
            appendAssistantMessage({ role: 'assistant', content: localManualHelp });
            await speakAssistantText(localManualHelp);
            setAssistantStatus('');
            setAssistantBusy(false);
            scrollAssistantBottom();
            return;
        }

        setAssistantStatus(tr('assistant.sending'));
        setAssistantBusy(true);

        const localRescheduleAction = parseAssistantRescheduleFromText(text);
        if (localRescheduleAction) {
            const actionResult = handleAssistantAction(JSON.stringify(localRescheduleAction), { userText: text });
            if (actionResult?.handled) {
                await speakAssistantText(actionResult.spokenText || '');
                setAssistantStatus('');
                setAssistantBusy(false);
                scrollAssistantBottom();
                return;
            }
        }

        const localCreateAction = parseAssistantCreateFromText(text);
        if (localCreateAction) {
            const actionResult = handleAssistantAction(JSON.stringify(localCreateAction), { userText: text });
            if (actionResult?.handled) {
                await speakAssistantText(actionResult.spokenText || '');
                setAssistantStatus('');
                setAssistantBusy(false);
                scrollAssistantBottom();
                return;
            }
        }

        const localDeleteAction = parseAssistantDeleteFromText(text);
        if (localDeleteAction) {
            const actionResult = handleAssistantAction(JSON.stringify(localDeleteAction), { userText: text });
            if (actionResult?.handled) {
                await speakAssistantText(actionResult.spokenText || '');
                setAssistantStatus('');
                setAssistantBusy(false);
                scrollAssistantBottom();
                return;
            }
        }

        const localAttendanceAction = parseAssistantAttendanceFromText(text);
        if (localAttendanceAction) {
            const actionResult = handleAssistantAction(JSON.stringify(localAttendanceAction), { userText: text });
            if (actionResult?.handled) {
                await speakAssistantText(actionResult.spokenText || '');
                setAssistantStatus('');
                setAssistantBusy(false);
                scrollAssistantBottom();
                return;
            }
        }

        // Consulta rápida local: eventos de hoy/semana/mes
        const quickRange = isAssistantCreateIntent(text) ? null : detectAssistantRange(text);
        if (quickRange) {
            const list = getEventsByRange(quickRange);
            const reply = formatAssistantEvents(list, quickRange);
            appendAssistantMessage({ role: 'assistant', content: reply });
            await speakAssistantText(reply);
            setAssistantStatus('');
            setAssistantBusy(false);
            scrollAssistantBottom();
            return;
        }

        let cfg = getAssistantConfig();
        const canUseBridgeStream = typeof window.appBridge?.chatStream === 'function' && typeof window.appBridge?.onAssistantChunk === 'function';
        const canUseBridgeChat = typeof window.appBridge?.chat === 'function';
        const canUseAndroidNativeChat = !canUseBridgeStream && !canUseBridgeChat && isAndroidRuntime();
        const shouldRequireAndroidManualKey = isAndroidRuntime() && canUseAndroidNativeChat;

        if (shouldRequireAndroidManualKey) {
            const key = ensureAndroidAssistantApiKey();
            if (!key) {
                const msg = tr('assistant.apiKeyMissing');
                appendAssistantMessage({ role: 'assistant', content: `⚠️ ${msg}` });
                setAssistantStatus(msg);
                setAssistantBusy(false);
                scrollAssistantBottom();
                return;
            }
            cfg = getAssistantConfig();
        }

        const messagesForApi = buildAssistantPayload();
        try {
            const requestId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
            const assistantMsg = { role: 'assistant', content: '', requestId };
            appendAssistantMessage(assistantMsg);
            let safetyTimer = null;

            let finalReply = '';
            if (canUseBridgeStream) {
                // Suscribir a los chunks de streaming
                assistantUnsubscribe?.();
                assistantUnsubscribe = window.appBridge.onAssistantChunk((data) => {
                    if (!data || data.requestId !== requestId) return;
                    if (data.delta) {
                        assistantMsg.content += data.delta;
                        renderAssistantMessages();
                    } else if (typeof data.content === 'string' && data.content.length > assistantMsg.content.length) {
                        // Fallback cuando el proveedor envía el texto completo en cada chunk
                        assistantMsg.content = data.content;
                        renderAssistantMessages();
                    }
                    if (data.done) {
                        setAssistantStatus('');
                        setAssistantBusy(false);
                        assistantUnsubscribe?.();
                        assistantUnsubscribe = null;
                        if (safetyTimer) clearTimeout(safetyTimer);
                    }
                    scrollAssistantBottom();
                });

                // Cortafuegos por si el streaming no termina nunca
                safetyTimer = setTimeout(() => {
                    setAssistantStatus(tr('assistant.noResponse'));
                    setAssistantBusy(false);
                    assistantUnsubscribe?.();
                    assistantUnsubscribe = null;
                    scrollAssistantBottom();
                }, 45000);

                try {
                    finalReply = await window.appBridge.chatStream({
                        messages: messagesForApi,
                        requestId,
                        provider: cfg.provider
                    });
                } catch (streamErr) {
                    console.error('assistant stream failed, fallback to non-stream', streamErr);
                    if (!canUseBridgeChat) throw streamErr;
                    setAssistantStatus(tr('assistant.streamFallback'));
                    // Fallback sin streaming para no dejar colgado el UI
                    finalReply = await window.appBridge.chat({
                        messages: messagesForApi,
                        provider: cfg.provider,
                        retry: true
                    });
                }
            } else if (canUseBridgeChat) {
                finalReply = await window.appBridge.chat({
                    messages: messagesForApi,
                    provider: cfg.provider,
                    retry: false
                });
            } else if (canUseAndroidNativeChat) {
                const androidApiKey = String(cfg.androidApiKey || '').trim();
                if (!androidApiKey) throw new Error('NO_API_KEY');
                finalReply = await callAssistantAndroid(messagesForApi, { provider: cfg.provider });
            } else {
                if (isAndroidRuntime()) {
                    finalReply = await callAssistantAndroid(messagesForApi, { provider: cfg.provider });
                } else {
                    throw new Error(tr('assistant.mobileFallback'));
                }
            }

            if (safetyTimer) clearTimeout(safetyTimer);
            if (!assistantMsg.content) {
                assistantMsg.content = finalReply || tr('assistant.noResponse');
                renderAssistantMessages();
            }
            const actionResult = handleAssistantAction(assistantMsg.content, { messageRef: assistantMsg, userText: text });
            if (actionResult?.handled) {
                await speakAssistantText(actionResult.spokenText || '');
            } else {
                await speakAssistantText(assistantMsg.content);
            }
            setAssistantStatus('');
        } catch (err) {
            console.error('assistant error', err);
            const rawMsg = err?.message || tr('assistant.contactError');
            const sanitized = sanitizeAssistantErrorMessage(rawMsg);
            const msg = /NO_API_KEY|Falta API key/i.test(rawMsg)
                ? (isAndroidRuntime() ? tr('assistant.apiKeyMissing') : tr('assistant.missingApiKey'))
                : isInvalidApiKeyError(rawMsg)
                    ? tr('assistant.invalidApiKey')
                    : sanitized;
            appendAssistantMessage({ role: 'assistant', content: `⚠️ ${msg}` });
            setAssistantStatus(msg);
        } finally {
            assistantUnsubscribe = null;
            setAssistantBusy(false);
            scrollAssistantBottom();
        }
    }

    function appendAssistantMessage(message) {
        assistantMessages.push(message);
        renderAssistantMessages();
        saveAssistantHistory();
    }

    function renderAssistantMessages() {
        if (!assistantThread) return;
        assistantThread.innerHTML = '';
        assistantMessages.slice(-20).forEach((msg) => {
            const div = document.createElement('div');
            div.className = `assistant-msg assistant-msg--${msg.role}`;
            div.textContent = msg.role === 'assistant'
                ? toPlainAssistantText(msg.content)
                : String(msg.content || '');
            assistantThread.appendChild(div);
        });
    }

    function buildAssistantPayload() {
        const history = assistantMessages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .slice(-12);
        const context = buildAssistantContext();
        const now = new Date();
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
        const nowIso = `${formatISODate(now)} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const base = [{ role: 'system', content: assistantSystemPrompt }];
        base.push({ role: 'system', content: `Current local date/time: ${nowIso} (${timezone}). Use this as reference for relative dates like hoy/mañana/tomorrow.` });
        if (context) base.push({ role: 'system', content: context });
        return [...base, ...history];
    }

    function handleAssistantAction(content = '', { messageRef, userText = '' } = {}) {
        const action = extractAssistantAction(content);
        if (!action) return { handled: false };

        if (action.action === 'confirm_attendance') {
            return handleAssistantAction(JSON.stringify({ ...action, action: 'set_attendance', attendance: 'confirmed' }), { messageRef, userText });
        }
        if (action.action === 'decline_attendance') {
            return handleAssistantAction(JSON.stringify({ ...action, action: 'set_attendance', attendance: 'declined' }), { messageRef, userText });
        }
        if (action.action === 'tentative_attendance') {
            return handleAssistantAction(JSON.stringify({ ...action, action: 'set_attendance', attendance: 'tentative' }), { messageRef, userText });
        }

        if (action.action === 'set_attendance' || action.action === 'update_attendance' || action.action === 'rsvp_event') {
            const events = getEvents();
            const candidates = resolveActionCandidates(action, events);
            const nextAttendance = getAttendanceFromAction(action);

            if (!nextAttendance) {
                const msg = assistantShortText('attendanceInvalid');
                if (messageRef) {
                    messageRef.content = msg;
                    renderAssistantMessages();
                    saveAssistantHistory();
                } else {
                    appendAssistantMessage({ role: 'assistant', content: msg });
                }
                return { handled: true, spokenText: msg };
            }

            if (!candidates.length) {
                const msg = assistantShortText('eventNotFound');
                if (messageRef) {
                    messageRef.content = msg;
                    renderAssistantMessages();
                    saveAssistantHistory();
                } else {
                    appendAssistantMessage({ role: 'assistant', content: msg });
                }
                return { handled: true, spokenText: msg };
            }

            if (candidates.length > 1) {
                const options = candidates.slice(0, 5).map(ev => `- ${formatEventLine(ev)}`).join('\n');
                const msg = assistantShortText('eventAmbiguous', { options });
                if (messageRef) {
                    messageRef.content = msg;
                    renderAssistantMessages();
                    saveAssistantHistory();
                } else {
                    appendAssistantMessage({ role: 'assistant', content: msg });
                }
                return { handled: true, spokenText: msg };
            }

            const current = candidates[0];
            setEventAttendance(current.id, nextAttendance);
            const updated = getEvents().find(ev => ev.id === current.id) || { ...current, attendance: nextAttendance };
            const msg = assistantShortText('attendanceUpdated', {
                event: formatEventLine(updated),
                status: getAttendanceLabel(nextAttendance),
            });
            if (messageRef) {
                messageRef.content = msg;
                renderAssistantMessages();
                saveAssistantHistory();
            } else {
                appendAssistantMessage({ role: 'assistant', content: msg });
            }
            return { handled: true, spokenText: msg };
        }

        if (action.action === 'delete_event') {
            const events = getEvents();
            const candidates = resolveActionCandidates(action, events);

            if (!candidates.length) {
                const msg = assistantShortText('eventNotFound');
                if (messageRef) {
                    messageRef.content = msg;
                    renderAssistantMessages();
                    saveAssistantHistory();
                } else {
                    appendAssistantMessage({ role: 'assistant', content: msg });
                }
                return { handled: true, spokenText: msg };
            }

            if (candidates.length > 1) {
                const options = candidates.slice(0, 5).map(ev => `- ${formatEventLine(ev)}`).join('\n');
                const msg = assistantShortText('eventAmbiguous', { options });
                if (messageRef) {
                    messageRef.content = msg;
                    renderAssistantMessages();
                    saveAssistantHistory();
                } else {
                    appendAssistantMessage({ role: 'assistant', content: msg });
                }
                return { handled: true, spokenText: msg };
            }

            const target = candidates[0];
            assistantPendingAction = {
                type: 'delete',
                eventId: target.id,
            };
            const msg = assistantShortText('confirmDelete', { event: formatEventLine(target) });
            if (messageRef) {
                messageRef.content = msg;
                renderAssistantMessages();
                saveAssistantHistory();
            } else {
                appendAssistantMessage({ role: 'assistant', content: msg });
            }
            return { handled: true, spokenText: msg };
        }

        if (action.action === 'update_event') {
            const events = getEvents();
            const candidates = resolveActionCandidates(action, events);

            if (!candidates.length) {
                const msg = assistantShortText('eventNotFound');
                if (messageRef) {
                    messageRef.content = msg;
                    renderAssistantMessages();
                    saveAssistantHistory();
                } else {
                    appendAssistantMessage({ role: 'assistant', content: msg });
                }
                return { handled: true, spokenText: msg };
            }

            if (candidates.length > 1) {
                const options = candidates.slice(0, 5).map(ev => `- ${formatEventLine(ev)}`).join('\n');
                const msg = assistantShortText('eventAmbiguous', { options });
                if (messageRef) {
                    messageRef.content = msg;
                    renderAssistantMessages();
                    saveAssistantHistory();
                } else {
                    appendAssistantMessage({ role: 'assistant', content: msg });
                }
                return { handled: true, spokenText: msg };
            }

            const current = candidates[0];
            const updateCandidate = buildUpdateCandidate(current, action);
            if (!updateCandidate.ok) {
                const msg = updateCandidate.error || assistantShortText('eventNotFound');
                if (messageRef) {
                    messageRef.content = msg;
                    renderAssistantMessages();
                    saveAssistantHistory();
                } else {
                    appendAssistantMessage({ role: 'assistant', content: msg });
                }
                return { handled: true, spokenText: msg };
            }

            const conflicts = findEventConflicts(updateCandidate.nextEvent, events, current.id);
            if (conflicts.length) {
                const conflictText = conflicts.slice(0, 3).map(formatEventLine).join(' | ');
                const suggestions = suggestRescheduleSlots(updateCandidate.nextEvent, events, {
                    ignoreEventId: current.id,
                    maxSuggestions: 3,
                    stepMinutes: 30,
                });

                const msg = suggestions.length
                    ? assistantShortText('rescheduleConflict', {
                        conflicts: conflictText,
                        suggestions: suggestions.map(s => `${s.date} ${s.start}-${s.end}`).join(' | '),
                    })
                    : assistantShortText('rescheduleNoSuggestion');

                if (messageRef) {
                    messageRef.content = msg;
                    renderAssistantMessages();
                    saveAssistantHistory();
                } else {
                    appendAssistantMessage({ role: 'assistant', content: msg });
                }
                return { handled: true, spokenText: msg };
            }

            assistantPendingAction = {
                type: 'update',
                eventId: current.id,
                nextEvent: updateCandidate.nextEvent,
            };

            const msg = assistantShortText('confirmUpdate', {
                before: formatEventLine(current),
                after: formatEventLine(updateCandidate.nextEvent),
            });

            if (messageRef) {
                messageRef.content = msg;
                renderAssistantMessages();
                saveAssistantHistory();
            } else {
                appendAssistantMessage({ role: 'assistant', content: msg });
            }
            return { handled: true, spokenText: msg };
        }

        if (action.action === 'reschedule_event' || action.action === 'reprogram_event') {
            const target = action.target || action.where || {};
            const mapped = {
                ...action,
                action: 'update_event',
                new_date: action.new_date || parseAssistantDateHint(action.date || ''),
                new_start: action.new_start || action.start,
                new_end: action.new_end || action.end,
                date: action.target_date || target.date || '',
                start: action.target_start || target.start || '',
                title: action.target_title || target.title || action.title || action.event_title || action.event || action.name,
            };

            if (!mapped.date) delete mapped.date;
            if (!mapped.start) delete mapped.start;

            const hasExplicitTarget = !!(
                action.event_id
                || action.id
                || target.id
                || action.target_date
                || action.target_start
                || action.target_title
                || target.date
                || target.start
                || target.title
            );

            if (!hasExplicitTarget) {
                delete mapped.date;
                delete mapped.start;
                delete mapped.end;
            }

            return handleAssistantAction(JSON.stringify(mapped), { messageRef, userText });
        }

        if (action.action !== 'create_event') return { handled: false };

        const safeCreateAction = normalizeCreateActionDateForFuture(action, userText);

        const validation = validateEventPayload(safeCreateAction, assistantLocale);
        if (!validation.ok) {
            if (messageRef) {
                messageRef.content = validation.error;
                renderAssistantMessages();
                saveAssistantHistory();
            } else {
                appendAssistantMessage({ role: 'assistant', content: validation.error });
            }
            return { handled: true, spokenText: validation.error };
        }

        const evt = toEventPayload(validation.data);
        const events = getEvents();
        events.push(evt);
        saveEvents(events);
        renderAll();
        try { notifier.scheduleFor(evt); } catch (e) { console.warn('Schedule failed', e); }

        const confirmText = tr('assistant.eventCreated', {
            title: evt.title,
            date: evt.date,
            start: evt.start,
            end: evt.end,
        });
        let finalText = confirmText;

        if (validation?.data?.autoCompletedEnd) {
            const autoText = tr('assistant.autoEnd', { end: evt.end, minutes: validation?.data?.autoDurationMinutes || 60 });
            finalText = `${confirmText}\n${autoText}`;
        }

        if (messageRef) {
            messageRef.content = finalText;
            renderAssistantMessages();
            saveAssistantHistory();
        } else {
            appendAssistantMessage({ role: 'assistant', content: finalText });
        }

        return { handled: true, spokenText: finalText };
    }

    function buildAssistantContext() {
        const events = sortEvents(getEvents());
        const today = new Date();
        const todayFloor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const upcoming = events
            .filter(ev => {
                const d = parseLocalDate(ev.date);
                return d && d >= todayFloor;
            })
            .slice(0, 5);

        if (!upcoming.length) return '';

        const lines = upcoming.map(ev => {
            const desc = ev.description ? ` — ${ev.description}` : '';
            const attendance = getAttendanceLabel(ev.attendance);
            return `- ${ev.date} ${ev.start}-${ev.end} ${ev.title}${desc} [${attendance}]`;
        });
        return `Agenda context (max 5 upcoming):\n${lines.join('\n')}`;
    }

    function setAssistantStatus(text) {
        if (assistantStatus) assistantStatus.textContent = text;
    }

    function setAssistantBusy(isBusy) {
        if (assistantSendBtn) assistantSendBtn.disabled = isBusy;
        if (assistantInput) assistantInput.disabled = isBusy;
        if (assistantVoiceBtn) assistantVoiceBtn.disabled = isBusy;
    }

    function scrollAssistantBottom() {
        if (!assistantThread) return;
        requestAnimationFrame(() => {
            assistantThread.scrollTop = assistantThread.scrollHeight;
        });
    }
})();
