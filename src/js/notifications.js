/* Notificaciones locales (app abierta) */
import { normalizeLocale } from './utils/agendaDateUtils.js';
import { t } from './utils/i18n.js';

const MAX_DAYS_AHEAD = 7;           // Límite de programación futura
const ALERT_CONFIGS = [
  {
    minutesBefore: 30,
    audioBase: '30',
  },
  {
    minutesBefore: 15,
    audioBase: '15',
  },
];

function getAudioCandidates(base, locale = 'es') {
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

export class Notifier {
  constructor() {
    this.timers = new Map();        // idEvento:minutos -> timeoutId
    this.permission = 'default';
    this.locale = normalizeLocale(navigator?.language || 'es');
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
  }

  // Cancela un evento específico.
  cancelFor(eventId) {
    const prefix = `${eventId}:`;
    for (const [key, timer] of this.timers.entries()) {
      if (!key.startsWith(prefix)) continue;
      clearTimeout(timer);
      this.timers.delete(key);
    }
  }

  // Programa la notificación para un evento.
  scheduleFor(event) {
    const eventTime = new Date(`${event.date}T${event.start}`).getTime();
    if (Number.isNaN(eventTime)) return;

    const now = Date.now();
    const maxAhead = now + MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000;

    this.cancelFor(event.id); // Evita duplicados

    ALERT_CONFIGS.forEach(({ minutesBefore }) => {
      const advanceMs = minutesBefore * 60 * 1000;
      const fireAt = eventTime - advanceMs;

      // No programar si ya pasó o está demasiado lejos.
      if (fireAt <= now || fireAt > maxAhead) return;

      const timerKey = `${event.id}:${minutesBefore}`;
      const timeoutId = window.setTimeout(() => {
        this._notify(event, minutesBefore);
        this.timers.delete(timerKey);
      }, fireAt - now);

      this.timers.set(timerKey, timeoutId);
    });
  }

  // Reprograma todos los eventos (p.ej. tras render o CRUD).
  rescheduleAll(events = []) {
    this.cancelAll();
    events.forEach((e) => this.scheduleFor(e));
  }

  // Muestra notificación y reproduce sonido.
  _notify(event, minutesBefore) {
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
    this._playAlertSound(minutesBefore);
  }

  _playAlertSound(minutesBefore) {
    const cfg = ALERT_CONFIGS.find((c) => c.minutesBefore === minutesBefore);
    const paths = cfg?.audioBase ? getAudioCandidates(cfg.audioBase, this.locale) : [];

    const tryPlay = (index = 0) => {
      if (index >= paths.length) return;
      const audio = new Audio(paths[index]);
      audio.preload = 'auto';
      audio.play().catch(() => tryPlay(index + 1));
    };

    tryPlay(0);
  }
}
