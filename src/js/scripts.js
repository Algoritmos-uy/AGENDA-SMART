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
    parseLocalDate,
    sameDate,
    sortEvents,
    startOfWeek
} from './utils/agendaDateUtils.js';
import {
    buildCreateEventFromAction,
    composeEventCreatedMessage,
    detectAssistantRange,
    findEventConflicts,
    extractAssistantAction,
    getEventAttendanceById,
    inferEndFromStart,
    normalizeEventList,
    normalizeAttendanceStatus,
    suggestRescheduleSlots,
} from './utils/assistantEventUtils.js';
import {
    cleanVoiceTranscript,
    getVoiceLang,
    hasVoiceRecognitionSupport,
    mapVoiceErrorCode
} from './utils/voiceUtils.js';
import {
    deriveReminderFormState,
    getDefaultReminderOffsets,
    parseReminderOffsetsFromFormState,
} from './utils/reminderFormUtils.js';
import {
    getAssistantSelectionNumber,
    isAssistantCancelText,
    isAssistantConfirmText,
    isAssistantCreateIntent,
    parseAssistantAttendanceFromText,
    parseAssistantCreateFromText,
    parseAssistantDeleteFromText,
    parseAssistantRescheduleFromText,
    normalizeLooseText,
} from './utils/assistantIntentUtils.js';
import {
    buildRescheduleConflictSummary,
    buildUpdateCandidate,
    formatAmbiguousCandidatesOptions,
    getAttendanceFromAction,
    getTopActionCandidates,
    isAttendanceActionType,
    mapRescheduleActionToUpdateAction,
    normalizeAttendanceActionAlias,
    resolveCandidatesDecision,
    resolveActionCandidates,
} from './utils/assistantActionResolverUtils.js';
import {
    getAttendanceActionLabelForLocale,
    getAttendanceLabelForLocale,
    getAttendanceStatusTextForLocale,
} from './utils/assistantAttendanceTextUtils.js';
import { buildAssistantContextFromEvents, formatAssistantEventsForRange } from './utils/assistantContextUtils.js';
import { getEventsByRangeFromList, normalizeViewTargetValue } from './utils/assistantRangeUtils.js';
import {
    applyPendingActionToEvents,
    createDeletePendingAction,
    createSelectDeleteCandidatePendingAction,
    createUpdatePendingAction,
    getPendingOptionsCount,
    getPendingPromptKey,
    isSelectDeleteCandidatePendingAction,
    resolveSelectedCandidateId,
} from './utils/assistantPendingActionUtils.js';
import { isInvalidApiKeyError, sanitizeAssistantErrorMessage } from './utils/assistantErrorUtils.js';
import { formatAssistantShortText } from './utils/assistantShortTextUtils.js';
import {
    getApiKeyByProvider,
    getGenderPromptSuffix,
    normalizeSttProviderValue,
    normalizeTtsGender,
    normalizeTtsProviderValue,
} from './utils/assistantProviderUtils.js';
import {
    buildAssistantPayloadMessages,
    compactAssistantHistory,
    parseAssistantHistory,
    selectAssistantThreadMessages,
} from './utils/assistantHistoryUtils.js';
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
    const reminderCustomRadio = document.getElementById('reminder-custom-radio');
    const reminderCustomInput = document.getElementById('reminder-custom');
    const reminderCustomWrapper = document.getElementById('reminder-custom-wrapper');

    function getReminderCheckboxes() {
        return Array.from(document.querySelectorAll('input[name="reminder-opt"][type="checkbox"]'));
    }

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
    const ASSISTANT_TEXT = {
        es: {
            prompt: 'Eres CoordinalIA, asistente de Agenda Inteligente. Tono: profesional y cercano, empático y claro. Responde breve, en español, y ayuda a gestionar eventos (crear, listar, reprogramar) con pasos concretos. Si falta la API key, indica de forma amable que se debe configurar DEEPSEEK_API_KEY. Para acciones operativas (crear, actualizar, reprogramar, eliminar o cambiar asistencia), responde con un único bloque JSON plano y sin texto adicional. Si el usuario pide crear/agendar un evento y tienes título, fecha (YYYY-MM-DD) e inicio (HH:mm), responde con la forma {"action":"create_event","title":"...","date":"YYYY-MM-DD","start":"HH:mm","end":"HH:mm","duration_minutes":90,"description":"...","color":"#2563eb"}. Para eliminar usa {"action":"delete_event",...}. Para asistencia usa {"action":"set_attendance","attendance":"confirmed|tentative|declined|pending",...}. end es opcional; si no está, se calcula con duration_minutes (si viene) o por defecto +60 min desde start. Si el usuario dice “duración 90 minutos”, usa duration_minutes: 90. Si falta algún dato, pídele al usuario solo ese dato faltante.',
            welcome: 'Hola, soy CoordinalIA. Estoy aquí para ayudarte con tu agenda: crear, consultar o reprogramar eventos de forma rápida. ¿En qué te apoyo?',
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
            prompt: 'You are CoordinalIA, assistant of Smart Agenda. Tone: professional yet friendly and clear. Reply briefly in English and help manage events (create, list, reschedule) with concrete steps. If the API key is missing, politely say DEEPSEEK_API_KEY must be configured. For operational actions (create, update, reschedule, delete, or attendance changes), answer with a single plain JSON block and no extra text. If the user asks to create/schedule an event and you have title, date (YYYY-MM-DD), and start (HH:mm), answer with: {"action":"create_event","title":"...","date":"YYYY-MM-DD","start":"HH:mm","end":"HH:mm","duration_minutes":90,"description":"...","color":"#2563eb"}. For delete use {"action":"delete_event",...}. For attendance use {"action":"set_attendance","attendance":"confirmed|tentative|declined|pending",...}. end is optional; if missing, compute it with duration_minutes (when provided) or default to start +60 min. If user says “duration 90 minutes”, set duration_minutes: 90. If a field is missing, ask only for that missing field.',
            welcome: "Hi, I'm CoordinalIA. I can help you create, check, or reschedule events quickly. How can I help?",
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
            prompt: 'Você é a CoordinalIA, assistente da Agenda Inteligente. Tom: profissional e próximo, claro e empático. Responda de forma breve, em português, ajudando a gerir eventos (criar, listar, reagendar) com passos concretos. Se faltar a API key, avise gentilmente que é preciso configurar DEEPSEEK_API_KEY. Para ações operacionais (criar, atualizar, reagendar, excluir ou mudar presença), responda com um único JSON simples e sem texto extra. Se o usuário pedir para criar/agendar um evento e você tiver título, data (AAAA-MM-DD) e início (HH:mm), responda com: {"action":"create_event","title":"...","date":"AAAA-MM-DD","start":"HH:mm","end":"HH:mm","duration_minutes":90,"description":"...","color":"#2563eb"}. Para excluir use {"action":"delete_event",...}. Para presença use {"action":"set_attendance","attendance":"confirmed|tentative|declined|pending",...}. end é opcional; se faltar, calcule com duration_minutes (quando vier) ou padrão +60 min a partir de start. Se o usuário disser “duração 90 minutos”, use duration_minutes: 90. Se faltar algum campo, peça apenas esse campo faltante.',
            welcome: 'Olá, sou a CoordinalIA. Posso ajudar a criar, consultar ou reagendar eventos rapidamente. Como posso ajudar?',
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
    const ASSISTANT_OPENAI_STT_API_URL = 'https://api.openai.com/v1/audio/transcriptions';
    const ASSISTANT_OPENAI_STT_MODEL = 'gpt-4o-mini-transcribe';
    const ASSISTANT_OPENAI_TTS_API_URL = 'https://api.openai.com/v1/audio/speech';
    const ASSISTANT_OPENAI_TTS_MODEL = 'gpt-4o-mini-tts';
    const ASSISTANT_OPENAI_TTS_VOICE = 'shimmer';
    const ASSISTANT_OPENAI_TTS_ALLOWED_VOICES = new Set(['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer']);
    const ASSISTANT_GEMINI_TTS_API_URL = 'https://generativelanguage.googleapis.com/v1beta';
    const ASSISTANT_GEMINI_TTS_MODEL = 'gemini-3.1-flash-tts-preview';
    const ASSISTANT_GEMINI_TTS_VOICE = 'Kore';
    const ASSISTANT_GOOGLE_STT_API_URL = 'https://speech.googleapis.com/v1/speech:recognize';
    const ASSISTANT_GOOGLE_TTS_API_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';
    const ASSISTANT_STT_PROVIDER_KEY = 'coordinalia-stt-provider';
    const ASSISTANT_STT_MODEL_KEY = 'coordinalia-stt-model';
    const ASSISTANT_STT_APIURL_KEY = 'coordinalia-stt-api-url';
    const ASSISTANT_OPENAI_APIKEY_KEY = 'coordinalia-openai-api-key';
    const ASSISTANT_GOOGLE_APIKEY_KEY = 'coordinalia-google-api-key';
    const ASSISTANT_GEMINI_APIKEY_KEY = 'coordinalia-gemini-api-key';
    const ASSISTANT_TTS_GENDER_KEY = 'coordinalia-tts-gender';
    const ASSISTANT_TTS_MALE_VOICE_KEY = 'coordinalia-tts-male-voice';
    const ASSISTANT_TTS_FEMALE_VOICE_KEY = 'coordinalia-tts-female-voice';
    const ASSISTANT_ANDROID_TTS_APIKEY_KEY = 'coordinalia-android-tts-api-key';
    const ASSISTANT_ANDROID_TTS_APIURL_KEY = 'coordinalia-android-tts-api-url';
    const ASSISTANT_ANDROID_TTS_MODEL_KEY = 'coordinalia-android-tts-model';
    const ASSISTANT_ANDROID_TTS_VOICE_KEY = 'coordinalia-android-tts-voice';
    const ASSISTANT_SECURE_STORAGE_PREFIX = 'secure:';
    const ASSISTANT_SECURE_KEYS = {
        openaiApiKey: `${ASSISTANT_SECURE_STORAGE_PREFIX}${ASSISTANT_OPENAI_APIKEY_KEY}`,
        googleApiKey: `${ASSISTANT_SECURE_STORAGE_PREFIX}${ASSISTANT_GOOGLE_APIKEY_KEY}`,
        geminiApiKey: `${ASSISTANT_SECURE_STORAGE_PREFIX}${ASSISTANT_GEMINI_APIKEY_KEY}`,
        androidApiKey: `${ASSISTANT_SECURE_STORAGE_PREFIX}${ASSISTANT_ANDROID_APIKEY_KEY}`,
        androidTtsApiKey: `${ASSISTANT_SECURE_STORAGE_PREFIX}${ASSISTANT_ANDROID_TTS_APIKEY_KEY}`,
    };
    const ASSISTANT_ANDROID_DEFAULT_TTS_API_URL = 'https://api.elevenlabs.io/v1';
    const ASSISTANT_ANDROID_DEFAULT_TTS_MODEL = 'eleven_v3';
    const ASSISTANT_ANDROID_DEFAULT_TTS_VOICE = 'EXAVITQu4vr4xnSDxMaL';
    const ASSISTANT_ANDROID_FEMALE_TTS_VOICE = 'EXAVITQu4vr4xnSDxMaL';
    const ASSISTANT_ANDROID_MALE_TTS_VOICE = 'lOEtO6uKXvOvJeMZaY4u';
    const ASSISTANT_OPENAI_TTS_MALE_VOICE = 'onyx';
    const ASSISTANT_GEMINI_TTS_MALE_VOICE = 'Puck';
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
        openai: { id: 'openai' },
        google: { id: 'google' },
        gemini: { id: 'gemini' },
    };

    const assistantMessages = [];
    let assistantUnsubscribe = null;
    let assistantPendingAction = null;
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
    let assistantTtsGender = 'feminine';
    let assistantVoiceMode = 'recognition';
    const assistantSecureKeyCache = {
        openaiApiKey: '',
        googleApiKey: '',
        geminiApiKey: '',
        androidApiKey: '',
        androidTtsApiKey: '',
    };
    const ASSISTANT_VOICE_MAX_RETRIES = 2;
    const ASSISTANT_VOICE_ONEND_MAX_RETRIES = 1;
    const ASSISTANT_VOICE_SILENCE_SUBMIT_MS = 2400;

    function tr(key, vars = {}) {
        return t(assistantLocale, key, vars);
    }

    function refreshAssistantSystemPrompt() {
        const basePrompt = String(assistantStrings?.prompt || ASSISTANT_TEXT.es.prompt);
        assistantSystemPrompt = `${basePrompt}${getGenderPromptSuffix(assistantLocale, assistantTtsGender)}`;
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

    function isNativeAndroidRuntime() {
        try {
            return window?.Capacitor?.getPlatform?.() === 'android';
        } catch (_e) {
            return false;
        }
    }

    function getPreferencesPlugin() {
        return window?.Capacitor?.Plugins?.Preferences || null;
    }

    async function readSecureApiKey(name = '') {
        if (!isNativeAndroidRuntime()) return '';
        const secureKey = ASSISTANT_SECURE_KEYS[name];
        if (!secureKey) return '';
        const prefs = getPreferencesPlugin();
        if (!prefs?.get) return '';
        try {
            const result = await prefs.get({ key: secureKey });
            return String(result?.value || '').trim();
        } catch (_e) {
            return '';
        }
    }

    async function writeSecureApiKey(name = '', value = '') {
        if (!isNativeAndroidRuntime()) return;
        const secureKey = ASSISTANT_SECURE_KEYS[name];
        if (!secureKey) return;
        const prefs = getPreferencesPlugin();
        if (!prefs?.set) return;
        try {
            await prefs.set({ key: secureKey, value: String(value || '').trim() });
        } catch (e) {
            console.warn(`No se pudo guardar key segura (${name})`, e);
        }
    }

    async function hydrateAssistantSecureConfig() {
        if (!isNativeAndroidRuntime()) return;

        for (const field of Object.keys(ASSISTANT_SECURE_KEYS)) {
            const secureValue = await readSecureApiKey(field);
            if (secureValue) {
                assistantSecureKeyCache[field] = secureValue;
                continue;
            }

            const localKey = ASSISTANT_SECURE_KEYS[field].replace(ASSISTANT_SECURE_STORAGE_PREFIX, '');
            const legacyValue = String(localStorage.getItem(localKey) || '').trim();
            if (!legacyValue) continue;

            assistantSecureKeyCache[field] = legacyValue;
            await writeSecureApiKey(field, legacyValue);
            try {
                localStorage.removeItem(localKey);
            } catch (_e) {
                // no-op
            }
        }
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
            const openaiApiKey = String(parsed.openaiApiKey || assistantSecureKeyCache.openaiApiKey || localStorage.getItem(ASSISTANT_OPENAI_APIKEY_KEY) || '').trim();
            const googleApiKey = String(parsed.googleApiKey || assistantSecureKeyCache.googleApiKey || localStorage.getItem(ASSISTANT_GOOGLE_APIKEY_KEY) || '').trim();
            const geminiApiKey = String(parsed.geminiApiKey || assistantSecureKeyCache.geminiApiKey || localStorage.getItem(ASSISTANT_GEMINI_APIKEY_KEY) || '').trim();
            const ttsGender = normalizeTtsGender(parsed.ttsGender || localStorage.getItem(ASSISTANT_TTS_GENDER_KEY) || '') || 'feminine';
            const ttsMaleVoice = String(parsed.ttsMaleVoice || localStorage.getItem(ASSISTANT_TTS_MALE_VOICE_KEY) || ASSISTANT_ANDROID_MALE_TTS_VOICE).trim() || ASSISTANT_ANDROID_MALE_TTS_VOICE;
            const ttsFemaleVoice = String(parsed.ttsFemaleVoice || localStorage.getItem(ASSISTANT_TTS_FEMALE_VOICE_KEY) || ASSISTANT_ANDROID_FEMALE_TTS_VOICE).trim() || ASSISTANT_ANDROID_FEMALE_TTS_VOICE;
            const androidApiKey = String(parsed.androidApiKey || assistantSecureKeyCache.androidApiKey || localStorage.getItem(ASSISTANT_ANDROID_APIKEY_KEY) || '').trim();
            const androidApiUrl = String(parsed.androidApiUrl || localStorage.getItem(ASSISTANT_ANDROID_APIURL_KEY) || ASSISTANT_ANDROID_DEFAULT_API_URL).trim();
            const androidModel = String(parsed.androidModel || localStorage.getItem(ASSISTANT_ANDROID_MODEL_KEY) || ASSISTANT_ANDROID_DEFAULT_MODEL).trim();
            const androidTtsApiKey = String(parsed.androidTtsApiKey || assistantSecureKeyCache.androidTtsApiKey || localStorage.getItem(ASSISTANT_ANDROID_TTS_APIKEY_KEY) || '').trim();
            const androidTtsApiUrl = String(parsed.androidTtsApiUrl || localStorage.getItem(ASSISTANT_ANDROID_TTS_APIURL_KEY) || ASSISTANT_ANDROID_DEFAULT_TTS_API_URL).trim();
            const androidTtsModel = String(parsed.androidTtsModel || localStorage.getItem(ASSISTANT_ANDROID_TTS_MODEL_KEY) || ASSISTANT_ANDROID_DEFAULT_TTS_MODEL).trim();
            const androidTtsVoice = String(parsed.androidTtsVoice || localStorage.getItem(ASSISTANT_ANDROID_TTS_VOICE_KEY) || ASSISTANT_ANDROID_DEFAULT_TTS_VOICE).trim();
            return {
                provider,
                ttsEnabled,
                ttsProvider,
                sttProvider,
                sttModel,
                sttApiUrl,
                openaiApiKey,
                googleApiKey,
                geminiApiKey,
                ttsGender,
                ttsMaleVoice,
                ttsFemaleVoice,
                androidApiKey,
                androidApiUrl,
                androidModel,
                androidTtsApiKey,
                androidTtsApiUrl,
                androidTtsModel,
                androidTtsVoice,
            };
        } catch (_e) {
            return {
                provider: 'deepseek',
                ttsEnabled: true,
                ttsProvider: 'auto',
                sttProvider: String(localStorage.getItem(ASSISTANT_STT_PROVIDER_KEY) || 'browser').trim() || 'browser',
                sttModel: String(localStorage.getItem(ASSISTANT_STT_MODEL_KEY) || '').trim(),
                sttApiUrl: String(localStorage.getItem(ASSISTANT_STT_APIURL_KEY) || '').trim(),
                openaiApiKey: String(assistantSecureKeyCache.openaiApiKey || localStorage.getItem(ASSISTANT_OPENAI_APIKEY_KEY) || '').trim(),
                googleApiKey: String(assistantSecureKeyCache.googleApiKey || localStorage.getItem(ASSISTANT_GOOGLE_APIKEY_KEY) || '').trim(),
                geminiApiKey: String(assistantSecureKeyCache.geminiApiKey || localStorage.getItem(ASSISTANT_GEMINI_APIKEY_KEY) || '').trim(),
                ttsGender: normalizeTtsGender(localStorage.getItem(ASSISTANT_TTS_GENDER_KEY) || '') || 'feminine',
                ttsMaleVoice: String(localStorage.getItem(ASSISTANT_TTS_MALE_VOICE_KEY) || ASSISTANT_ANDROID_MALE_TTS_VOICE).trim() || ASSISTANT_ANDROID_MALE_TTS_VOICE,
                ttsFemaleVoice: String(localStorage.getItem(ASSISTANT_TTS_FEMALE_VOICE_KEY) || ASSISTANT_ANDROID_FEMALE_TTS_VOICE).trim() || ASSISTANT_ANDROID_FEMALE_TTS_VOICE,
                androidApiKey: String(assistantSecureKeyCache.androidApiKey || localStorage.getItem(ASSISTANT_ANDROID_APIKEY_KEY) || '').trim(),
                androidApiUrl: String(localStorage.getItem(ASSISTANT_ANDROID_APIURL_KEY) || ASSISTANT_ANDROID_DEFAULT_API_URL).trim(),
                androidModel: String(localStorage.getItem(ASSISTANT_ANDROID_MODEL_KEY) || ASSISTANT_ANDROID_DEFAULT_MODEL).trim(),
                androidTtsApiKey: String(assistantSecureKeyCache.androidTtsApiKey || localStorage.getItem(ASSISTANT_ANDROID_TTS_APIKEY_KEY) || '').trim(),
                androidTtsApiUrl: String(localStorage.getItem(ASSISTANT_ANDROID_TTS_APIURL_KEY) || ASSISTANT_ANDROID_DEFAULT_TTS_API_URL).trim(),
                androidTtsModel: String(localStorage.getItem(ASSISTANT_ANDROID_TTS_MODEL_KEY) || ASSISTANT_ANDROID_DEFAULT_TTS_MODEL).trim(),
                androidTtsVoice: String(localStorage.getItem(ASSISTANT_ANDROID_TTS_VOICE_KEY) || ASSISTANT_ANDROID_DEFAULT_TTS_VOICE).trim(),
            };
        }
    }

    function saveAssistantConfig(config) {
        try {
            localStorage.setItem(ASSISTANT_CONFIG_KEY, JSON.stringify(config));
            if (typeof config?.androidApiKey === 'string') {
                assistantSecureKeyCache.androidApiKey = String(config.androidApiKey || '').trim();
                if (isNativeAndroidRuntime()) {
                    writeSecureApiKey('androidApiKey', assistantSecureKeyCache.androidApiKey);
                    localStorage.removeItem(ASSISTANT_ANDROID_APIKEY_KEY);
                } else {
                    localStorage.setItem(ASSISTANT_ANDROID_APIKEY_KEY, assistantSecureKeyCache.androidApiKey);
                }
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
                assistantSecureKeyCache.openaiApiKey = String(config.openaiApiKey || '').trim();
                if (isNativeAndroidRuntime()) {
                    writeSecureApiKey('openaiApiKey', assistantSecureKeyCache.openaiApiKey);
                    localStorage.removeItem(ASSISTANT_OPENAI_APIKEY_KEY);
                } else {
                    localStorage.setItem(ASSISTANT_OPENAI_APIKEY_KEY, assistantSecureKeyCache.openaiApiKey);
                }
            }
            if (typeof config?.googleApiKey === 'string') {
                assistantSecureKeyCache.googleApiKey = String(config.googleApiKey || '').trim();
                if (isNativeAndroidRuntime()) {
                    writeSecureApiKey('googleApiKey', assistantSecureKeyCache.googleApiKey);
                    localStorage.removeItem(ASSISTANT_GOOGLE_APIKEY_KEY);
                } else {
                    localStorage.setItem(ASSISTANT_GOOGLE_APIKEY_KEY, assistantSecureKeyCache.googleApiKey);
                }
            }
            if (typeof config?.geminiApiKey === 'string') {
                assistantSecureKeyCache.geminiApiKey = String(config.geminiApiKey || '').trim();
                if (isNativeAndroidRuntime()) {
                    writeSecureApiKey('geminiApiKey', assistantSecureKeyCache.geminiApiKey);
                    localStorage.removeItem(ASSISTANT_GEMINI_APIKEY_KEY);
                } else {
                    localStorage.setItem(ASSISTANT_GEMINI_APIKEY_KEY, assistantSecureKeyCache.geminiApiKey);
                }
            }
            if (typeof config?.ttsGender === 'string') {
                localStorage.setItem(ASSISTANT_TTS_GENDER_KEY, config.ttsGender);
            }
            if (typeof config?.ttsMaleVoice === 'string') {
                localStorage.setItem(ASSISTANT_TTS_MALE_VOICE_KEY, config.ttsMaleVoice);
            }
            if (typeof config?.ttsFemaleVoice === 'string') {
                localStorage.setItem(ASSISTANT_TTS_FEMALE_VOICE_KEY, config.ttsFemaleVoice);
            }
            if (typeof config?.androidApiUrl === 'string') {
                localStorage.setItem(ASSISTANT_ANDROID_APIURL_KEY, config.androidApiUrl);
            }
            if (typeof config?.androidModel === 'string') {
                localStorage.setItem(ASSISTANT_ANDROID_MODEL_KEY, config.androidModel);
            }
            if (typeof config?.androidTtsApiKey === 'string') {
                assistantSecureKeyCache.androidTtsApiKey = String(config.androidTtsApiKey || '').trim();
                if (isNativeAndroidRuntime()) {
                    writeSecureApiKey('androidTtsApiKey', assistantSecureKeyCache.androidTtsApiKey);
                    localStorage.removeItem(ASSISTANT_ANDROID_TTS_APIKEY_KEY);
                } else {
                    localStorage.setItem(ASSISTANT_ANDROID_TTS_APIKEY_KEY, assistantSecureKeyCache.androidTtsApiKey);
                }
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
        } catch (e) {
            console.warn('No se pudo guardar la configuración del asistente', e);
        }
    }

    function getAssistantConfig() {
        const cfg = loadAssistantConfig();
        assistantProvider = cfg.provider;
        assistantTtsEnabled = cfg.ttsEnabled !== false;
        assistantTtsProvider = cfg.ttsProvider || 'auto';
        assistantTtsGender = normalizeTtsGender(cfg.ttsGender || '') || 'feminine';
        assistantVoiceMode = normalizeSttProviderValue(cfg.sttProvider || 'browser') === 'browser'
            ? 'recognition'
            : 'recorder';
        refreshAssistantSystemPrompt();
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

    function saveApiKeyByProvider(provider = '', apiKey = '') {
        const p = String(provider || '').trim();
        const key = String(apiKey || '').trim();
        if (p !== 'openai' && p !== 'google' && p !== 'gemini') {
            return saveAndroidAssistantTtsApiKey(key);
        }

        const cfg = getAssistantConfig();
        if (p === 'openai') cfg.openaiApiKey = key;
        if (p === 'google') cfg.googleApiKey = key;
        if (p === 'gemini') cfg.geminiApiKey = key;
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
        assistantVoiceMode = normalized === 'browser' ? 'recognition' : 'recorder';
        updateVoiceUi();
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
        const normalized = normalizeTtsGender(gender);
        if (!normalized) return '';
        const cfg = getAssistantConfig();
        cfg.ttsGender = normalized;
        saveAssistantConfig(cfg);
        assistantTtsGender = normalized;
        refreshAssistantSystemPrompt();
        return normalized;
    }

    async function hydrateAssistantTtsDefaults() {
        try {
            if (typeof window.appBridge?.getTtsDefaults !== 'function') return;
            const defaults = await window.appBridge.getTtsDefaults();
            const maleVoice = String(defaults?.maleVoice || '').trim();
            const femaleVoice = String(defaults?.femaleVoice || '').trim();
            const cfg = getAssistantConfig();
            let changed = false;
            if (maleVoice && cfg.ttsMaleVoice !== maleVoice) {
                cfg.ttsMaleVoice = maleVoice;
                changed = true;
            }
            if (femaleVoice && cfg.ttsFemaleVoice !== femaleVoice) {
                cfg.ttsFemaleVoice = femaleVoice;
                changed = true;
            }
            if (!changed) return;
            saveAssistantConfig(cfg);
        } catch (e) {
            console.warn('No se pudo hidratar defaults TTS', e);
        }
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

    document.addEventListener('DOMContentLoaded', init);

    // Configuración inicial: valores por defecto, listeners y primer render.
    async function init() {
        const today = new Date();
        baseDateInput.value = formatISODate(today);
        dateInput.value = formatISODate(today);
        startInput.value = '09:00';
        endInput.value = '10:00';
    setReminderDefault();

    await hydrateAssistantLocale();
    await hydrateAssistantSecureConfig();
    applyI18n();

        startClock();
        try { await notifier.init(); } catch (e) { console.warn('Notifier init failed', e); }
        notifier.setLocale?.(assistantLocale);

    await loadEventsFromStore();
    renderAll();
    try { notifier.rescheduleAll(getEvents()); } catch (e) { console.warn('Reschedule failed', e); }

    getAssistantConfig();
    await hydrateAssistantTtsDefaults();
    renderAssistantProviderBtn();
    renderAssistantTtsToggle();
    loadAssistantHistory();

        form.addEventListener('submit', handleSubmit);
        resetBtn.addEventListener('click', resetForm);
        viewButtons.forEach(btn => btn.addEventListener('click', handleViewSwitch));
        baseDateInput.addEventListener('change', renderAll);
        weeklyPrevBtn?.addEventListener('click', () => shiftBaseDateDays(-7));
        weeklyNextBtn?.addEventListener('click', () => shiftBaseDateDays(7));
        monthlyPrevBtn?.addEventListener('click', () => shiftBaseDateMonths(-1));
        monthlyNextBtn?.addEventListener('click', () => shiftBaseDateMonths(1));
    reminderCustomRadio?.addEventListener('change', () => {
        if (reminderCustomRadio.checked) {
            getReminderCheckboxes().forEach(cb => { cb.checked = false; });
            reminderCustomWrapper.style.display = 'flex';
            reminderCustomInput.focus();
        }
    });
    getReminderCheckboxes().forEach(cb => {
        cb.addEventListener('change', () => {
            if (cb.checked) {
                if (reminderCustomRadio) reminderCustomRadio.checked = false;
                reminderCustomWrapper.style.display = 'none';
                reminderCustomInput.value = '';
            }
        });
    });

        hydrateVersion();
        setupAssistantModal();
    }

    // Crear o actualizar eventos desde el formulario.
    function handleSubmit(event) {
        event.preventDefault();
        const payload = getFormData();
        if (!payload) return;

        const autoCompletedEnd = !!payload.autoCompletedEnd;
        delete payload.autoCompletedEnd;

        if (payload.id) {
            // Edición de evento existente
            const events = getEvents();
            const index = events.findIndex(e => e.id === payload.id);
            if (index !== -1) {
                events[index] = payload;
            }
            saveEvents(events);
            renderAll();
            try { notifier.scheduleFor(payload); } catch (e) { console.warn('Schedule failed', e); }
            const message = autoCompletedEnd
                ? `${tr('form.statusEventUpdated')} ${tr('form.statusAutoEnd', { end: payload.end })}`
                : tr('form.statusEventUpdated');
            setStatus(message, 'success');
        } else {
            // Creación de nuevo evento: delega en helper reutilizable
            payload.id = generateId();
            persistAndScheduleCreatedEvent(payload);
            const message = autoCompletedEnd
                ? `${tr('form.statusEventSaved')} ${tr('form.statusAutoEnd', { end: payload.end })}`
                : tr('form.statusEventSaved');
            setStatus(message, 'success');
        }
        resetForm();
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

    // Cambia entre vistas (diaria, semanal, mensual) con estado accesible.
    function handleViewSwitch(evt) {
        const target = normalizeViewTarget(evt.currentTarget.dataset.target);
        viewButtons.forEach(btn => {
            const isActive = normalizeViewTarget(btn.dataset.target) === target;
            btn.classList.toggle('is-active', isActive);
            btn.setAttribute('aria-pressed', String(isActive));
        });
        views.forEach(view => {
            view.classList.toggle('is-hidden', view.dataset.view !== target);
        });
        renderAll(); // re-render al cambiar vista
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
            attendance: getEventAttendanceById(getEvents(), id),
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

    async function loadEventsFromStore() {
        if (hasNativeStore && window.appBridge?.getEvents) {
            try {
                const nativeEvents = await window.appBridge.getEvents();
                if (Array.isArray(nativeEvents) && nativeEvents.length) {
                    eventsCache = normalizeEventList(nativeEvents);
                    return;
                }
                // Migración inicial: si no hay datos en store nativo, usa localStorage si existe.
                const legacy = loadEventsFromLocal();
                eventsCache = normalizeEventList(legacy);
                await window.appBridge.saveEvents(eventsCache);
                return;
            } catch (e) {
                console.warn('No se pudo cargar store nativo, se usa localStorage', e);
                eventsCache = normalizeEventList(loadEventsFromLocal());
                return;
            }
        }
        eventsCache = normalizeEventList(loadEventsFromLocal());
    }

    function saveEvents(list) {
        eventsCache = normalizeEventList(list);
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
        return getAttendanceLabelForLocale(assistantLocale, status);
    }

    function getAttendanceActionLabel(status = 'pending') {
        return getAttendanceActionLabelForLocale(assistantLocale, status);
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
        return getAttendanceStatusTextForLocale(assistantLocale, type, vars);
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
        applyReminderOffsetsToForm(ev.reminder_offsets ?? ev.reminder_offset);
        submitBtn.textContent = tr('form.update');
        setStatus(tr('form.statusEditing'), 'muted');
    }

    function setReminderDefault() {
        const defaults = new Set(getDefaultReminderOffsets());
        getReminderCheckboxes().forEach(cb => {
            cb.checked = defaults.has(Number(cb.value));
        });
        if (reminderCustomRadio) reminderCustomRadio.checked = false;
        reminderCustomInput.value = '';
        reminderCustomWrapper.style.display = 'none';
    }

    function getReminderOffsetsFromForm() {
        const parsed = parseReminderOffsetsFromFormState({
            isCustom: !!reminderCustomRadio?.checked,
            customMinutes: reminderCustomInput?.value || '',
            checkedOffsetValues: getReminderCheckboxes()
                .filter(cb => cb.checked)
                .map(cb => cb.value),
        });

        if (!parsed.ok) {
            setStatus(tr('form.statusReminderInvalid'), 'danger');
            return null;
        }

        return parsed.offsets;
    }

    function applyReminderOffsetsToForm(value) {
        const state = deriveReminderFormState(value);
        if (state.customSelected) {
            getReminderCheckboxes().forEach(cb => { cb.checked = false; });
            if (reminderCustomRadio) reminderCustomRadio.checked = true;
            reminderCustomInput.value = state.customMinutes;
            reminderCustomWrapper.style.display = 'flex';
        } else {
            const checked = new Set(state.checkedOffsets);
            getReminderCheckboxes().forEach(cb => { cb.checked = checked.has(Number(cb.value)); });
            if (reminderCustomRadio) reminderCustomRadio.checked = false;
            reminderCustomInput.value = '';
            reminderCustomWrapper.style.display = 'none';
        }
    }

    // Helpers
    function normalizeViewTarget(target) {
        return normalizeViewTargetValue(target);
    }


    function getEventsByRange(range) {
        return getEventsByRangeFromList({
            events: sortEvents(getEvents()),
            range,
            parseLocalDate,
        });
    }

    function formatAssistantEvents(list, range) {
        return formatAssistantEventsForRange({
            list,
            range,
            headers: assistantStrings.headers,
            noEvents: assistantStrings.noEvents,
            defaultNoEventsText: tr('calendar.noEvents'),
            defaultTitle: tr('assistant.eventsTitle'),
            getAttendanceLabel,
        });
    }

    function startClock() {
        if (!clockEl) return;
        const update = () => {
            const now = new Date();
            clockEl.textContent = now.toLocaleTimeString(getCurrentIntlLocale(), { hour12: false });
        };
        update();
        setInterval(update, 1000);
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
            refreshAssistantSystemPrompt();
            notifier.setLocale?.(assistantLocale);
        } catch (e) {
            assistantLocale = 'es';
            assistantStrings = ASSISTANT_TEXT.es;
            refreshAssistantSystemPrompt();
            notifier.setLocale?.('es');
        }
        applyI18n();
    }

    function loadAssistantHistory() {
        try {
            const raw = localStorage.getItem(ASSISTANT_STORE_KEY);
            const history = parseAssistantHistory(raw, { limit: 30, omitLegacyDesktopOnly: true });
            assistantMessages.push(...history);
            renderAssistantMessages();
        } catch (e) {
            console.warn('No se pudo cargar el hilo de CoordinalIA', e);
        }
    }

    function saveAssistantHistory() {
        try {
            const clean = compactAssistantHistory(assistantMessages, 30);
            localStorage.setItem(ASSISTANT_STORE_KEY, JSON.stringify(clean));
        } catch (e) {
            console.warn('No se pudo guardar el hilo de CoordinalIA', e);
        }
    }

    function setupAssistantModal() {
        if (!assistantModal || !assistantOpenBtn) return;
        const closeButtons = [assistantCloseBtn, assistantCloseFooterBtn];
        const backdrop = assistantModal.querySelector('[data-dismiss="assistant"]');

        // Botón para alternar proveedor dentro del título del modal
        const titleGroup = assistantModal.querySelector('.modal__title-group');
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

        assistantOpenBtn.addEventListener('click', openAssistantModal);
        closeButtons.forEach(btn => btn?.addEventListener('click', closeAssistantModal));
        backdrop?.addEventListener('click', closeAssistantModal);

        document.addEventListener('keydown', (evt) => {
            if (evt.key === 'Escape' && !assistantModal.classList.contains('is-hidden')) {
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

    function pickPreferredTtsProvider(cfg = {}) {
        const selected = normalizeTtsProviderValue(cfg.ttsProvider || 'auto') || 'auto';
        if (selected !== 'auto') return [selected, 'elevenlabs', 'openai', 'google', 'gemini'].filter((v, i, arr) => arr.indexOf(v) === i);

        const order = [];
        if (String(cfg.androidTtsApiKey || '').trim()) order.push('elevenlabs');
        if (String(cfg.openaiApiKey || '').trim()) order.push('openai');
        if (String(cfg.googleApiKey || '').trim()) order.push('google');
        if (String(cfg.geminiApiKey || '').trim()) order.push('gemini');
        if (!order.length) order.push('elevenlabs', 'openai', 'google', 'gemini');
        return order;
    }

    async function trySpeakWithProvider(provider = '', text = '', cfg = {}) {
        if (provider === 'elevenlabs') {
            return speakAssistantTextWithAndroidElevenLabs(text);
        }

        if (provider === 'openai') {
            const apiKey = String(cfg.openaiApiKey || '').trim();
            if (!apiKey) return false;
            const endpoint = String(cfg.androidTtsApiUrl || ASSISTANT_OPENAI_TTS_API_URL).trim() || ASSISTANT_OPENAI_TTS_API_URL;
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: ASSISTANT_OPENAI_TTS_MODEL,
                    voice: resolveOpenAiTtsVoice(cfg.androidTtsVoice),
                    input: String(text || '').trim(),
                    format: 'mp3',
                }),
            });
            if (!res.ok) return false;
            const arr = new Uint8Array(await res.arrayBuffer());
            await playAssistantAudioBytes(arr, res.headers.get('content-type') || 'audio/mpeg');
            return true;
        }

        if (provider === 'google') {
            const apiKey = String(cfg.googleApiKey || '').trim();
            if (!apiKey) return false;
            const base = String(cfg.androidTtsApiUrl || ASSISTANT_GOOGLE_TTS_API_URL).trim() || ASSISTANT_GOOGLE_TTS_API_URL;
            const endpoint = `${base}${base.includes('?') ? '&' : '?'}key=${encodeURIComponent(apiKey)}`;
            const langCode = getVoiceLang(assistantLocale).startsWith('pt') ? 'pt-BR'
                : getVoiceLang(assistantLocale).startsWith('en') ? 'en-US'
                    : 'es-ES';
            const ssmlGender = normalizeTtsGender(cfg.ttsGender || assistantTtsGender) === 'masculine' ? 'MALE' : 'FEMALE';
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    input: { text: String(text || '').trim() },
                    voice: { languageCode: langCode, ssmlGender },
                    audioConfig: { audioEncoding: 'MP3' },
                }),
            });
            if (!res.ok) return false;
            const data = await res.json().catch(() => ({}));
            const bytes = base64ToUint8Array(String(data?.audioContent || ''));
            if (!bytes.length) return false;
            await playAssistantAudioBytes(bytes, 'audio/mpeg');
            return true;
        }

        if (provider === 'gemini') {
            const apiKey = String(cfg.geminiApiKey || '').trim();
            if (!apiKey) return false;
            const model = String(cfg.androidTtsModel || ASSISTANT_GEMINI_TTS_MODEL).trim() || ASSISTANT_GEMINI_TTS_MODEL;
            const endpoint = resolveGeminiTtsEndpoint(cfg.androidTtsApiUrl, model);
            const voiceName = String(cfg.androidTtsVoice || ASSISTANT_GEMINI_TTS_VOICE).trim() || ASSISTANT_GEMINI_TTS_VOICE;
            const res = await fetch(`${endpoint}${endpoint.includes('?') ? '&' : '?'}key=${encodeURIComponent(apiKey)}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: String(text || '').trim() }] }],
                    generationConfig: {
                        responseModalities: ['AUDIO'],
                        speechConfig: {
                            voiceConfig: {
                                prebuiltVoiceConfig: {
                                    voiceName,
                                },
                            },
                        },
                    },
                }),
            });
            if (!res.ok) return false;
            const data = await res.json().catch(() => ({}));
            const { audioBase64, mimeType } = extractGeminiAudioData(data);
            const bytes = base64ToUint8Array(audioBase64);
            if (!bytes.length) return false;
            await playAssistantAudioBytes(bytes, mimeType || 'audio/wav');
            return true;
        }

        return false;
    }

    function resolveOpenAiTtsVoice(value = '') {
        const raw = String(value || '').trim().toLowerCase();
        if (!raw) return ASSISTANT_OPENAI_TTS_VOICE;
        return ASSISTANT_OPENAI_TTS_ALLOWED_VOICES.has(raw)
            ? raw
            : ASSISTANT_OPENAI_TTS_VOICE;
    }

    function resolveGeminiTtsEndpoint(apiUrl = '', model = '') {
        const selectedModel = String(model || ASSISTANT_GEMINI_TTS_MODEL).trim() || ASSISTANT_GEMINI_TTS_MODEL;
        const raw = String(apiUrl || '').trim();
        if (!raw) {
            return `${ASSISTANT_GEMINI_TTS_API_URL}/models/${encodeURIComponent(selectedModel)}:generateContent`;
        }
    if (/:generateContent(?:\?|$)/i.test(raw)) return raw;
        if (/\/models\//i.test(raw)) return `${raw.replace(/\/+$/, '')}:generateContent`;
        return `${raw.replace(/\/+$/, '')}/models/${encodeURIComponent(selectedModel)}:generateContent`;
    }

    function extractGeminiAudioData(data = {}) {
        const directPart = data?.candidates?.[0]?.content?.parts?.find((part) => part?.inlineData?.data || part?.inline_data?.data);
        const inlineData = directPart?.inlineData || directPart?.inline_data || {};
        const audioBase64 = String(
            inlineData?.data
            || data?.audioContent
            || data?.audio
            || ''
        ).trim();
        const mimeType = String(inlineData?.mimeType || inlineData?.mime_type || 'audio/wav').trim() || 'audio/wav';
        return {
            audioBase64,
            mimeType,
        };
    }

    async function speakAssistantTextWithAndroidConfiguredProvider(text = '') {
        if (!isAndroidRuntime()) return false;
        const cfg = getAssistantConfig();
        const providers = pickPreferredTtsProvider(cfg);
        for (const provider of providers) {
            try {
                const ok = await trySpeakWithProvider(provider, text, cfg);
                if (ok) return true;
            } catch (e) {
                console.warn(`TTS provider ${provider} falló, intentando fallback`, e);
            }
        }

        return false;
    }

    async function transcribeAudioWithConfiguredProvider(blob, cfg = {}) {
        const provider = normalizeSttProviderValue(cfg.sttProvider || 'browser') || 'browser';
        if (provider === 'browser') {
            const err = new Error('STT_BROWSER_ONLY');
            err.code = 'STT_BROWSER_ONLY';
            throw err;
        }

        if (!blob?.size) {
            const err = new Error('EMPTY_AUDIO');
            err.code = 'EMPTY_AUDIO';
            throw err;
        }

        if (provider === 'openai' || provider === 'elevenlabs') {
            const key = getApiKeyByProvider(cfg, provider);
            if (!key) {
                const err = new Error('NO_STT_API_KEY');
                err.code = 'NO_STT_API_KEY';
                throw err;
            }

            const form = new FormData();
            const ext = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('wav') ? 'wav' : blob.type.includes('mp3') ? 'mp3' : 'webm';
            form.append('file', blob, `voice.${ext}`);
            const sttModel = provider === 'openai' ? (cfg.sttModel || ASSISTANT_OPENAI_STT_MODEL) : (cfg.sttModel || 'scribe_v1');
            form.append('model', sttModel);
            if (provider === 'elevenlabs') form.append('model_id', sttModel);
            form.append('language', getVoiceLang(assistantLocale).startsWith('pt') ? 'pt' : getVoiceLang(assistantLocale).startsWith('en') ? 'en' : 'es');

            const endpoint = provider === 'openai'
                ? String(cfg.sttApiUrl || ASSISTANT_OPENAI_STT_API_URL).trim() || ASSISTANT_OPENAI_STT_API_URL
                : String(cfg.sttApiUrl || 'https://api.elevenlabs.io/v1/speech-to-text').trim();
            const headers = provider === 'openai'
                ? { Authorization: `Bearer ${key}` }
                : { 'xi-api-key': key };

            const res = await fetch(endpoint, { method: 'POST', headers, body: form });
            if (!res.ok) {
                const err = new Error(`STT error ${res.status}`);
                err.code = 'STT_ERROR';
                throw err;
            }
            const data = await res.json().catch(() => ({}));
            return String(data?.text || data?.transcript || '').trim();
        }

        if (provider === 'google') {
            const key = String(cfg.googleApiKey || '').trim();
            if (!key) {
                const err = new Error('NO_STT_API_KEY');
                err.code = 'NO_STT_API_KEY';
                throw err;
            }
            const bytes = new Uint8Array(await blob.arrayBuffer());
            const base64 = btoa(String.fromCharCode(...bytes));
            const base = String(cfg.sttApiUrl || ASSISTANT_GOOGLE_STT_API_URL).trim() || ASSISTANT_GOOGLE_STT_API_URL;
            const endpoint = `${base}${base.includes('?') ? '&' : '?'}key=${encodeURIComponent(key)}`;
            const langCode = getVoiceLang(assistantLocale).startsWith('pt') ? 'pt-BR'
                : getVoiceLang(assistantLocale).startsWith('en') ? 'en-US'
                    : 'es-ES';
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    config: {
                        encoding: blob.type.includes('wav') ? 'LINEAR16' : blob.type.includes('ogg') ? 'OGG_OPUS' : 'WEBM_OPUS',
                        languageCode: langCode,
                        enableAutomaticPunctuation: true,
                    },
                    audio: { content: base64 },
                }),
            });
            if (!res.ok) {
                const err = new Error(`STT error ${res.status}`);
                err.code = 'STT_ERROR';
                throw err;
            }
            const data = await res.json().catch(() => ({}));
            return String(data?.results?.[0]?.alternatives?.[0]?.transcript || '').trim();
        }

        return '';
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
        const speechText = String(text || '').trim();
        if (!assistantTtsEnabled || !speechText) return;

        const preferredAndroidTtsOk = await speakAssistantTextWithAndroidConfiguredProvider(speechText).catch((e) => {
            console.warn('Fallback ElevenLabs TTS Android falló', e);
            return false;
        });
        if (preferredAndroidTtsOk) {
            setAssistantStatus('');
            return;
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
            const cfg = getAssistantConfig();
            const selectedTtsProvider = normalizeTtsProviderValue(assistantTtsProvider || cfg.ttsProvider || 'auto') || 'auto';
            const ttsApiKey = selectedTtsProvider === 'auto' ? '' : getApiKeyByProvider(cfg, selectedTtsProvider);
            setAssistantStatus(tr('assistant.synthesizing'));
            const result = await window.appBridge.synthesizeSpeech({
                text: speechText,
                provider: selectedTtsProvider,
                apiKey: ttsApiKey,
                model: selectedTtsProvider === 'openai'
                    ? 'gpt-4o-mini-tts'
                    : selectedTtsProvider === 'gemini'
                        ? 'gemini-3.1-flash-tts-preview'
                        : undefined,
                language: getVoiceLang(assistantLocale),
                format: 'mp3'
            });

            const bytes = base64ToUint8Array(result?.audioBase64 || '');
            await playAssistantAudioBytes(bytes, result?.mimeType || 'audio/mpeg');
            setAssistantStatus('');
        } catch (e) {
            const elevenLabsRetryOk = await speakAssistantTextWithAndroidConfiguredProvider(speechText).catch(() => false);
            if (elevenLabsRetryOk) {
                setAssistantStatus('');
                return;
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
                    const sttProvider = normalizeSttProviderValue(cfg.sttProvider || 'browser') || 'browser';
                    const sttApiKey = sttProvider === 'browser' ? '' : getApiKeyByProvider(cfg, sttProvider);
                    const transcript = window.appBridge?.transcribeAudio
                        ? await window.appBridge.transcribeAudio({
                            provider: sttProvider,
                            apiKey: sttApiKey,
                            apiUrl: cfg.sttApiUrl,
                            model: cfg.sttModel || (sttProvider === 'openai' ? 'gpt-4o-mini-transcribe' : ''),
                            language: getVoiceLang(assistantLocale),
                            mimeType: blob.type || 'audio/webm',
                            audioBuffer: buffer,
                        })
                        : await transcribeAudioWithConfiguredProvider(blob, cfg);

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
        assistantModal.classList.remove('is-hidden');
        assistantModal.querySelector('.modal__dialog')?.focus?.();
        setAssistantStatus(tr('assistant.scopeHint'));
        if (!assistantMessages.length) {
            appendAssistantMessage({
                role: 'assistant',
                content: assistantStrings.welcome
            });
        }
        scrollAssistantBottom();
    }

    function closeAssistantModal() {
        assistantVoiceStopRequested = true;
        clearTimeout(assistantVoiceRetryTimer);
        clearTimeout(assistantVoiceFinalizeTimer);
        assistantVoiceFinalizeTimer = null;
        stopVoiceRecorderFlow();
        if (assistantListening) assistantRecognizer?.stop?.();
        assistantModal.classList.add('is-hidden');
        assistantOpenBtn?.focus();
    }

    function clearAssistantThread() {
        assistantMessages.length = 0;
        saveAssistantHistory();
        renderAssistantMessages();
        setAssistantStatus(tr('assistant.scopeHint'));
        if (assistantInput) assistantInput.value = '';
    }

    function assistantShortText(key, vars = {}) {
        return formatAssistantShortText(assistantLocale, key, vars);
    }

    function formatEventLine(ev = {}) {
        const title = String(ev.title || 'Evento').trim();
        const date = String(ev.date || '').trim();
        const start = String(ev.start || '').trim();
        const end = String(ev.end || '').trim();
        const attendance = getAttendanceLabel(ev.attendance);
        return `${date} ${start}-${end} ${title} [${attendance}]`.trim();
    }

    function syncBaseDateToEventDate(event = {}) {
        const eventDate = String(event?.date || '').trim();
        if (!baseDateInput || !/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return;
        baseDateInput.value = eventDate;
    }

    function persistAndScheduleCreatedEvent(event = {}) {
        const events = getEvents();
        events.push(event);
        saveEvents(events);
        syncBaseDateToEventDate(event);
        renderAll();
        try { notifier.scheduleFor(event); } catch (e) { console.warn('Schedule failed', e); }
    }

    function applyAssistantPendingAction() {
        if (!assistantPendingAction) return null;

        const pending = assistantPendingAction;
        const result = applyPendingActionToEvents(pending, getEvents());
        assistantPendingAction = null;

        if (!result.ok) {
            return assistantShortText('eventNotFound');
        }

        if (result.type === 'delete') {
            saveEvents(result.events);
            renderAll();
            try { notifier.cancelFor(result.affectedEvent.id); } catch (e) { console.warn('Cancel failed', e); }
            return assistantShortText('eventDeleted', { event: formatEventLine(result.affectedEvent) });
        }

        if (result.type === 'update') {
            saveEvents(result.events);
            syncBaseDateToEventDate(result.affectedEvent);
            renderAll();
            return assistantShortText('eventUpdated', { event: formatEventLine(result.affectedEvent) });
        }

        return null;
    }

    async function handleAssistantSubmit(evt) {
        evt.preventDefault();
        if (!assistantInput) return;
        const text = assistantInput.value.trim();
        if (!text) return;

        const apiKeyCmd = text.match(/^\/(?:apikey|api_key)\s+(.+)$/i);
        if (apiKeyCmd) {
            const key = saveAndroidAssistantApiKey(apiKeyCmd[1]);
            assistantInput.value = '';
            appendAssistantMessage({ role: 'assistant', content: key ? tr('assistant.apiKeySaved') : tr('assistant.apiKeyMissing') });
            setAssistantStatus(key ? tr('assistant.apiKeySaved') : tr('assistant.apiKeyMissing'));
            return;
        }

    const ttsApiKeyCmd = text.match(/^\/(?:ttskey|elevenlabs_key)\s+(?!elevenlabs\s|openai\s|google\s|gemini\s|11labs\s)(.+)$/i);
        if (ttsApiKeyCmd) {
            const cfg = getAssistantConfig();
            const selectedProvider = normalizeTtsProviderValue(cfg.ttsProvider || 'elevenlabs') || 'elevenlabs';
            const key = saveApiKeyByProvider(selectedProvider, ttsApiKeyCmd[1]);
            assistantInput.value = '';
            appendAssistantMessage({ role: 'assistant', content: key ? tr('assistant.ttsApiKeySaved') : tr('assistant.ttsApiKeyMissing') });
            setAssistantStatus(key ? tr('assistant.ttsApiKeySaved') : tr('assistant.ttsApiKeyMissing'));
            return;
        }

    const ttsApiKeyProviderCmd = text.match(/^\/(?:ttskey|elevenlabs_key)\s+(elevenlabs|openai|google|gemini|11labs)\s+(.+)$/i);
        if (ttsApiKeyProviderCmd) {
            const provider = normalizeTtsProviderValue(ttsApiKeyProviderCmd[1]);
            const key = saveApiKeyByProvider(provider, ttsApiKeyProviderCmd[2]);
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
            const provider = normalizeTtsProviderValue(cfg.ttsProvider || 'auto') || 'auto';
            let voice = String(cfg.ttsFemaleVoice || ASSISTANT_ANDROID_FEMALE_TTS_VOICE).trim() || ASSISTANT_ANDROID_FEMALE_TTS_VOICE;
            if (provider === 'openai') voice = ASSISTANT_OPENAI_TTS_VOICE;
            if (provider === 'gemini') voice = ASSISTANT_GEMINI_TTS_VOICE;
            saveAssistantTtsGender('feminine');
            voice = saveAndroidAssistantTtsVoice(voice);
            assistantInput.value = '';
            appendAssistantMessage({ role: 'assistant', content: tr('assistant.ttsFemaleVoiceSet', { voice }) });
            setAssistantStatus(tr('assistant.ttsFemaleVoiceSet', { voice }));
            return;
        }

        const ttsMaleCmd = text.match(/^\/(?:ttsmale|voxmasculina|vozmasculina)$/i);
        if (ttsMaleCmd) {
            const cfg = getAssistantConfig();
            const provider = normalizeTtsProviderValue(cfg.ttsProvider || 'elevenlabs') || 'elevenlabs';
            let voice = String(cfg.ttsMaleVoice || ASSISTANT_ANDROID_MALE_TTS_VOICE).trim() || ASSISTANT_ANDROID_MALE_TTS_VOICE;
            if (provider === 'openai') voice = ASSISTANT_OPENAI_TTS_MALE_VOICE;
            if (provider === 'gemini') voice = ASSISTANT_GEMINI_TTS_MALE_VOICE;
            saveAssistantTtsGender('masculine');
            voice = saveAndroidAssistantTtsVoice(voice);
            assistantInput.value = '';
            appendAssistantMessage({ role: 'assistant', content: tr('assistant.ttsMaleVoiceSet', { voice }) });
            setAssistantStatus(tr('assistant.ttsMaleVoiceSet', { voice }));
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

            if (isSelectDeleteCandidatePendingAction(assistantPendingAction)) {
                const optionsCount = getPendingOptionsCount(assistantPendingAction);
                const selected = getAssistantSelectionNumber(text, optionsCount);
                if (!selected) {
                    const msg = assistantShortText('selectionInvalid', { max: optionsCount || 1 });
                    appendAssistantMessage({ role: 'assistant', content: msg });
                    setAssistantStatus(msg);
                    return;
                }

                const chosenId = resolveSelectedCandidateId(assistantPendingAction, selected);
                const chosenEvent = getEvents().find(ev => String(ev.id) === String(chosenId));
                if (!chosenEvent) {
                    assistantPendingAction = null;
                    const msg = assistantShortText('eventNotFound');
                    appendAssistantMessage({ role: 'assistant', content: msg });
                    setAssistantStatus(msg);
                    return;
                }

                assistantPendingAction = createDeletePendingAction(chosenEvent.id);
                const msg = assistantShortText('confirmDelete', { event: formatEventLine(chosenEvent) });
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

            const msg = assistantShortText(getPendingPromptKey(assistantPendingAction));
            appendAssistantMessage({ role: 'assistant', content: msg });
            setAssistantStatus(msg);
            return;
        }

        appendAssistantMessage({ role: 'user', content: text });
        assistantInput.value = '';
    setAssistantStatus(tr('assistant.sending'));
        setAssistantBusy(true);

        const localRescheduleAction = parseAssistantRescheduleFromText(text);
        if (localRescheduleAction) {
            const actionResult = handleAssistantAction(JSON.stringify(localRescheduleAction));
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
            const actionResult = handleAssistantAction(JSON.stringify(localCreateAction));
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
            const actionResult = handleAssistantAction(JSON.stringify(localDeleteAction));
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
            const actionResult = handleAssistantAction(JSON.stringify(localAttendanceAction));
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

        if (isAndroidRuntime()) {
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
                throw new Error(tr('assistant.mobileFallback'));
            }

            if (safetyTimer) clearTimeout(safetyTimer);
            if (!assistantMsg.content) {
                assistantMsg.content = finalReply || tr('assistant.noResponse');
                renderAssistantMessages();
            }
            const actionResult = handleAssistantAction(assistantMsg.content, { messageRef: assistantMsg });
            if (actionResult?.handled) {
                await speakAssistantText(actionResult.spokenText || '');
            } else {
                await speakAssistantText(assistantMsg.content);
            }
            setAssistantStatus('');
        } catch (err) {
            console.error('assistant error', err);
            const rawMsg = err?.message || tr('assistant.contactError');
            const sanitized = sanitizeAssistantErrorMessage(rawMsg, { fallbackMessage: tr('assistant.contactError') });
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
        selectAssistantThreadMessages(assistantMessages, 20).forEach((msg) => {
            const div = document.createElement('div');
            div.className = `assistant-msg assistant-msg--${msg.role}`;
            div.textContent = msg.content;
            assistantThread.appendChild(div);
        });
    }

    function buildAssistantPayload() {
        const context = buildAssistantContext();
        return buildAssistantPayloadMessages({
            messages: assistantMessages,
            systemPrompt: assistantSystemPrompt,
            context,
            historyLimit: 12,
        });
    }

    function publishAssistantActionMessage(msg = '', { messageRef } = {}) {
        const text = String(msg ?? '');
        if (messageRef) {
            messageRef.content = text;
            renderAssistantMessages();
            saveAssistantHistory();
        } else {
            appendAssistantMessage({ role: 'assistant', content: text });
        }
        return { handled: true, spokenText: text };
    }

    function handleAssistantAction(content = '', { messageRef } = {}) {
        const parsed = extractAssistantAction(content);
        if (!parsed) return { handled: false };
        const action = normalizeAttendanceActionAlias(parsed);

        if (isAttendanceActionType(action)) {
            const events = getEvents();
            const candidates = resolveActionCandidates(action, events);
            const candidateDecision = resolveCandidatesDecision(candidates, { limit: 5 });
            const nextAttendance = getAttendanceFromAction(action);

            if (!nextAttendance) {
                const msg = assistantShortText('attendanceInvalid');
                return publishAssistantActionMessage(msg, { messageRef });
            }

            if (candidateDecision.kind === 'none') {
                const msg = assistantShortText('eventNotFound');
                return publishAssistantActionMessage(msg, { messageRef });
            }

            if (candidateDecision.kind === 'ambiguous') {
                const options = formatAmbiguousCandidatesOptions(candidateDecision.topCandidates, formatEventLine, { limit: 5 });
                const msg = assistantShortText('eventAmbiguous', { options });
                return publishAssistantActionMessage(msg, { messageRef });
            }

            const current = candidateDecision.selected;
            setEventAttendance(current.id, nextAttendance);
            const updated = getEvents().find(ev => ev.id === current.id) || { ...current, attendance: nextAttendance };
            const msg = assistantShortText('attendanceUpdated', {
                event: formatEventLine(updated),
                status: getAttendanceLabel(nextAttendance),
            });
            return publishAssistantActionMessage(msg, { messageRef });
        }

        if (action.action === 'delete_event') {
            const events = getEvents();
            const candidates = resolveActionCandidates(action, events);
            const candidateDecision = resolveCandidatesDecision(candidates, { limit: 5 });

            if (candidateDecision.kind === 'none') {
                const msg = assistantShortText('eventNotFound');
                return publishAssistantActionMessage(msg, { messageRef });
            }

            if (candidateDecision.kind === 'ambiguous') {
                const topCandidates = getTopActionCandidates(candidateDecision.topCandidates, 5);
                assistantPendingAction = createSelectDeleteCandidatePendingAction(topCandidates.map(ev => ev.id));
                const options = formatAmbiguousCandidatesOptions(topCandidates, formatEventLine, { limit: 5, numbered: true });
                const msg = assistantShortText('eventAmbiguousNumbered', {
                    options,
                    max: topCandidates.length,
                });
                return publishAssistantActionMessage(msg, { messageRef });
            }

            const target = candidateDecision.selected;
            assistantPendingAction = createDeletePendingAction(target.id);
            const msg = assistantShortText('confirmDelete', { event: formatEventLine(target) });
            return publishAssistantActionMessage(msg, { messageRef });
        }

        if (action.action === 'update_event') {
            const events = getEvents();
            const candidates = resolveActionCandidates(action, events);
            const candidateDecision = resolveCandidatesDecision(candidates, { limit: 5 });

            if (candidateDecision.kind === 'none') {
                const msg = assistantShortText('eventNotFound');
                return publishAssistantActionMessage(msg, { messageRef });
            }

            if (candidateDecision.kind === 'ambiguous') {
                const options = formatAmbiguousCandidatesOptions(candidateDecision.topCandidates, formatEventLine, { limit: 5 });
                const msg = assistantShortText('eventAmbiguous', { options });
                return publishAssistantActionMessage(msg, { messageRef });
            }

            const current = candidateDecision.selected;
            const updateCandidate = buildUpdateCandidate(current, action, { locale: assistantLocale });
            if (!updateCandidate.ok) {
                const msg = updateCandidate.error || assistantShortText('eventNotFound');
                return publishAssistantActionMessage(msg, { messageRef });
            }

            const conflicts = findEventConflicts(updateCandidate.nextEvent, events, current.id);
            if (conflicts.length) {
                const suggestions = suggestRescheduleSlots(updateCandidate.nextEvent, events, {
                    ignoreEventId: current.id,
                    maxSuggestions: 3,
                    stepMinutes: 30,
                });
                const summary = buildRescheduleConflictSummary(conflicts, suggestions, {
                    formatEvent: formatEventLine,
                    conflictLimit: 3,
                });

                const msg = summary.hasSuggestions
                    ? assistantShortText('rescheduleConflict', {
                        conflicts: summary.conflictText,
                        suggestions: summary.suggestionsText,
                    })
                    : assistantShortText('rescheduleNoSuggestion');

                return publishAssistantActionMessage(msg, { messageRef });
            }

            assistantPendingAction = createUpdatePendingAction(current.id, updateCandidate.nextEvent);

            const msg = assistantShortText('confirmUpdate', {
                before: formatEventLine(current),
                after: formatEventLine(updateCandidate.nextEvent),
            });

            return publishAssistantActionMessage(msg, { messageRef });
        }

        if (action.action === 'reschedule_event' || action.action === 'reprogram_event') {
            const mapped = mapRescheduleActionToUpdateAction(action);

            return handleAssistantAction(JSON.stringify(mapped), { messageRef });
        }

        if (action.action !== 'create_event') return { handled: false };

        const createResult = buildCreateEventFromAction(action, assistantLocale);
        if (!createResult.ok) {
            return publishAssistantActionMessage(createResult.error, { messageRef });
        }

        const evt = createResult.event;
        persistAndScheduleCreatedEvent(evt);

        const confirmText = tr('assistant.eventCreated', {
            title: evt.title,
            date: evt.date,
            start: evt.start,
            end: evt.end,
        });
        const finalText = composeEventCreatedMessage(confirmText, {
            autoCompletedEnd: createResult?.data?.autoCompletedEnd,
            end: evt.end,
            autoDurationMinutes: createResult?.data?.autoDurationMinutes,
            resolveAutoEndText: ({ end, minutes }) => tr('assistant.autoEnd', { end, minutes }),
        });

        return publishAssistantActionMessage(finalText, { messageRef });
    }

    function buildAssistantContext() {
        return buildAssistantContextFromEvents({
            events: sortEvents(getEvents()),
            parseLocalDate,
            getAttendanceLabel,
            limit: 5,
        });
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
