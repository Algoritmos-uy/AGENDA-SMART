/* Notificaciones locales (app abierta) */
import { normalizeLocale } from './utils/agendaDateUtils.js';
import { t } from './utils/i18n.js';

const MAX_DAYS_AHEAD = 365;         // Límite de programación futura
const ALERT_LOOP_INTERVAL_MS = 3000;
const ALERT_AUTO_STOP_MS = 3 * 60 * 1000;
const ALERT_SNOOZE_MS = 2 * 60 * 1000;
const DEFAULT_REMINDER_OFFSETS_S = [1800]; // 30 min por defecto
const ASSISTANT_CONFIG_KEY = 'coordinalia-config';
const ASSISTANT_TTS_GENDER_KEY = 'coordinalia-tts-gender';
const ALERT_AUDIO_BASE_BY_MINUTES = new Map([
  [15, '15'],
  [30, '30'],
]);

const ALERT_VIBRATE_PATTERN = [250, 150, 250];
const ANDROID_NOTIFICATION_CHANNELS = {
  '30:es:feminine': { id: 'agenda_reminder_30m_es_f', name: 'Recordatorios 30 min',  sound: 'evento_30'      },
  '30:en:feminine': { id: 'agenda_reminder_30m_en_f', name: '30 min Reminders',      sound: 'evento_30_en'   },
  '30:pt:feminine': { id: 'agenda_reminder_30m_pt_f', name: 'Lembretes 30 min',      sound: 'evento_30_pt'   },
  '30:es:masculine': { id: 'agenda_reminder_30m_es_m', name: 'Recordatorios 30 min',  sound: 'm_evento_30_es' },
  '30:en:masculine': { id: 'agenda_reminder_30m_en_m', name: '30 min Reminders',      sound: 'm_evento_30_en' },
  '30:pt:masculine': { id: 'agenda_reminder_30m_pt_m', name: 'Lembretes 30 min',      sound: 'm_evento_30_pt' },
  '15:es:feminine': { id: 'agenda_reminder_15m_es_f', name: 'Recordatorios 15 min',  sound: 'evento_15'      },
  '15:en:feminine': { id: 'agenda_reminder_15m_en_f', name: '15 min Reminders',      sound: 'evento_15_en'   },
  '15:pt:feminine': { id: 'agenda_reminder_15m_pt_f', name: 'Lembretes 15 min',      sound: 'evento_15_pt'   },
  '15:es:masculine': { id: 'agenda_reminder_15m_es_m', name: 'Recordatorios 15 min',  sound: 'm_evento_15_es' },
  '15:en:masculine': { id: 'agenda_reminder_15m_en_m', name: '15 min Reminders',      sound: 'm_evento_15_en' },
  '15:pt:masculine': { id: 'agenda_reminder_15m_pt_m', name: 'Lembretes 15 min',      sound: 'm_evento_15_pt' },
  'custom:es:feminine': { id: 'agenda_reminder_custom_es_f', name: 'Recordatorios programados', sound: 'f_evento_es' },
  'custom:en:feminine': { id: 'agenda_reminder_custom_en_f', name: 'Scheduled reminders',      sound: 'f_evento_en' },
  'custom:pt:feminine': { id: 'agenda_reminder_custom_pt_f', name: 'Lembretes programados',    sound: 'f_evento_pt' },
  'custom:es:masculine': { id: 'agenda_reminder_custom_es_m', name: 'Recordatorios programados', sound: 'm_evento_es' },
  'custom:en:masculine': { id: 'agenda_reminder_custom_en_m', name: 'Scheduled reminders',      sound: 'm_evento_en' },
  'custom:pt:masculine': { id: 'agenda_reminder_custom_pt_m', name: 'Lembretes programados',    sound: 'm_evento_pt' },
};

function getCapacitorRuntime() {
  return window?.Capacitor || null;
}

function getLocalNotificationsPlugin() {
  return getCapacitorRuntime()?.Plugins?.LocalNotifications || null;
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
    const fromConfig = normalizeAlertTtsGender(parsed?.ttsGender || '');
    if (fromConfig) return fromConfig;
  } catch (_e) {
    // no-op
  }
  try {
    const fromStorage = normalizeAlertTtsGender(localStorage.getItem(ASSISTANT_TTS_GENDER_KEY) || '');
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
    this.alertAutoStopTimer = null;
    this.alertModalEl = null;
    this.activeAudio = null;
    this.nativeIds = new Map();
  this.nativeMetaById = new Map();
    this.nativeListenersBound = false;
    this.nativeChannelsReady = false;
    this.nativePlugin = null;
  }

  setLocale(locale = 'es') {
    this.locale = normalizeLocale(locale);
  }

  // Pide permiso al usuario (si el navegador soporta Notifications).
  async init() {
    if (this._isNativeAndroidRuntime()) {
      try {
        const localNotifications = await this._resolveNativePlugin();
        if (!localNotifications) return;

        const status = await localNotifications.checkPermissions();
        if (status.display !== 'granted') {
          await localNotifications.requestPermissions();
        }
        await this._ensureNativeChannels();
        await this._bindNativeListeners();
      } catch (e) {
        console.warn('No se pudieron inicializar notificaciones nativas Android', e);
      }
      return;
    }

    if (!('Notification' in window)) {
      this.permission = 'denied';
      return;
    }
    this.permission = Notification.permission;
    if (this.permission === 'default' && Notification.requestPermission) {
      this.permission = await Notification.requestPermission();
    }
  }

  // Cancela todos los temporizadores pendientes.
  cancelAll() {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    for (const t of this.snoozeTimers.values()) clearTimeout(t);
    this.snoozeTimers.clear();
    this._stopActiveAlert();

    if (this._isNativeAndroidRuntime()) {
      const localNotifications = this._getNativePluginSync();
      if (!localNotifications) return;
      const ids = Array.from(this.nativeIds.values());
      this.nativeIds.clear();
      this.nativeMetaById.clear();
      if (ids.length) {
        localNotifications.cancel({ notifications: ids.map((id) => ({ id })) }).catch(() => {});
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

    if (this._isNativeAndroidRuntime()) {
      const localNotifications = this._getNativePluginSync();
      if (!localNotifications) return;
      const idsToCancel = [];
      for (const [key, id] of this.nativeIds.entries()) {
        if (!key.startsWith(prefix)) continue;
        idsToCancel.push(id);
        this.nativeIds.delete(key);
        this.nativeMetaById.delete(id);
      }
      if (idsToCancel.length) {
        localNotifications.cancel({ notifications: idsToCancel.map((id) => ({ id })) }).catch(() => {});
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

    const nativePlugin = this._isNativeAndroidRuntime() ? this._getNativePluginSync() : null;

    for (const offsetSeconds of offsets) {
      const reminderMinutes = Math.round(offsetSeconds / 60);
      let fireAt = eventTime - offsetSeconds * 1000;

      if (fireAt > maxAhead) continue;
      if (fireAt <= now) {
        // Ventana ya vencida pero evento futuro: disparar casi inmediato.
        fireAt = now + 1500;
      }

      if (nativePlugin) {
        this._scheduleNativeNotification(event, reminderMinutes, fireAt, nativePlugin);
        continue;
      }

      const timerKey = `${event.id}:${reminderMinutes}`;
      const timeoutId = window.setTimeout(() => {
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

    this.activeAlert = { key: alertKey, event, minutesBefore };

    this._showAlertModal(event, minutesBefore);
    this._playAlertSound(event, minutesBefore, { loop: true });
    this._tryVibrate();

    this.alertLoopTimer = window.setInterval(() => {
      if (!this._isAudioPlaybackActive(this.activeAudio)) {
        this.activeAudio = null;
        this._playAlertSound(event, minutesBefore, { loop: true });
      }
      this._tryVibrate();
    }, ALERT_LOOP_INTERVAL_MS);

    this.alertAutoStopTimer = window.setTimeout(() => {
      this._stopActiveAlert();
    }, ALERT_AUTO_STOP_MS);
  }

  _stopActiveAlert() {
    if (this.alertLoopTimer) {
      clearInterval(this.alertLoopTimer);
      this.alertLoopTimer = null;
    }
    if (this.alertAutoStopTimer) {
      clearTimeout(this.alertAutoStopTimer);
      this.alertAutoStopTimer = null;
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
    if (window?.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
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
    const snoozeTimer = window.setTimeout(() => {
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
    const ua = String(navigator?.userAgent || '').toLowerCase();
    const platform = String(window?.Capacitor?.getPlatform?.() || '').toLowerCase();
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

  _isAudioPlaybackActive(audio = null) {
    if (!audio) return false;
    if (audio.paused || audio.ended) return false;
    if (Number.isFinite(audio.duration) && Number.isFinite(audio.currentTime) && audio.duration > 0) {
      return audio.currentTime < (audio.duration - 0.05);
    }
    return true;
  }

  async _bindNativeListeners() {
    if (this.nativeListenersBound) return;
    this.nativeListenersBound = true;

    const localNotifications = await this._resolveNativePlugin();
    if (!localNotifications) return;

    const triggerFromNotification = (notification) => {
      const notificationId = this._extractNotificationId(notification);
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
      triggerFromNotification(notification);
    });

    await localNotifications.addListener('localNotificationActionPerformed', (notificationAction) => {
      triggerFromNotification(notificationAction);
    });
  }

  async _ensureNativeChannels() {
    if (this.nativeChannelsReady) return;
    this.nativeChannelsReady = true;

    const localNotifications = await this._resolveNativePlugin();
    if (!localNotifications) return;

    const channels = Object.values(ANDROID_NOTIFICATION_CHANNELS);

    for (const channel of channels) {
      try {
        await localNotifications.deleteChannel({ id: channel.id });
      } catch (_e) {
        // puede no existir aún
      }
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
    if (!navigator?.vibrate) return;
    try {
      navigator.vibrate(ALERT_VIBRATE_PATTERN);
    } catch (_e) {
      // no-op
    }
  }

  _playAlertSpeech(event, minutesBefore) {
    if (!window?.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') return false;
    if (window.speechSynthesis.speaking) return true;

    const text = getAlertSpeechText(this.locale, event, minutesBefore);
    const utterance = new window.SpeechSynthesisUtterance(text);
    utterance.lang = getSpeechLang(this.locale);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;

    try {
      window.speechSynthesis.speak(utterance);
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

    const tryPlay = (index = 0) => {
      if (index >= paths.length) {
        this._playAlertSpeech(event, minutesBefore);
        return;
      }

      if (this.activeAudio && !this.activeAudio.paused) {
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
        if (this.activeAudio === audio) this.activeAudio = null;
      };
      audio.onpause = () => {
        if (!this.activeAlert) return;
        if (this.activeAudio !== audio) return;
        if (audio.ended) return;
        this.activeAudio = null;
      };
      this.activeAudio = audio;
      audio.play().catch(() => tryPlay(index + 1));
    };

    tryPlay(0);
  }
}
