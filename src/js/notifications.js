/* Notificaciones locales (app abierta) */
import { normalizeLocale } from './utils/agendaDateUtils.js';
import { t } from './utils/i18n.js';

const MAX_DAYS_AHEAD = 365;         // Límite de programación futura
const ALERT_MAX_REPEATS = 3;
const ALERT_SILENT_MAX_REPEATS = 5;
const ALERT_REPEAT_PAUSE_MS = 10 * 1000;
const ALERT_SILENT_REPEAT_PAUSE_MS = 30 * 1000;
const ALERT_SNOOZE_MS = 2 * 60 * 1000;
const DEFAULT_REMINDER_OFFSETS_S = [900, 1800]; // 15 y 30 min por defecto
const ASSISTANT_CONFIG_KEY = 'coordinalia-config';
const ASSISTANT_TTS_GENDER_KEY = 'coordinalia-tts-gender';
const ASSISTANT_NOTIFICATION_AUDIO_GENDER_KEY = 'coordinalia-notification-audio-gender';
const NATIVE_CHANNEL_SCHEMA_KEY = 'agenda-native-channel-schema';
const NATIVE_CHANNEL_SCHEMA_VERSION = '2026-05-custom-audio-v2';
const EXACT_ALARM_PROMPT_KEY = 'agenda-exact-alarm-prompt-at';
const EXACT_ALARM_PROMPT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const ALERT_AUDIO_BASE_BY_MINUTES = new Map([
  [15, '15'],
  [30, '30'],
]);

const ALERT_VIBRATE_PATTERN = [250, 120, 250, 120, 250];
const ANDROID_NOTIFICATION_CHANNELS = {
  '30:es:feminine': { id: 'agenda_reminder_30m_es_f_v2', name: 'Recordatorios 30 min', sound: 'evento_30' },
  '30:en:feminine': { id: 'agenda_reminder_30m_en_f_v2', name: '30 min Reminders', sound: 'evento_30_en' },
  '30:pt:feminine': { id: 'agenda_reminder_30m_pt_f_v2', name: 'Lembretes 30 min', sound: 'evento_30_pt' },
  '30:es:masculine': { id: 'agenda_reminder_30m_es_m_v2', name: 'Recordatorios 30 min', sound: 'm_evento_30_es' },
  '30:en:masculine': { id: 'agenda_reminder_30m_en_m_v2', name: '30 min Reminders', sound: 'm_evento_30_en' },
  '30:pt:masculine': { id: 'agenda_reminder_30m_pt_m_v2', name: 'Lembretes 30 min', sound: 'm_evento_30_pt' },
  '15:es:feminine': { id: 'agenda_reminder_15m_es_f_v2', name: 'Recordatorios 15 min', sound: 'evento_15' },
  '15:en:feminine': { id: 'agenda_reminder_15m_en_f_v2', name: '15 min Reminders', sound: 'evento_15_en' },
  '15:pt:feminine': { id: 'agenda_reminder_15m_pt_f_v2', name: 'Lembretes 15 min', sound: 'evento_15_pt' },
  '15:es:masculine': { id: 'agenda_reminder_15m_es_m_v2', name: 'Recordatorios 15 min', sound: 'm_evento_15_es' },
  '15:en:masculine': { id: 'agenda_reminder_15m_en_m_v2', name: '15 min Reminders', sound: 'm_evento_15_en' },
  '15:pt:masculine': { id: 'agenda_reminder_15m_pt_m_v2', name: 'Lembretes 15 min', sound: 'm_evento_15_pt' },
  'custom:es:feminine': { id: 'agenda_reminder_custom_es_f_v2', name: 'Recordatorios programados', sound: 'f_evento_es' },
  'custom:en:feminine': { id: 'agenda_reminder_custom_en_f_v2', name: 'Scheduled reminders', sound: 'f_evento_en' },
  'custom:pt:feminine': { id: 'agenda_reminder_custom_pt_f_v2', name: 'Lembretes programados', sound: 'f_evento_pt' },
  'custom:es:masculine': { id: 'agenda_reminder_custom_es_m_v2', name: 'Recordatorios programados', sound: 'm_evento_es' },
  'custom:en:masculine': { id: 'agenda_reminder_custom_en_m_v2', name: 'Scheduled reminders', sound: 'm_evento_en' },
  'custom:pt:masculine': { id: 'agenda_reminder_custom_pt_m_v2', name: 'Lembretes programados', sound: 'm_evento_pt' },
};

const LEGACY_ANDROID_CHANNEL_IDS = [
  'agenda_reminder_30m_es_f',
  'agenda_reminder_30m_en_f',
  'agenda_reminder_30m_pt_f',
  'agenda_reminder_30m_es_m',
  'agenda_reminder_30m_en_m',
  'agenda_reminder_30m_pt_m',
  'agenda_reminder_15m_es_f',
  'agenda_reminder_15m_en_f',
  'agenda_reminder_15m_pt_f',
  'agenda_reminder_15m_es_m',
  'agenda_reminder_15m_en_m',
  'agenda_reminder_15m_pt_m',
  'agenda_reminder_custom_es_f',
  'agenda_reminder_custom_en_f',
  'agenda_reminder_custom_pt_f',
  'agenda_reminder_custom_es_m',
  'agenda_reminder_custom_en_m',
  'agenda_reminder_custom_pt_m',
];

function getStoredValue(key = '') {
  try {
    return globalThis?.localStorage?.getItem?.(key) || '';
  } catch (_e) {
    return '';
  }
}

function setStoredValue(key = '', value = '') {
  try {
    globalThis?.localStorage?.setItem?.(key, String(value));
  } catch (_e) {
    // no-op
  }
}

function getCapacitorRuntime() {
  return globalThis?.Capacitor || null;
}

let localNotificationsPluginProxy = null;
let localNotificationsPluginProxyRuntime = null;

function isLocalNotificationsPluginLike(plugin) {
  return !!plugin
    && typeof plugin.schedule === 'function'
    && typeof plugin.checkPermissions === 'function';
}

function resolveRegisteredLocalNotificationsPlugin(runtime = null) {
  const capRuntime = runtime || getCapacitorRuntime();
  if (localNotificationsPluginProxyRuntime !== capRuntime) {
    localNotificationsPluginProxy = null;
    localNotificationsPluginProxyRuntime = capRuntime;
  }

  if (localNotificationsPluginProxy && isLocalNotificationsPluginLike(localNotificationsPluginProxy)) {
    return localNotificationsPluginProxy;
  }

  if (!capRuntime || typeof capRuntime.registerPlugin !== 'function') return null;
  try {
    const plugin = capRuntime.registerPlugin('LocalNotifications');
    if (!plugin) return null;
    localNotificationsPluginProxy = plugin;
    return plugin;
  } catch (_e) {
    return null;
  }
}

function getLocalNotificationsPlugin() {
  const runtime = getCapacitorRuntime();
  const registered = resolveRegisteredLocalNotificationsPlugin(runtime);
  if (registered && isLocalNotificationsPluginLike(registered)) return registered;

  const legacy = runtime?.Plugins?.LocalNotifications || null;
  return isLocalNotificationsPluginLike(legacy) ? legacy : null;
}

function getSpeechLang(locale = 'es') {
  const lang = normalizeLocale(locale);
  if (lang === 'en') return 'en-US';
  if (lang === 'pt') return 'pt-BR';
  return 'es-ES';
}

function normalizeAlertTtsGender(value = '') {
  const raw = String(value || '').toLowerCase().trim();
  if (['m', 'male', 'masculine', 'masculina', 'hombre'].includes(raw)) return 'masculine';
  if (['f', 'female', 'feminine', 'femenina', 'mujer'].includes(raw)) return 'feminine';
  return '';
}

function getAlertTtsGenderPreference() {
  try {
    const rawConfig = localStorage.getItem(ASSISTANT_CONFIG_KEY);
    const parsed = rawConfig ? JSON.parse(rawConfig) : {};

    // 1) prioridad: preferencia específica para audio de notificaciones
    const fromNotificationConfig = normalizeAlertTtsGender(
      parsed?.notificationAudioGender || parsed?.notification_audio_gender || ''
    );
    if (fromNotificationConfig) return fromNotificationConfig;

    // 2) fallback: tts general
    const fromConfig = normalizeAlertTtsGender(parsed?.ttsGender || '');
    if (fromConfig) return fromConfig;
  } catch (_e) {
    // no-op
  }

  try {
    // 3) storage específico de notificaciones
    const fromNotificationStorage = normalizeAlertTtsGender(
      localStorage.getItem(ASSISTANT_NOTIFICATION_AUDIO_GENDER_KEY) || ''
    );
    if (fromNotificationStorage) return fromNotificationStorage;

    // 4) fallback legacy
    const fromStorage = normalizeAlertTtsGender(
      localStorage.getItem(ASSISTANT_TTS_GENDER_KEY) || ''
    );
    if (fromStorage) return fromStorage;
  } catch (_e) {
    // no-op
  }

  return 'feminine';
}

export function getAudioCandidates(base, locale = 'es', ttsGender = 'feminine') {
  const lang = normalizeLocale(locale);
  const gender = normalizeAlertTtsGender(ttsGender) || 'feminine';

  if (String(base) === 'generic') {
    if (gender === 'masculine') {
      switch (lang) {
        case 'en':
          return [
            'assets/audio/m-evento-en.mp3',
            'assets/audio/m-evento-es.mp3',
          ];
        case 'pt':
          return [
            'assets/audio/m-evento-pt.mp3',
            'assets/audio/m-evento-es.mp3',
          ];
        default:
          return [
            'assets/audio/m-evento-es.mp3',
          ];
      }
    }

    switch (lang) {
      case 'en':
        return [
          'assets/audio/f-evento-en.mp3',
          'assets/audio/f-evento-es.mp3',
        ];
      case 'pt':
        return [
          'assets/audio/f-evento-pt.mp3',
          'assets/audio/f-evento-es.mp3',
        ];
      default:
        return [
          'assets/audio/f-evento-es.mp3',
        ];
    }
  }

  if ((String(base) === '30' || String(base) === '15') && gender === 'masculine') {
    const baseStr = String(base);
    switch (lang) {
      case 'en':
        return [
          `assets/audio/m-evento-${baseStr}-en.mp3`,
          `assets/audio/evento-${baseStr}-en.mp3`,
          `assets/audio/m-evento-${baseStr}-es.mp3`,
          `assets/audio/evento-${baseStr}.mp3`,
        ];
      case 'pt':
        return [
          `assets/audio/m-evento-${baseStr}-pt.mp3`,
          `assets/audio/evento-${baseStr}-pt.mp3`,
          `assets/audio/m-evento-${baseStr}-es.mp3`,
          `assets/audio/evento-${baseStr}.mp3`,
        ];
      default:
        return [
          `assets/audio/m-evento-${baseStr}-es.mp3`,
          `assets/audio/evento-${baseStr}.mp3`,
        ];
    }
  }

  if (lang === 'en') {
    return [
      `assets/audio/evento-${base}-en.mp3`,
      `assets/audio/evento-${base}.mp3`,
    ];
  }
  if (lang === 'pt') {
    return [
      `assets/audio/evento-${base}-pt.mp3`,
      `assets/audio/evento-${base}.mp3`,
    ];
  }
  return [
    `assets/audio/evento-${base}.mp3`,
  ];
}

export function getAlertSpeechText(locale = 'es', event = {}, minutesBefore = 10) {
  return t(locale, 'notifications.alertVoiceMessage', {
    title: event.title || t(locale, 'notifications.defaultEventTitle'),
    minutes: minutesBefore,
    start: event.start,
    date: event.date,
  });
}

export class Notifier {
  constructor() {
    this.timers = new Map();        // idEvento:minutos -> timeoutId
    this.snoozeTimers = new Map();  // idEvento:minutos -> timeoutId
    this.permission = 'default';
    this.locale = normalizeLocale(globalThis?.navigator?.language || 'es');
    this.activeAlert = null;
    this.alertLoopTimer = null;
    this.alertModalEl = null;
    this.activeAudio = null;
    this.nativeIds = new Map();
    this.nativeMetaById = new Map();
    this.handledNativeNotificationIds = new Set();
    this.nativeListenersBound = false;
    this.nativeChannelsReady = false;
    this.nativePlugin = null;
    this.exactAlarmPermission = 'unknown';
  }

  setLocale(locale = 'es') {
    this.locale = normalizeLocale(locale);
  }

  // Pide permiso al usuario (si el navegador soporta Notifications).
  async init() {
    const localNotifications = await this._resolveNativePlugin();
    if (localNotifications && this._isAndroidRuntime()) {
      try {
        const status = await localNotifications.checkPermissions();
        if (status.display !== 'granted') {
          await localNotifications.requestPermissions();
        }
        await this._ensureExactAlarmPermission(localNotifications);
        await this._ensureNativeChannels();
        await this._bindNativeListeners();
      } catch (e) {
        console.warn('No se pudieron inicializar notificaciones nativas Android', e);
      }
      return;
    }

    if (!('Notification' in globalThis)) {
      this.permission = 'denied';
      return;
    }
    this.permission = globalThis.Notification.permission;
    if (this.permission === 'default' && globalThis.Notification.requestPermission) {
      this.permission = await globalThis.Notification.requestPermission();
    }
  }

  _shouldPromptExactAlarmSettings() {
    const lastPromptRaw = getStoredValue(EXACT_ALARM_PROMPT_KEY);
    const lastPromptAt = Number(lastPromptRaw);
    if (!Number.isFinite(lastPromptAt) || lastPromptAt <= 0) return true;
    return (Date.now() - lastPromptAt) >= EXACT_ALARM_PROMPT_COOLDOWN_MS;
  }

  _markExactAlarmPromptedNow() {
    setStoredValue(EXACT_ALARM_PROMPT_KEY, String(Date.now()));
  }

  _getExactAlarmPromptMessage() {
    const lang = normalizeLocale(this.locale || 'es');
    if (lang === 'en') {
      return 'To improve reminder reliability with the app in background/locked/closed, please allow Exact Alarms for AgendaIA Smart. Open settings now?';
    }
    if (lang === 'pt') {
      return 'Para melhorar a confiabilidade dos lembretes com o app em segundo plano/tela bloqueada/fechado, permita Alarmes Exatos para o AgendaIA Smart. Abrir configurações agora?';
    }
    return 'Para mejorar la confiabilidad de recordatorios con la app en segundo plano/pantalla bloqueada/cerrada, permite Alarmas exactas para AgendaIA Smart. ¿Abrir ajustes ahora?';
  }

  async _checkExactAlarmPermission(localNotifications) {
    if (!localNotifications || typeof localNotifications.checkExactNotificationSetting !== 'function') {
      return 'unavailable';
    }
    try {
      const status = await localNotifications.checkExactNotificationSetting();
      return String(status?.exact_alarm || '').toLowerCase() === 'granted' ? 'granted' : 'denied';
    } catch (_e) {
      return 'unavailable';
    }
  }

  async _ensureExactAlarmPermission(localNotifications) {
    if (!localNotifications || !this._isAndroidRuntime()) return;

    const initialStatus = await this._checkExactAlarmPermission(localNotifications);
    this.exactAlarmPermission = initialStatus;

    if (initialStatus !== 'denied') return;

    console.warn('Alarmas exactas denegadas: Android puede retrasar recordatorios en segundo plano/app cerrada.');

    if (typeof localNotifications.changeExactNotificationSetting !== 'function') return;
    if (!this._shouldPromptExactAlarmSettings()) return;

    this._markExactAlarmPromptedNow();

    const askUser = typeof globalThis?.confirm === 'function'
      ? globalThis.confirm(this._getExactAlarmPromptMessage())
      : false;
    if (!askUser) return;

    try {
      await localNotifications.changeExactNotificationSetting();
      this.exactAlarmPermission = await this._checkExactAlarmPermission(localNotifications);
      if (this.exactAlarmPermission !== 'granted') {
        console.warn('Alarmas exactas siguen denegadas tras abrir ajustes.');
      }
    } catch (e) {
      console.warn('No se pudo abrir ajuste de alarmas exactas', e);
    }
  }

  async purgeLegacyPendingNativeNotifications() {
    const localNotifications = await this._resolveNativePlugin();
    if (!localNotifications || !this._isAndroidRuntime()) return;
    if (typeof localNotifications.getPending !== 'function') return;

    try {
      const pendingResult = await localNotifications.getPending();
      const pending = Array.isArray(pendingResult?.notifications)
        ? pendingResult.notifications
        : [];
      const ids = pending
        .map((notification) => this._extractNotificationId(notification))
        .filter((id) => Number.isFinite(id) && id > 0);

      if (!ids.length) return;

      await localNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
      this.nativeIds.clear();
      ids.forEach((id) => this.nativeMetaById.delete(id));
    } catch (e) {
      console.warn('No se pudieron limpiar notificaciones nativas pendientes', e);
    }
  }

  // Cancela todos los temporizadores pendientes.
  cancelAll() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    for (const t of this.snoozeTimers.values()) clearTimeout(t);
    this.snoozeTimers.clear();
    this._stopActiveAlert();

    const localNotifications = this._getNativePluginSync();
    if (localNotifications && this._isAndroidRuntime()) {
      const ids = Array.from(this.nativeIds.values());
      this.nativeIds.clear();
      this.nativeMetaById.clear();
      if (ids.length) {
        localNotifications.cancel({ notifications: ids.map((id) => ({ id })) }).catch(() => { });
      }
    }
  }

  // Cancela un evento específico.
  cancelFor(eventId) {
    const prefix = `${eventId}:`;
    for (const [key, timer] of this.timers.entries()) {
      if (!key.startsWith(prefix)) continue;
      clearTimeout(timer);
      this.timers.delete(key);
    }
    for (const [key, timer] of this.snoozeTimers.entries()) {
      if (!key.startsWith(prefix)) continue;
      clearTimeout(timer);
      this.snoozeTimers.delete(key);
    }
    if (this.activeAlert?.event?.id === eventId) {
      this._stopActiveAlert();
    }

    const localNotifications = this._getNativePluginSync();
    if (localNotifications && this._isAndroidRuntime()) {
      const idsToCancel = [];
      for (const [key, id] of this.nativeIds.entries()) {
        if (!key.startsWith(prefix)) continue;
        idsToCancel.push(id);
        this.nativeIds.delete(key);
        this.nativeMetaById.delete(id);
      }
      if (idsToCancel.length) {
        localNotifications.cancel({ notifications: idsToCancel.map((id) => ({ id })) }).catch(() => { });
      }
    }
  }

  // Programa la notificación para un evento.
  scheduleFor(event) {
    const eventTime = new Date(`${event.date}T${event.start}`).getTime();
    if (Number.isNaN(eventTime)) return;

    const now = Date.now();
    const maxAhead = now + MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000;

    this.cancelFor(event.id); // Evita duplicados

    if (eventTime <= now) return;

    const rawOffsets = Array.isArray(event.reminder_offsets) && event.reminder_offsets.length > 0
      ? event.reminder_offsets
      : (Number.isFinite(Number(event?.reminder_offset)) && Number(event.reminder_offset) > 0
        ? [Number(event.reminder_offset)]
        : DEFAULT_REMINDER_OFFSETS_S);

    const offsets = rawOffsets.map(Number).filter(v => Number.isFinite(v) && v > 0);
    if (offsets.length === 0) return;

    const nativePlugin = this._getNativePluginSync();
    const shouldUseNativeSchedule = !!nativePlugin && this._isAndroidRuntime();

    for (const offsetSeconds of offsets) {
      const reminderMinutes = Math.round(offsetSeconds / 60);
      let fireAt = eventTime - offsetSeconds * 1000;

      if (fireAt > maxAhead) continue;
      if (fireAt <= now) {
        // Ventana ya vencida pero evento futuro: disparar casi inmediato.
        fireAt = now + 1500;
      }

      if (shouldUseNativeSchedule) {
        this._scheduleNativeNotification(event, reminderMinutes, fireAt, nativePlugin);
        continue;
      }

      const timerKey = `${event.id}:${reminderMinutes}`;
      const timeoutId = globalThis.setTimeout(() => {
        this._notify(event, reminderMinutes);
        this.timers.delete(timerKey);
      }, fireAt - now);
      this.timers.set(timerKey, timeoutId);
    }
  }

  // Reprograma todos los eventos (p.ej. tras render o CRUD).
  rescheduleAll(events = []) {
    this.cancelAll();
    events.forEach((e) => this.scheduleFor(e));
  }

  // Muestra notificación y reproduce sonido.
  _notify(event, minutesBefore) {
    const incomingKey = `${event.id}:${minutesBefore}`;
    if (this.activeAlert && this.activeAlert.key !== incomingKey) {
      // Si ya hay una alerta en curso, se descarta la nueva para evitar cola.
      return;
    }

    const title = t(this.locale, 'notifications.title');
    const body = t(this.locale, 'notifications.body', {
      title: event.title || t(this.locale, 'notifications.defaultEventTitle'),
      minutes: minutesBefore,
      start: event.start,
      date: event.date,
    });
    if (this.permission === 'granted') {
      try { new Notification(title, { body }); } catch (err) { console.warn('No se pudo mostrar la notificación', err); }
    }
    this._startAlertLoop(event, minutesBefore);
  }

  _startAlertLoop(event, minutesBefore) {
    const alertKey = `${event.id}:${minutesBefore}`;
    if (this.activeAlert && this.activeAlert.key !== alertKey) return;
    if (this.activeAlert?.key === alertKey) return;

    this.activeAlert = {
      key: alertKey,
      event,
      minutesBefore,
      playCount: 0,
      silentMode: false,
      pauseMs: ALERT_REPEAT_PAUSE_MS,
    };

    this._showAlertModal(event, minutesBefore);

    const runOnePlayback = async () => {
      const maxRepeats = this.activeAlert?.silentMode ? ALERT_SILENT_MAX_REPEATS : ALERT_MAX_REPEATS;
      if (!this.activeAlert || this.activeAlert.key !== alertKey) return;
      if (this.activeAlert.playCount >= maxRepeats) return;
      this.activeAlert.playCount += 1;
      const hasAudibleAlert = await this._playAlertSound(event, minutesBefore, { loop: false });
      if (!this.activeAlert || this.activeAlert.key !== alertKey) return;

      if (!hasAudibleAlert) {
        this.activeAlert.silentMode = true;
        this.activeAlert.pauseMs = ALERT_SILENT_REPEAT_PAUSE_MS;
      } else {
        this.activeAlert.silentMode = false;
        this.activeAlert.pauseMs = ALERT_REPEAT_PAUSE_MS;
      }

      this._tryVibrate();

      const updatedMaxRepeats = this.activeAlert.silentMode ? ALERT_SILENT_MAX_REPEATS : ALERT_MAX_REPEATS;
      if (!this.activeAlert || this.activeAlert.key !== alertKey) return;
      if (this.activeAlert.playCount >= updatedMaxRepeats) {
        this.alertLoopTimer = null;
        return;
      }

      this.alertLoopTimer = globalThis.setTimeout(() => {
        void runOnePlayback();
      }, this.activeAlert.pauseMs || ALERT_REPEAT_PAUSE_MS);
    };

    void runOnePlayback();
  }

  _stopActiveAlert() {
    if (this.alertLoopTimer) {
      clearTimeout(this.alertLoopTimer);
      this.alertLoopTimer = null;
    }
    if (this.alertModalEl?.parentNode) {
      this.alertModalEl.parentNode.removeChild(this.alertModalEl);
    }
    if (this.activeAudio) {
      try {
        this.activeAudio.pause();
        this.activeAudio.currentTime = 0;
      } catch (_e) {
        // no-op
      }
      this.activeAudio = null;
    }
    if (globalThis?.speechSynthesis) {
      try {
        globalThis.speechSynthesis.cancel();
      } catch (_e) {
        // no-op
      }
    }
    this.alertModalEl = null;
    this.activeAlert = null;
  }

  _snoozeActiveAlert() {
    const current = this.activeAlert;
    if (!current) return;

    const { event, minutesBefore, key } = current;
    this._stopActiveAlert();

    if (this.snoozeTimers.has(key)) {
      clearTimeout(this.snoozeTimers.get(key));
    }
    const snoozeTimer = globalThis.setTimeout(() => {
      this.snoozeTimers.delete(key);
      this._notify(event, minutesBefore);
    }, ALERT_SNOOZE_MS);

    this.snoozeTimers.set(key, snoozeTimer);
  }

  _showAlertModal(event, minutesBefore) {
    const title = t(this.locale, 'notifications.alertModalTitle');
    const message = t(this.locale, 'notifications.alertModalMessage', {
      title: event.title || t(this.locale, 'notifications.defaultEventTitle'),
      minutes: minutesBefore,
    });

    const overlay = document.createElement('div');
    overlay.className = 'event-alert-overlay';
    overlay.innerHTML = `
      <div class="event-alert" role="alertdialog" aria-modal="true" aria-live="assertive" aria-label="${title}">
        <h3 class="event-alert__title">${title}</h3>
        <p class="event-alert__message">${message}</p>
        <div class="event-alert__actions">
          <button type="button" class="btn btn--ghost" data-action="snooze">${t(this.locale, 'notifications.snooze2m')}</button>
          <button type="button" class="btn btn--primary" data-action="stop">${t(this.locale, 'notifications.stopAlert')}</button>
        </div>
      </div>
    `;

    overlay.querySelector('[data-action="stop"]')?.addEventListener('click', () => this._stopActiveAlert());
    overlay.querySelector('[data-action="snooze"]')?.addEventListener('click', () => this._snoozeActiveAlert());

    document.body.appendChild(overlay);
    this.alertModalEl = overlay;
  }

  _isAndroidRuntime() {
    const ua = String(globalThis?.navigator?.userAgent || '').toLowerCase();
    const platform = String(getCapacitorRuntime()?.getPlatform?.() || '').toLowerCase();
    return platform === 'android' || ua.includes('android');
  }

  _isNativeAndroidRuntime() {
    try {
      return getCapacitorRuntime()?.getPlatform?.() === 'android';
    } catch (_e) {
      return false;
    }
  }

  _notificationChannelFor(minutesBefore, locale, ttsGender = 'feminine') {
    const lang = normalizeLocale(locale || this.locale);
    const bucket = minutesBefore === 30 ? '30' : (minutesBefore === 15 ? '15' : 'custom');
    const gender = normalizeAlertTtsGender(ttsGender) || 'feminine';
    return ANDROID_NOTIFICATION_CHANNELS[`${bucket}:${lang}:${gender}`]
      || ANDROID_NOTIFICATION_CHANNELS[`${bucket}:es:${gender}`]
      || ANDROID_NOTIFICATION_CHANNELS[`${bucket}:es:feminine`]
      || ANDROID_NOTIFICATION_CHANNELS['15:es:feminine'];
  }

  _getNativePluginSync() {
    if (this.nativePlugin) return this.nativePlugin;
    const plugin = getLocalNotificationsPlugin();
    if (plugin) this.nativePlugin = plugin;
    return plugin || null;
  }

  async _resolveNativePlugin() {
    return this._getNativePluginSync();
  }

  _hashNotificationId(input = '') {
    const text = String(input || 'agenda_reminder');
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash % 2000000000) + 1;
  }

  _buildNativeNotificationId(event = {}, minutesBefore = 10) {
    const base = `${event.id || event.title || 'event'}:${minutesBefore}`;
    return this._hashNotificationId(base);
  }

  _extractNotificationId(notification = {}) {
    const raw = notification?.id
      ?? notification?.notification?.id
      ?? notification?.notificationId
      ?? notification?.notification?.notificationId;
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  }

  _resolveMinutesBefore(extra = {}, metadata = null) {
    if (metadata && Number.isFinite(Number(metadata.minutesBefore))) {
      return Math.max(1, Math.round(Number(metadata.minutesBefore)));
    }
    const parsed = Number(extra?.minutesBefore ?? extra?.minutes);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.max(1, Math.round(parsed));
    }
    return 15;
  }

  _extractMinutesFromChannelId(channelId = '') {
    const raw = String(channelId || '').trim();
    if (!raw) return null;
    if (raw.includes('30m')) return 30;
    if (raw.includes('15m')) return 15;
    return null;
  }

  _extractEventFromNotificationFallback(notification = {}, notificationId = null) {
    const fallbackId = notificationId || this._extractNotificationId(notification);
    if (!fallbackId) return null;
    const title = String(notification?.title || notification?.notification?.title || '').trim();
    return {
      id: `native-${fallbackId}`,
      title,
      date: '',
      start: '',
      end: '',
    };
  }

  _rememberHandledNativeNotificationId(notificationId = null) {
    if (!Number.isFinite(notificationId) || notificationId <= 0) return;
    this.handledNativeNotificationIds.add(notificationId);
    if (this.handledNativeNotificationIds.size > 200) {
      const first = this.handledNativeNotificationIds.values().next();
      if (!first.done) this.handledNativeNotificationIds.delete(first.value);
    }
  }

  _shouldStartInAppAlertFromNative(notificationId = null, source = 'received') {
    if (source === 'action') {
      this._rememberHandledNativeNotificationId(notificationId);
      return false;
    }
    if (!Number.isFinite(notificationId) || notificationId <= 0) {
      return true;
    }
    if (this.handledNativeNotificationIds.has(notificationId)) {
      return false;
    }
    this._rememberHandledNativeNotificationId(notificationId);
    return true;
  }

  async _bindNativeListeners() {
    if (this.nativeListenersBound) return;
    this.nativeListenersBound = true;

    const localNotifications = await this._resolveNativePlugin();
    if (!localNotifications) return;

    const triggerFromNotification = (notification, source = 'received') => {
      const notificationId = this._extractNotificationId(notification);
      if (!this._shouldStartInAppAlertFromNative(notificationId, source)) return;
      const metadata = notificationId ? this.nativeMetaById.get(notificationId) : null;
      const extra = notification?.extra || notification?.notification?.extra || {};
      const channelId = String(notification?.channelId || notification?.notification?.channelId || '').trim();
      const channelMinutes = this._extractMinutesFromChannelId(channelId);
      const event = metadata?.event
        || this._extractEventFromExtra(extra)
        || this._extractEventFromNotificationFallback(notification, notificationId);
      const minutesBefore = channelMinutes || this._resolveMinutesBefore(extra, metadata);
      if (!event || !event.id) return;
      this._startAlertLoop(event, minutesBefore);
    };

    await localNotifications.addListener('localNotificationReceived', (notification) => {
      triggerFromNotification(notification, 'received');
    });

    await localNotifications.addListener('localNotificationActionPerformed', (notificationAction) => {
      triggerFromNotification(notificationAction, 'action');
    });
  }

  async _ensureNativeChannels() {
    if (this.nativeChannelsReady) return;
    this.nativeChannelsReady = true;

    const localNotifications = await this._resolveNativePlugin();
    if (!localNotifications) return;

    const channels = Object.values(ANDROID_NOTIFICATION_CHANNELS);
    const currentVersion = getStoredValue(NATIVE_CHANNEL_SCHEMA_KEY);
    const schemaChanged = currentVersion !== NATIVE_CHANNEL_SCHEMA_VERSION;

    if (schemaChanged) {
      const idsToDelete = new Set([
        ...LEGACY_ANDROID_CHANNEL_IDS,
        ...channels.map((channel) => channel.id),
      ]);
      for (const channelId of idsToDelete) {
        try {
          await localNotifications.deleteChannel({ id: channelId });
        } catch (_e) {
          // puede no existir aún
        }
      }
    }

    for (const channel of channels) {
      try {
        await localNotifications.createChannel({
          id: channel.id,
          name: channel.name,
          description: channel.name,
          sound: channel.sound,
          importance: 5,
          visibility: 1,
          vibration: true,
          lights: true,
        });
      } catch (e) {
        console.warn(`No se pudo crear canal Android ${channel.id}`, e);
      }
    }

    if (schemaChanged) {
      setStoredValue(NATIVE_CHANNEL_SCHEMA_KEY, NATIVE_CHANNEL_SCHEMA_VERSION);
    }
  }

  _extractEventFromExtra(extra = {}) {
    const directEvent = extra?.event;
    if (directEvent && typeof directEvent === 'object' && directEvent.id) {
      return {
        id: directEvent.id,
        title: directEvent.title,
        date: directEvent.date,
        start: directEvent.start,
        end: directEvent.end,
      };
    }

    const id = String(extra?.eventId || extra?.id || '').trim();
    if (!id) return null;
    return {
      id,
      title: String(extra?.title || '').trim(),
      date: String(extra?.date || '').trim(),
      start: String(extra?.start || '').trim(),
      end: String(extra?.end || '').trim(),
    };
  }

  _scheduleNativeNotification(event, minutesBefore, fireAt, plugin) {
    const localNotifications = plugin || this._getNativePluginSync();
    if (!localNotifications) return;

    const key = `${event.id}:${minutesBefore}`;
    const id = this._buildNativeNotificationId(event, minutesBefore);
    const ttsGender = getAlertTtsGenderPreference();
    const channel = this._notificationChannelFor(minutesBefore, this.locale, ttsGender);
    const title = t(this.locale, 'notifications.title');
    const body = t(this.locale, 'notifications.body', {
      title: event.title || t(this.locale, 'notifications.defaultEventTitle'),
      minutes: minutesBefore,
      start: event.start,
      date: event.date,
    });

    this.nativeIds.set(key, id);
    this.nativeMetaById.set(id, {
      event: {
        id: event.id,
        title: event.title || '',
        date: event.date || '',
        start: event.start || '',
        end: event.end || '',
      },
      minutesBefore,
    });

    try {
      if (globalThis?.window && typeof globalThis.window.dispatchEvent === 'function' && typeof globalThis.CustomEvent === 'function') {
        globalThis.window.dispatchEvent(new globalThis.CustomEvent('agenda:notification-audio-selected', {
          detail: {
            eventId: String(event.id || ''),
            minutesBefore,
            locale: normalizeLocale(this.locale || 'es'),
            ttsGender,
            channelId: String(channel.id || ''),
            sound: `${channel.sound}.mp3`,
          },
        }));
      }
    } catch (_e) {
      // no-op
    }

    localNotifications.schedule({
      notifications: [{
        id,
        title,
        body,
        channelId: channel.id,
        sound: `${channel.sound}.mp3`,
        schedule: {
          at: new Date(fireAt),
          allowWhileIdle: true,
        },
        extra: {
          event,
          eventId: event.id,
          title: event.title || '',
          date: event.date || '',
          start: event.start || '',
          end: event.end || '',
          minutesBefore,
        },
      }],
    }).catch((e) => {
      console.warn('No se pudo programar notificación nativa Android', e);
    });
  }

  _tryVibrate() {
    if (!this._isAndroidRuntime()) return;
    if (!globalThis?.navigator?.vibrate) return;
    try {
      globalThis.navigator.vibrate(ALERT_VIBRATE_PATTERN);
    } catch (_e) {
      // no-op
    }
  }

  _playAlertSpeech(event, minutesBefore) {
    const speechSynthesis = globalThis?.speechSynthesis;
    const SpeechSynthesisUtteranceCtor = globalThis?.SpeechSynthesisUtterance;
    if (!speechSynthesis || typeof SpeechSynthesisUtteranceCtor !== 'function') return false;
    if (speechSynthesis.speaking) return true;

    const text = getAlertSpeechText(this.locale, event, minutesBefore);
    const utterance = new SpeechSynthesisUtteranceCtor(text);
    utterance.lang = getSpeechLang(this.locale);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;

    try {
      speechSynthesis.speak(utterance);
      return true;
    } catch (_e) {
      return false;
    }
  }

  _playAlertSound(event, minutesBefore, options = {}) {
    const shouldLoop = options?.loop !== false;
    const audioBase = ALERT_AUDIO_BASE_BY_MINUTES.get(minutesBefore);
    const ttsGender = getAlertTtsGenderPreference();
    const paths = audioBase
      ? getAudioCandidates(audioBase, this.locale, ttsGender)
      : getAudioCandidates('generic', this.locale, ttsGender);

    return new Promise((resolve) => {
      let resolved = false;
      const settle = (value) => {
        if (resolved) return;
        resolved = true;
        resolve(!!value);
      };

      if (!Array.isArray(paths) || paths.length === 0) {
        console.warn('No hay rutas de audio para alerta; se usará TTS de fallback.', { minutesBefore, locale: this.locale, ttsGender });
        settle(this._playAlertSpeech(event, minutesBefore));
        return;
      }

      const tryPlay = (index = 0) => {
        if (index >= paths.length) {
          console.warn('No se pudo reproducir ningún archivo de alerta; se usará TTS de fallback.', { minutesBefore, locale: this.locale, ttsGender });
          settle(this._playAlertSpeech(event, minutesBefore));
          return;
        }

        if (this.activeAudio && !this.activeAudio.paused) {
          settle(true);
          return;
        }

        const audio = new Audio(paths[index]);
        audio.preload = 'auto';
        audio.loop = false;

        const replay = () => {
          if (!shouldLoop) {
            if (this.activeAudio === audio) this.activeAudio = null;
            return;
          }
          if (!this.activeAlert || this.activeAudio !== audio) return;
          try {
            audio.currentTime = 0;
            audio.play().catch(() => {
              if (this.activeAudio === audio) this.activeAudio = null;
            });
          } catch (_e) {
            if (this.activeAudio === audio) this.activeAudio = null;
          }
        };

        audio.onended = () => {
          replay();
        };
        audio.onerror = () => {
          console.warn('Error cargando audio de alerta, probando fallback.', { path: paths[index], minutesBefore, locale: this.locale, ttsGender });
          if (this.activeAudio === audio) this.activeAudio = null;
          tryPlay(index + 1);
        };
        audio.onpause = () => {
          if (!this.activeAlert) return;
          if (this.activeAudio !== audio) return;
          if (audio.ended) return;
          this.activeAudio = null;
        };
        this.activeAudio = audio;
        audio.play()
          .then(() => {
            settle(true);
          })
          .catch((err) => {
            console.warn('No se pudo reproducir audio de alerta, probando fallback.', { path: paths[index], minutesBefore, locale: this.locale, ttsGender, error: String(err?.message || err || '') });
            if (this.activeAudio === audio) this.activeAudio = null;
            tryPlay(index + 1);
          });
      };

      tryPlay(0);
    });
  }
}


