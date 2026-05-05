const fs = require('fs');
const { DateTime } = require('luxon');
const { db } = require('../db/database');
const { TIMEZONE } = require('../config');

function nowIso() {
  return DateTime.now().setZone(TIMEZONE).toISO();
}

function normalizeKeyword(keyword = '') {
  return keyword.trim().toUpperCase();
}

async function handleSaveCommand(ctx, canManage) {
  const raw = ctx.text.trim();
  if (raw.toLowerCase() === 'command') {
    return ['⚠️ Format yang benar:', 'command KEYWORD@(output)', '', 'Contoh:', 'command RAB@RAB Open Trip Papandayan'].join('\n');
  }
  if (!/^command\s+/i.test(raw)) return null;
  if (!canManage) return '❌ Anda tidak memiliki akses untuk perintah ini.';

  const body = raw.replace(/^command\s+/i, '');
  const at = body.indexOf('@');
  if (at <= 0 || at === body.length - 1) return 'Format salah. Contoh: command RAB@RAB OT Papandayan Dst';

  const keyword = normalizeKeyword(body.slice(0, at));
  const response = body.slice(at + 1).trim();

  if (!keyword) return 'Keyword wajib diisi.';
  if (keyword.length > 20) return 'Keyword maksimal 20 karakter.';
  if (!response) return 'Output wajib diisi.';

  const mediaType = ctx.commandMedia?.type || null;
  const mediaPath = ctx.commandMedia?.path || null;

  const existing = db.prepare('SELECT id FROM custom_commands WHERE group_id=? AND keyword=?').get(ctx.groupId, keyword);
  const now = nowIso();
  if (existing) {
    db.prepare(`
      UPDATE custom_commands
      SET response=?, media_path=COALESCE(?, media_path), media_type=COALESCE(?, media_type), caption_text=?, updated_at=?, deleted_at=NULL
      WHERE id=?
    `).run(response, mediaPath, mediaType, response, now, existing.id);
  } else {
    db.prepare(`
      INSERT INTO custom_commands (group_id, keyword, response, media_path, media_type, caption_text, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(ctx.groupId, keyword, response, mediaPath, mediaType, response, now, now);
  }

  return mediaPath ? `✅ Command "${keyword}" disimpan (dengan foto)` : `✅ Command "${keyword}" disimpan`;
}

function handleListCommand(ctx) {
  if (!/^listcommand$/i.test(ctx.text.trim())) return null;
  const rows = db.prepare(`SELECT keyword FROM custom_commands WHERE group_id=? AND deleted_at IS NULL ORDER BY keyword ASC`).all(ctx.groupId);
  if (!rows.length) return '📌 LIST COMMAND\n- Belum ada command custom.';
  return ['📌 LIST COMMAND', ...rows.map((r, i) => `${i + 1}) ${r.keyword}`)].join('\n');
}

function handleDeleteCommand(ctx, canManage) {
  const raw = ctx.text.trim();
  if (raw.toLowerCase() === 'delcommand') {
    return ['⚠️ Format yang benar:', 'delcommand (keyword)', '', 'Contoh:', 'delcommand RAB'].join('\n');
  }
  const m = raw.match(/^delcommand\s+(.+)$/i);
  if (!m) return null;
  if (!canManage) return '❌ Anda tidak memiliki akses untuk perintah ini.';

  const keyword = normalizeKeyword(m[1]);
  const now = nowIso();
  const res = db.prepare(`UPDATE custom_commands SET deleted_at=?, updated_at=? WHERE group_id=? AND keyword=? AND deleted_at IS NULL`).run(now, now, ctx.groupId, keyword);
  if (!res.changes) return `Command "${keyword}" tidak ditemukan.`;
  return `🗑️ Command "${keyword}" dihapus`;
}

function handleDetailCommand(ctx) {
  const m = ctx.text.trim().match(/^detailcommand\s+(.+)$/i);
  if (!m) return null;
  const keyword = normalizeKeyword(m[1]);
  const row = db.prepare(`SELECT response, media_type FROM custom_commands WHERE group_id=? AND keyword=? AND deleted_at IS NULL`).get(ctx.groupId, keyword);
  if (!row) return `Command "${keyword}" tidak ditemukan.`;
  return `📌 DETAIL COMMAND ${keyword}${row.media_type ? `\nMedia: ${row.media_type}` : ''}\n${row.response}`;
}

function handleAutoResponse(ctx) {
  const keyword = normalizeKeyword(ctx.text);
  if (!keyword) return null;
  const row = db.prepare(`SELECT response, media_path, media_type, caption_text FROM custom_commands WHERE group_id=? AND keyword=? AND deleted_at IS NULL`).get(ctx.groupId, keyword);
  if (!row) return null;
  if (row.media_type === 'image' && row.media_path && fs.existsSync(row.media_path)) {
    return { type: 'image', caption: row.caption_text || row.response, imageBuffer: fs.readFileSync(row.media_path) };
  }
  return { type: 'text', text: row.response };
}

module.exports = { handleSaveCommand, handleListCommand, handleDeleteCommand, handleDetailCommand, handleAutoResponse };
