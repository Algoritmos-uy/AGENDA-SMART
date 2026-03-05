const { Notification } = require('electron');
const store = require('./backgroundStore');

const CHECK_INTERVAL_MS = 60 * 1000;
const WINDOW_MINUTES = 15;

let timers = new Map();
let loop = null;

function clearAllTimers() {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
}

function initScheduler() {
  if (loop) return; // ya iniciado
  loop = setInterval(checkUpcomingEvents, CHECK_INTERVAL_MS);
  checkUpcomingEvents();
}

function checkUpcomingEvents() {
  const db = store.getDb();
  const now = Date.now();
  const windowEnd = now + WINDOW_MINUTES * 60 * 1000;

  const stmt = db.prepare(`
    SELECT id, title, date, start, end, description, color, start_time, reminder_offset
    FROM events
    WHERE start_time BETWEEN ? AND ?
      AND notified = 0
    ORDER BY start_time ASC
  `);

  const events = stmt.all(now, windowEnd);
  for (const ev of events) {
    scheduleEvent(ev, now);
  }
}

function scheduleEvent(ev, nowRef = Date.now()) {
  if (!ev || timers.has(ev.id)) return;
  const startTime = Number(ev.start_time);
  if (!Number.isFinite(startTime)) return;

  const offsetSeconds = Number.isFinite(ev.reminder_offset) ? Number(ev.reminder_offset) : 600;
  const notifyAt = startTime - offsetSeconds * 1000;
  if (startTime <= nowRef) return; // evento pasado o en curso

  const delay = Math.max(0, notifyAt - nowRef);
  if (delay > WINDOW_MINUTES * 60 * 1000) return; // fuera de ventana

  const timeoutId = setTimeout(() => {
    try {
      showNotification(ev);
      markNotified(ev.id);
    } finally {
      timers.delete(ev.id);
    }
  }, delay);

  timers.set(ev.id, timeoutId);
}

function showNotification(ev) {
  try {
    const title = 'Recordatorio de evento';
    const body = `${ev.title || 'Evento'} a las ${ev.start} (${ev.date})`;
    new Notification({
      title,
      body,
      silent: false,
    }).show?.();
  } catch (e) {
    console.warn('No se pudo mostrar notificación de fondo', e);
  }
}

function markNotified(eventId) {
  try {
    const db = store.getDb();
    db.prepare('UPDATE events SET notified = 1 WHERE id = ?').run(eventId);
  } catch (e) {
    console.warn('No se pudo marcar notificado', e);
  }
}

function onEventsSaved() {
  clearAllTimers();
  checkUpcomingEvents();
}

module.exports = {
  initScheduler,
  checkUpcomingEvents,
  scheduleEvent,
  clearAllTimers,
  onEventsSaved,
};
