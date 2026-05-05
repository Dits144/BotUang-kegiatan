const { DateTime } = require('luxon');
const { db } = require('../db/database');
const { TIMEZONE } = require('../config');

let workerStarted = false;

function now() {
  return DateTime.now().setZone(TIMEZONE);
}

function nowIso() {
  return now().toISO();
}

function parseRemind(raw) {
  const m = raw.match(/^remind\s+([^@]+)@([\s\S]+)$/i);
  if (!m) return null;
  const when = m[1].trim();
  const text = m[2].trim();
  if (!when || !text) return null;

  if (/^\d{2}:\d{2}$/.test(when)) return { type: 'time', value: when, text };
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(when)) return { type: 'date', value: when, text };
  return { error: 'Format waktu/tanggal salah. Pakai HH:mm atau DD/MM/YYYY.' };
}

function handleRemind(ctx, canManage) {
  if (ctx.text.trim().toLowerCase() === 'remind') return ['⚠️ Format yang benar:', 'remind (time/date)@(text)', '', 'Contoh:', 'remind 05:00@bangun sholat subuh', 'remind 17/08/2026@Peringatan Kemerdekaan Indonesia'].join('\n');
  if (!/^remind\s+/i.test(ctx.text.trim())) return null;
  if (!canManage) return '❌ Anda tidak memiliki akses untuk perintah ini.';

  const parsed = parseRemind(ctx.text.trim());
  if (!parsed) return 'Format salah. Contoh: remind 05:00@bangun sholat subuh atau remind 17/08/2026@Peringatan Kemerdekaan Indonesia';
  if (parsed.error) return parsed.error;

  db.prepare(`
    INSERT INTO reminders (group_id, remind_type, remind_value, remind_text, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(ctx.groupId, parsed.type, parsed.value, parsed.text, nowIso(), ctx.senderId);

  return `⏰ Reminder disimpan: ${parsed.value} - ${parsed.text}`;
}

function handleListRemind(ctx) {
  if (!/^listremind$/i.test(ctx.text.trim())) return null;

  const rows = db.prepare(`
    SELECT * FROM reminders
    WHERE group_id=? AND deleted_at IS NULL
    ORDER BY datetime(created_at) ASC
  `).all(ctx.groupId);

  if (!rows.length) return '📭 Belum ada reminder.';
  const lines = rows.map((r, i) => `${i + 1}) ${r.remind_value} | ${r.remind_text}`);
  return ['⏰ LIST REMINDER', ...lines].join('\n');
}

function handleNoRemind(ctx, canManage) {
  if (ctx.text.trim().toLowerCase() === 'noremind') return ['⚠️ Format yang benar:', 'noremind (time/date)', '', 'Contoh:', 'noremind 05:00'].join('\n');
  const m = ctx.text.trim().match(/^noremind\s+(.+)$/i);
  if (!m) return null;
  if (!canManage) return '❌ Anda tidak memiliki akses untuk perintah ini.';

  const value = m[1].trim();
  if (!value) return 'Format salah. Contoh: noremind 05:00 atau noremind 17/08/2026';

  const res = db.prepare(`
    UPDATE reminders
    SET deleted_at=?
    WHERE group_id=? AND remind_value=? AND deleted_at IS NULL
  `).run(nowIso(), ctx.groupId, value);

  if (!res.changes) return `Reminder ${value} tidak ditemukan.`;
  return `🗑️ Reminder ${value} dihapus.`;
}

async function processDueReminders(sock) {
  const current = now();
  const hhmm = current.toFormat('HH:mm');
  const ddmmyyyy = current.toFormat('dd/MM/yyyy');

  const rows = db.prepare(`
    SELECT * FROM reminders
    WHERE deleted_at IS NULL
  `).all();

  for (const r of rows) {
    const isDue = (r.remind_type === 'time' && r.remind_value === hhmm)
      || (r.remind_type === 'date' && r.remind_value === ddmmyyyy);
    if (!isDue) continue;

    const dispatchKey = r.remind_type === 'time'
      ? `${r.id}:${ddmmyyyy}:${hhmm}`
      : `${r.id}:${ddmmyyyy}`;

    try {
      const inserted = db.prepare(`
        INSERT OR IGNORE INTO reminder_dispatch (dispatch_key, reminder_id, sent_at)
        VALUES (?, ?, ?)
      `).run(dispatchKey, r.id, nowIso());

      if (!inserted.changes) continue;

      await sock.sendMessage(r.group_id, {
        text: `⏰ Reminder\n${r.remind_value} - ${r.remind_text}`
      });
    } catch (e) {
      console.error('Reminder send error:', e.message);
    }
  }
}

function startReminderWorker(sock) {
  if (workerStarted) return;
  workerStarted = true;
  setInterval(() => {
    processDueReminders(sock).catch((e) => console.error('Reminder worker error:', e.message));
  }, 30000);
}

module.exports = { handleRemind, handleListRemind, handleNoRemind, startReminderWorker };
