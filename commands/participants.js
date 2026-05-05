const { DateTime } = require('luxon');
const { db } = require('../db/database');
const { TIMEZONE } = require('../config');

const PAGE_SIZE = 14;
const lastParticipantList = new Map();

const DEFAULT_HEADER = [
  'PESERTA',
  'KEGIATAN OPENTRIP',
  'NAMA KEGIATAN',
  '',
  '🗓️ Tanggal: -',
  '⏰ Durasi: -',
  '📍 Meeting Point: -'
].join('\n');

function nowIso() {
  return DateTime.now().setZone(TIMEZONE).toISO();
}

function cacheKey(groupId, senderId) {
  return `${groupId}::${senderId}`;
}

function getHeader(groupId) {
  const row = db.prepare('SELECT header_text FROM group_settings WHERE group_id=?').get(groupId);
  return row?.header_text || DEFAULT_HEADER;
}

function setHeader(groupId, text) {
  db.prepare(`
    INSERT INTO group_settings (group_id, header_text, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(group_id) DO UPDATE SET
      header_text=excluded.header_text,
      updated_at=excluded.updated_at
  `).run(groupId, text, nowIso());
}

function handleSetHeader(ctx, canManage) {
  if (ctx.text.trim().toLowerCase() === 'setheader') {
    return ['⚠️ Format yang benar:', 'setheader@(text)', '', 'Contoh:', 'setheader@PESERTA\nOPEN TRIP PAPANDAYAN\nTanggal: 28 Maret 2026\nMeeting Point: Bogor'].join('\n');
  }
  if (!/^setheader@/i.test(ctx.text.trim())) return null;
  if (!canManage) return '❌ Anda tidak memiliki akses untuk perintah ini.';

  const value = ctx.text.trim().replace(/^setheader@/i, '').trim();
  if (!value) return 'Format salah. Contoh: setheader@PESERTA\nOPEN TRIP PAPANDAYAN\n...';

  setHeader(ctx.groupId, value);
  return '✅ Header list peserta berhasil diupdate.';
}

function handleListPeserta(ctx) {
  const m = ctx.text.trim().match(/^listpeserta(?:\s+(\d+))?$/i);
  if (!m) return null;

  const page = Math.max(1, Number.parseInt(m[1] || '1', 10));
  const offset = (page - 1) * PAGE_SIZE;

  const total = db.prepare('SELECT COUNT(*) as total FROM participants WHERE group_id=? AND deleted_at IS NULL').get(ctx.groupId).total;
  const header = getHeader(ctx.groupId);

  if (!total) return `${header}\n\nList of names:\n- Belum ada peserta.`;

  const rows = db.prepare(`
    SELECT * FROM participants
    WHERE group_id=? AND deleted_at IS NULL
    ORDER BY datetime(created_at) ASC
    LIMIT ? OFFSET ?
  `).all(ctx.groupId, PAGE_SIZE, offset);

  if (!rows.length) return `Halaman ${page} kosong. Total peserta: ${total}.`;

  lastParticipantList.set(cacheKey(ctx.groupId, ctx.senderId), rows.map((r) => r.id));
  const startNo = offset + 1;
  const lines = rows.map((r, idx) => `${startNo + idx}) ${r.name}`);

  const pageCount = Math.ceil(total / PAGE_SIZE);
  const footer = ['', 'Ketik nomor untuk lihat data peserta.'];
  if (page < pageCount) footer.push(`Ketik listpeserta ${page + 1} untuk halaman ${page + 1}.`);

  return [header, '', 'List of names:', ...lines, ...footer].join('\n');
}

function resolveIdFromCache(ctx, no) {
  const ids = lastParticipantList.get(cacheKey(ctx.groupId, ctx.senderId)) || [];
  return ids[no - 1] || null;
}

function handleNumericDetail(ctx) {
  if (!/^\d+$/.test(ctx.text.trim())) return null;
  const no = Number.parseInt(ctx.text.trim(), 10);
  const id = resolveIdFromCache(ctx, no);
  if (!id) return null;

  const row = db.prepare('SELECT * FROM participants WHERE id=? AND deleted_at IS NULL').get(id);
  if (!row) return 'Peserta tidak ditemukan / sudah dihapus.';

  return [`👤 DETAIL PESERTA #${no}`, `Nama: ${row.name}`, 'Data:', row.data].join('\n');
}

function handleAddPeserta(ctx, canManage) {
  if (ctx.text.trim().toLowerCase() === 'addpeserta') {
    return ['⚠️ Format yang benar:', 'addpeserta (nama)@(data)', '', 'Contoh:', 'addpeserta Radit@(No HP: 08xxx | Kota: Bogor)'].join('\n');
  }
  if (!/^addpeserta\s+/i.test(ctx.text.trim())) return null;
  if (!canManage) return '❌ Anda tidak memiliki akses untuk perintah ini.';

  const raw = ctx.text.trim().replace(/^addpeserta\s+/i, '');
  const atIndex = raw.indexOf('@');
  if (atIndex <= 0 || atIndex === raw.length - 1) return 'Format salah. Contoh: addpeserta Radit@(No HP: 08xxx | Kota: Bogor)';

  const name = raw.slice(0, atIndex).trim();
  const data = raw.slice(atIndex + 1).trim();
  if (!name || !data) return 'Nama dan data wajib diisi.';

  const now = nowIso();
  db.prepare('INSERT INTO participants (group_id, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(ctx.groupId, name, data, now, now);
  const position = db.prepare('SELECT COUNT(*) as total FROM participants WHERE group_id=? AND deleted_at IS NULL').get(ctx.groupId).total;

  return ['✅ Peserta ditambahkan', `Nama: ${name}`, `No urut: ${position}`].join('\n');
}

function handleDeletePeserta(ctx, canManage) {
  if (ctx.text.trim().toLowerCase() === 'delpeserta') return ['⚠️ Format yang benar:', 'delpeserta no 4'].join('\n');
  const m = ctx.text.trim().match(/^delpeserta\s+no\s+(\d+)$/i);
  if (!m) return null;
  if (!canManage) return '❌ Anda tidak memiliki akses untuk perintah ini.';

  const no = Number.parseInt(m[1], 10);
  const id = resolveIdFromCache(ctx, no);
  if (!id) return 'Nomor peserta tidak ditemukan. Jalankan listpeserta dulu.';

  const now = nowIso();
  const updated = db.prepare('UPDATE participants SET deleted_at=?, updated_at=? WHERE id=? AND deleted_at IS NULL').run(now, now, id);
  if (!updated.changes) return 'Peserta tidak ditemukan / sudah dihapus.';
  return `🗑️ Peserta #${no} berhasil dihapus`;
}

function handleUpdatePeserta(ctx, canManage) {
  const raw = ctx.text.trim();
  if (raw.toLowerCase() === 'updatepeserta') {
    return ['⚠️ Format yang benar:', 'updatepeserta no 4@(data baru)', '', 'Contoh:', 'updatepeserta no 4@(No HP: 08xxx | Kota: Bogor | Sudah DP)'].join('\n');
  }
  if (!/^updatepeserta\s+no\s+/i.test(raw)) return null;
  if (!canManage) return '❌ Anda tidak memiliki akses untuk perintah ini.';

  const m = raw.match(/^updatepeserta\s+no\s+(\d+)@([\s\S]+)$/i);
  if (!m) return 'Format salah. Contoh: updatepeserta no 4@(No HP: ... | Update data ...)';

  const no = Number.parseInt(m[1], 10);
  const newData = m[2].trim();
  if (!newData) return 'Data baru wajib diisi.';

  const id = resolveIdFromCache(ctx, no);
  if (!id) return 'Nomor peserta tidak ditemukan. Jalankan listpeserta dulu.';

  const updated = db.prepare('UPDATE participants SET data=?, updated_at=? WHERE id=? AND deleted_at IS NULL').run(newData, nowIso(), id);
  if (!updated.changes) return 'Peserta tidak ditemukan / sudah dihapus.';
  return `✏️ Peserta #${no} berhasil diupdate`;
}


function clearGroupCache(groupId) {
  for (const k of lastParticipantList.keys()) {
    if (k.startsWith(`${groupId}::`)) lastParticipantList.delete(k);
  }
}

module.exports = { handleSetHeader, handleListPeserta, handleNumericDetail, handleAddPeserta, handleDeletePeserta, handleUpdatePeserta, clearGroupCache };
