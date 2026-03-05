const path = require('path');
const { app } = require('electron');
const Database = require('better-sqlite3');

let db = null;

function dbPath() {
  return path.join(app.getPath('userData'), 'events.db');
}

function getDb() {
  if (db) return db;
  db = new Database(dbPath());
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT,
      date TEXT,
      start TEXT,
      end TEXT,
      description TEXT,
      color TEXT,
      notified INTEGER DEFAULT 0,
      start_time INTEGER,
      reminder_offset INTEGER DEFAULT 600
    );
  `);
  try {
    db.exec(`ALTER TABLE events ADD COLUMN notified INTEGER DEFAULT 0;`);
  } catch (err) {
    /* ignore duplicate column */
  }
  try {
    db.exec(`ALTER TABLE events ADD COLUMN start_time INTEGER;`);
  } catch (err) {
    /* ignore duplicate column */
  }
  try {
    db.exec(`ALTER TABLE events ADD COLUMN reminder_offset INTEGER DEFAULT 600;`);
  } catch (err) {
    /* ignore duplicate column */
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_events_start_time ON events(start_time);`);

  try {
    const missing = db.prepare('SELECT id, date, start FROM events WHERE start_time IS NULL OR start_time = 0').all();
    const updateStart = db.prepare('UPDATE events SET start_time = ?, notified = COALESCE(notified, 0), reminder_offset = COALESCE(reminder_offset, 600) WHERE id = ?');
    const tx = db.transaction((rows) => {
      rows.forEach((row) => {
        const startTime = Date.parse(`${row.date || ''}T${row.start || ''}`);
        updateStart.run(Number.isFinite(startTime) ? startTime : null, row.id);
      });
    });
    tx(missing);
  } catch (err) {
    console.warn('No se pudo normalizar start_time/notified', err);
  }
  return db;
}

async function readEvents() {
  try {
    const database = getDb();
    const rows = database
      .prepare('SELECT id, title, date, start, end, description, color, notified, reminder_offset FROM events ORDER BY date ASC, start ASC')
      .all();
    return rows.map((r) => ({ ...r }));
  } catch (err) {
    console.warn('No se pudo leer events.db', err);
    return [];
  }
}

async function writeEvents(list = []) {
  const database = getDb();
  const payload = Array.isArray(list) ? list : [];
  const insert = database.prepare(
    'INSERT INTO events (id, title, date, start, end, description, color, notified, start_time, reminder_offset) VALUES (@id, @title, @date, @start, @end, @description, @color, @notified, @start_time, @reminder_offset)'
  );
  const removeAll = database.prepare('DELETE FROM events');
  const tx = database.transaction((items) => {
    removeAll.run();
    for (const ev of items) {
      const startTime = Date.parse(`${ev.date || ''}T${ev.start || ''}`);
      insert.run({
        id: ev.id || String(Date.now()),
        title: ev.title || '',
        date: ev.date || '',
        start: ev.start || '',
        end: ev.end || '',
        description: ev.description || '',
        color: ev.color || '#2563eb',
        notified: ev.notified ? 1 : 0,
        start_time: Number.isFinite(startTime) ? startTime : null,
        reminder_offset: Number.isFinite(ev.reminder_offset) ? ev.reminder_offset : 600,
      });
    }
  });

  try {
    tx(payload);
    return true;
  } catch (err) {
    console.error('No se pudo escribir events.db', err);
    throw err;
  }
}

module.exports = {
  getDb,
  readEvents,
  writeEvents,
  storePath: dbPath,
};
