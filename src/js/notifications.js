/* Notificaciones locales (app abierta) */
import { normalizeLocale } from './utils/agendaDateUtils.js';
import { t } from './utils/i18n.js';

const MAX_DAYS_AHEAD = 7;           // Límite de programación futura
const ALERT_LOOP_INTERVAL_MS = 10000;
const ALERT_AUTO_STOP_MS = 3 * 60 * 1000;
const ALERT_SNOOZE_MS = 2 * 60 * 1000;
const DEFAULT_REMINDER_MINUTES = 10;
const ALERT_AUDIO_BASE_BY_MINUTES = new Map([
  [30, '30'],
  [15, '15'],
]);

const ALERT_VIBRATE_PATTERN = [250, 150, 250];

function getSpeechLang(locale = 'es') {
  const lang = normalizeLocale(locale);
  if (lang === 'en') return 'en-US';
  if (lang === 'pt') return 'pt-BR';
  return 'es-ES';
}

export function getAudioCandidates(base, locale = 'es') {
  const lang = normalizeLocale(locale);
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
    this.locale = normalizeLocale(navigator?.language || 'es');
    this.activeAlert = null;
    this.alertLoopTimer = null;
    this.alertAutoStopTimer = null;
    this.alertModalEl = null;
    this.activeAudio = null;
  }

  setLocale(locale = 'es') {
    this.locale = normalizeLocale(locale);
  }

  // Pide permiso al usuario (si el navegador soporta Notifications).
  async init() {
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
  }

  // Programa la notificación para un evento.
  scheduleFor(event) {
    const eventTime = new Date(`${event.date}T${event.start}`).getTime();
    if (Number.isNaN(eventTime)) return;

    const now = Date.now();
    const maxAhead = now + MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000;

    this.cancelFor(event.id); // Evita duplicados

    const reminderOffsetSeconds = Number(event?.reminder_offset);
    const reminderMinutes = Number.isFinite(reminderOffsetSeconds) && reminderOffsetSeconds > 0
      ? Math.max(1, Math.round(reminderOffsetSeconds / 60))
      : DEFAULT_REMINDER_MINUTES;

    const advanceMs = reminderMinutes * 60 * 1000;
    const fireAt = eventTime - advanceMs;

    // No programar si ya pasó o está demasiado lejos.
    if (fireAt <= now || fireAt > maxAhead) return;

    const timerKey = `${event.id}:${reminderMinutes}`;
    const timeoutId = window.setTimeout(() => {
      this._notify(event, reminderMinutes);
      this.timers.delete(timerKey);
    }, fireAt - now);

    this.timers.set(timerKey, timeoutId);
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
    this._playAlertSound(event, minutesBefore);
    this._tryVibrate();

    this.alertLoopTimer = window.setInterval(() => {
      this._playAlertSound(event, minutesBefore);
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

  _playAlertSound(event, minutesBefore) {
    const audioBase = ALERT_AUDIO_BASE_BY_MINUTES.get(minutesBefore);
    const paths = audioBase
      ? getAudioCandidates(audioBase, this.locale)
      : ['assets/audio/alerta.mp3'];

    const tryPlay = (index = 0) => {
      if (index >= paths.length) {
        this._playAlertSpeech(event, minutesBefore);
        return;
      }
      const audio = new Audio(paths[index]);
      audio.preload = 'auto';
      this.activeAudio = audio;
      audio.play().catch(() => tryPlay(index + 1));
    };

    tryPlay(0);
  }
}
