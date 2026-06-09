const { DateTime } = require('luxon');
const { db } = require('../db/database');
const { TIMEZONE } = require('../config');

let workerStarted = false;
let activeSock = null;

function now() {
  return DateTime.now().setZone(TIMEZONE);
}

function nowIso() {
  return now().toISO();
}


/* ─── Ensure reminder_dispatch table exists with all needed cols ─── */
db.exec(`
  CREATE TABLE IF NOT EXISTS reminder_dispatch (
    dispatch_key TEXT PRIMARY KEY,
    reminder_id  INTEGER NOT NULL,
    sent_at      TEXT    NOT NULL
  );
`);

/* ─── Parse remind command ─── */
function parseRemind(raw) {
  const m = raw.match(/^remind\s+([^@]+)@([\s\S]+)$/i);
  if (!m) return null;
  const when = m[1].trim();
  const text  = m[2].trim();
  if (!when || !text) return null;

  if (/^\d{2}:\d{2}$/.test(when))                         return { type: 'time',     value: when, text };
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(when))                 return { type: 'date',     value: when, text };
  if (/^\d{2}:\d{2}&\d{2}\/\d{2}\/\d{4}$/.test(when))    return { type: 'datetime', value: when, text };
  return { error: 'Format waktu/tanggal salah.' };
}

/* ─── Handlers ─── */
function handleRemind(ctx, canManage) {
  if (!/^remind\s+/i.test(ctx.text.trim())) return null;
  if (!canManage) return '❌ Anda tidak memiliki akses untuk perintah ini.';

  const parsed = parseRemind(ctx.text.trim());
  if (!parsed || parsed.error) {
    return [
      '⚠️ *Format Reminder Salah*',
      '',
      'Gunakan salah satu format berikut:',
      '🕐 Berdasarkan jam   : remind 05:00@pesan',
      '📅 Berdasarkan tanggal: remind 17/08/2026@pesan',
      '📅🕐 Tanggal & jam   : remind 09:00&17/08/2026@pesan'
    ].join('\n');
  }

  db.prepare(`
    INSERT INTO reminders (group_id, remind_type, remind_value, remind_text, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(ctx.groupId, parsed.type, parsed.value, parsed.text, nowIso(), ctx.senderId);

  const typeLabel = { time: '⏰ Jam', date: '📅 Tanggal', datetime: '📅⏰ Tanggal & Jam' }[parsed.type];
  return [
    '✅ *Reminder Disimpan*',
    '',
    `${typeLabel}: ${parsed.value}`,
    `📝 Pesan: ${parsed.text}`
  ].join('\n');
}

function handleListRemind(ctx) {
  if (!/^listremind$/i.test(ctx.text.trim())) return null;

  const rows = db.prepare(`
    SELECT * FROM reminders
    WHERE group_id=? AND deleted_at IS NULL
    ORDER BY datetime(created_at) ASC
  `).all(ctx.groupId);

  if (!rows.length) return '📭 Belum ada reminder aktif.';

  const typeEmoji = { time: '⏰', date: '📅', datetime: '📅⏰' };
  const lines = rows.map((r, i) => `${i + 1}) ${typeEmoji[r.remind_type] || '🔔'} ${r.remind_value} | ${r.remind_text}`);
  return ['⏰ *LIST REMINDER AKTIF*', '', ...lines].join('\n');
}

function handleNoRemind(ctx, canManage) {
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

  if (!res.changes) return `❌ Reminder "${value}" tidak ditemukan.`;
  return `🗑️ Reminder *${value}* berhasil dihapus.`;
}

/* ─── Worker ─── */
async function processDueReminders() {
  const sock = activeSock;
  if (!sock) return;
  const current   = now();
  const hhmm      = current.toFormat('HH:mm');
  const ddmmyyyy  = current.toFormat('dd/MM/yyyy');

  let rows;
  try {
    rows = db.prepare(`SELECT * FROM reminders WHERE deleted_at IS NULL`).all();
  } catch (e) {
    console.error('[Reminder] DB read error:', e.message);
    return;
  }

  for (const r of rows) {
    /* Build dispatch key so we only fire once per window */
    let dispatchKey;
    if (r.remind_type === 'time') {
      dispatchKey = `t:${r.id}:${ddmmyyyy}:${hhmm}`;
    } else if (r.remind_type === 'date') {
      dispatchKey = `d:${r.id}:${r.remind_value}`;
    } else if (r.remind_type === 'datetime') {
      dispatchKey = `dt:${r.id}:${r.remind_value}`;
    } else {
      continue;
    }

    /* Check if due */
    let isDue = false;
    if (r.remind_type === 'time') {
      isDue = (r.remind_value === hhmm);
    } else if (r.remind_type === 'date') {
      try {
        const [day, month, year] = r.remind_value.split('/').map(Number);
        const scheduled = DateTime.fromObject({ year, month, day, hour: 0, minute: 0 }, { zone: TIMEZONE });
        isDue = scheduled.isValid && (scheduled <= current);
      } catch (e) {
        isDue = (r.remind_value === ddmmyyyy);
      }
    } else if (r.remind_type === 'datetime') {
      try {
        if (r.remind_value.includes('&')) {
          const [timePart, datePart] = r.remind_value.split('&');
          const [hour, minute] = timePart.split(':').map(Number);
          const [day, month, year] = datePart.split('/').map(Number);
          const scheduled = DateTime.fromObject({ year, month, day, hour, minute }, { zone: TIMEZONE });
          isDue = scheduled.isValid && (scheduled <= current);
        } else {
          const scheduled = DateTime.fromISO(r.remind_value, { zone: TIMEZONE });
          isDue = scheduled.isValid && (scheduled <= current);
        }
      } catch (e) {
        isDue = (r.remind_value === `${hhmm}&${ddmmyyyy}`);
      }
    }

    if (!isDue) continue;

    /* Try to insert dispatch record – if already exists, skip */
    let inserted;
    try {
      inserted = db.prepare(`
        INSERT OR IGNORE INTO reminder_dispatch (dispatch_key, reminder_id, sent_at)
        VALUES (?, ?, ?)
      `).run(dispatchKey, r.id, nowIso());
    } catch (e) {
      console.error('[Reminder] Dispatch insert error:', e.message);
      continue;
    }

    if (!inserted.changes) continue; // already sent this window

    /* Send message */
    try {
      await sock.sendMessage(r.group_id, {
        text: `⏰ *REMINDER*\n\n${r.remind_text}`
      });
      console.log(`[Reminder] Sent reminder ${r.id} to ${r.group_id}`);
    } catch (e) {
      console.error(`[Reminder] Send error for reminder ${r.id}:`, e.message);
      /* Roll back dispatch so it retries next tick */
      try {
        db.prepare('DELETE FROM reminder_dispatch WHERE dispatch_key=?').run(dispatchKey);
      } catch (_) { /* ignore */ }
    }
  }

  /* --- External Reminders dari Lovable Dashboard --- */
  try {
    const { getDueReminders, markReminderSent } = require('../utils/lovableApi');
    const externalReminders = await getDueReminders();
    
    if (externalReminders && Array.isArray(externalReminders) && externalReminders.length > 0) {
      for (const ext of externalReminders) {
        try {
          await sock.sendMessage(ext.group_jid, {
            text: `⏰ *REMINDER*\n\n${ext.message}`
          });
          console.log(`[Reminder] Sent external reminder ${ext.id} to ${ext.group_jid}`);
          
          // Tandai sudah terkirim di dashboard
          await markReminderSent(ext.id);
        } catch (e) {
          console.error(`[Reminder] Send error for external reminder ${ext.id}:`, e.message);
        }
      }
    }
  } catch (e) {
    console.error('[Reminder] External fetch error:', e.message);
  }
}

function startReminderWorker(sock) {
  activeSock = sock;
  if (workerStarted) return;
  workerStarted = true;

  /* Run immediately on start, then every 10 seconds */
  processDueReminders().catch((e) => console.error('[Reminder] Initial run error:', e.message));
  setInterval(() => {
    processDueReminders().catch((e) => console.error('[Reminder] Worker error:', e.message));
  }, 10_000); // 10 detik untuk lebih presisi

  console.log('[Reminder] Worker started (interval: 10s)');
}

module.exports = { handleRemind, handleListRemind, handleNoRemind, startReminderWorker };
