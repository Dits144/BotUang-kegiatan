const Database = require('better-sqlite3');
const { DateTime } = require('luxon');
const { DB_PATH, TIMEZONE } = require('../config');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
  amount INTEGER NOT NULL,
  note TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  sender_name TEXT,
  created_at TEXT NOT NULL,
  edited_at TEXT,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_transactions_group_created
ON transactions(group_id, created_at DESC);

CREATE TABLE IF NOT EXISTS group_rentals (
  group_id TEXT PRIMARY KEY,
  is_active INTEGER NOT NULL DEFAULT 0,
  start_at TEXT,
  expire_at TEXT,
  updated_by TEXT,
  updated_at TEXT NOT NULL,
  last_warned_at TEXT,
  last_h1_warning_at TEXT
);

CREATE TABLE IF NOT EXISTS bot_owners (
  user_number TEXT PRIMARY KEY,
  user_jid TEXT,
  claimed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id TEXT NOT NULL,
  name TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_participants_group_created
ON participants(group_id, created_at ASC);

CREATE TABLE IF NOT EXISTS custom_commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id TEXT NOT NULL,
  keyword TEXT NOT NULL,
  response TEXT NOT NULL,
  media_path TEXT,
  media_type TEXT,
  caption_text TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_commands_unique
ON custom_commands(group_id, keyword);

CREATE TABLE IF NOT EXISTS group_settings (
  group_id TEXT PRIMARY KEY,
  header_text TEXT,
  weather_location TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id TEXT NOT NULL,
  remind_type TEXT NOT NULL,
  remind_value TEXT NOT NULL,
  remind_text TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_reminders_group_created
ON reminders(group_id, created_at ASC);

CREATE TABLE IF NOT EXISTS reminder_dispatch (
  dispatch_key TEXT PRIMARY KEY,
  reminder_id INTEGER NOT NULL,
  sent_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id TEXT NOT NULL,
  todo_text TEXT NOT NULL,
  is_done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_todos_group_created
ON todos(group_id, created_at ASC);
`);

function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${ddl}`).run();
  }
}

ensureColumn('custom_commands', 'media_path', 'media_path TEXT');
ensureColumn('custom_commands', 'media_type', 'media_type TEXT');
ensureColumn('custom_commands', 'caption_text', 'caption_text TEXT');
ensureColumn('group_settings', 'header_text', 'header_text TEXT');
ensureColumn('reminders', 'created_by', 'created_by TEXT');
ensureColumn('group_rentals', 'last_h1_warning_at', 'last_h1_warning_at TEXT');

function nowWibIso() {
  return DateTime.now().setZone(TIMEZONE).toISO();
}

function insertTransaction(payload) {
  return db.prepare(`INSERT INTO transactions (group_id, type, amount, note, sender_id, sender_name, created_at) VALUES (@group_id, @type, @amount, @note, @sender_id, @sender_name, @created_at)`).run(payload);
}

function updateTransaction(payload) {
  return db.prepare(`UPDATE transactions SET type=@type, amount=@amount, note=@note, edited_at=@edited_at WHERE id=@id AND deleted_at IS NULL`).run(payload);
}

function softDeleteTransaction(id) {
  return db.prepare(`UPDATE transactions SET deleted_at=? WHERE id=? AND deleted_at IS NULL`).run(nowWibIso(), id);
}

function getRental(groupId) {
  return db.prepare('SELECT * FROM group_rentals WHERE group_id = ?').get(groupId);
}

function isRentalActive(groupId) {
  const row = getRental(groupId);
  if (!row || !row.is_active || !row.expire_at) return false;
  return DateTime.fromISO(row.expire_at, { zone: TIMEZONE }) > DateTime.now().setZone(TIMEZONE);
}

function extendRental(groupId, days, updatedBy) {
  const current = getRental(groupId);
  const now = DateTime.now().setZone(TIMEZONE);
  const start = !current || !current.expire_at || DateTime.fromISO(current.expire_at, { zone: TIMEZONE }) <= now
    ? now
    : DateTime.fromISO(current.start_at || now.toISO(), { zone: TIMEZONE });
  const baseExpire = current?.expire_at && DateTime.fromISO(current.expire_at, { zone: TIMEZONE }) > now
    ? DateTime.fromISO(current.expire_at, { zone: TIMEZONE }) : now;
  const expireAt = baseExpire.plus({ days }).set({ hour: 23, minute: 59, second: 0, millisecond: 0 });

  db.prepare(`
    INSERT INTO group_rentals (group_id, is_active, start_at, expire_at, updated_by, updated_at)
    VALUES (?, 1, ?, ?, ?, ?)
    ON CONFLICT(group_id) DO UPDATE SET
      is_active=1,
      start_at=excluded.start_at,
      expire_at=excluded.expire_at,
      updated_by=excluded.updated_by,
      updated_at=excluded.updated_at
  `).run(groupId, start.toISO(), expireAt.toISO(), updatedBy, now.toISO());

  return getRental(groupId);
}

function deactivateRental(groupId, updatedBy) {
  const now = nowWibIso();
  db.prepare(`INSERT INTO group_rentals (group_id, is_active, updated_by, updated_at) VALUES (?, 0, ?, ?) ON CONFLICT(group_id) DO UPDATE SET is_active=0, updated_by=excluded.updated_by, updated_at=excluded.updated_at`).run(groupId, updatedBy, now);
}

function markWarned(groupId) {
  db.prepare('UPDATE group_rentals SET last_warned_at=? WHERE group_id=?').run(nowWibIso(), groupId);
}

function addOwner(userNumber, userJid) {
  const now = nowWibIso();
  db.prepare(`INSERT INTO bot_owners (user_number, user_jid, claimed_at) VALUES (?, ?, ?) ON CONFLICT(user_number) DO UPDATE SET user_jid=excluded.user_jid, claimed_at=excluded.claimed_at`).run(userNumber, userJid, now);
}

function getOwnerNumbers() {
  const rows = db.prepare('SELECT user_number FROM bot_owners').all();
  return rows.map((r) => r.user_number);
}

module.exports = {
  db,
  insertTransaction,
  updateTransaction,
  softDeleteTransaction,
  getRental,
  isRentalActive,
  extendRental,
  deactivateRental,
  markWarned,
  addOwner,
  getOwnerNumbers,
  nowWibIso
};
