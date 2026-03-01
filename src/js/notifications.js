/* Notificaciones locales (app abierta) */
const MINUTES_BEFORE = 10;          // Minutos de adelanto antes del evento
const MAX_DAYS_AHEAD = 7;           // Límite de programación futura
const AUDIO_PATH = 'assets/audio/alerta.mp3'; // Sonido de aviso

export class Notifier {
  constructor() {
    this.timers = new Map();        // idEvento -> timeoutId
    this.permission = 'default';
    this.audio = new Audio(AUDIO_PATH);
    this.audio.preload = 'auto';
    this.audio.autoplay = true;
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
    const t = this.timers.get(eventId);
    if (t) clearTimeout(t);
    this.timers.delete(eventId);
  }

  // Programa la notificación para un evento.
  scheduleFor(event) {
    if (this.permission !== 'granted') return;
    const eventTime = new Date(`${event.date}T${event.start}`).getTime();
    if (Number.isNaN(eventTime)) return;

    const now = Date.now();
    const advanceMs = MINUTES_BEFORE * 60 * 1000;
    const fireAt = eventTime - advanceMs;
    const maxAhead = now + MAX_DAYS_AHEAD * 24 * 60 * 60 * 1000;

    // No programar si ya pasó o está demasiado lejos.
    if (fireAt <= now || fireAt > maxAhead) return;

    this.cancelFor(event.id); // Evita duplicados

    const timeoutId = window.setTimeout(() => {
      this._notify(event);
      this.timers.delete(event.id);
    }, fireAt - now);

    this.timers.set(event.id, timeoutId);
  }

  // Reprograma todos los eventos (p.ej. tras render o CRUD).
  rescheduleAll(events = []) {
    this.cancelAll();
    events.forEach((e) => this.scheduleFor(e));
  }

  // Muestra notificación y reproduce sonido.
  _notify(event) {
    const title = 'Recordatorio de evento';
    const body = `${event.title || 'Evento'} a las ${event.start} (${event.date})`;
    try { new Notification(title, { body }); } catch (err) { console.warn('No se pudo mostrar la notificación', err); }
    this.audio.currentTime = 0;
    this.audio.play().catch(() => {});
  }
}
