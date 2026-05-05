const { DateTime } = require('luxon');
const { db } = require('../db/database');
const { TIMEZONE } = require('../config');

const listCache = new Map();

function nowIso() {
  return DateTime.now().setZone(TIMEZONE).toISO();
}

function key(groupId, senderId) {
  return `${groupId}::${senderId}`;
}

function handleTodo(ctx, canManage) {
  const text = ctx.text.trim();

  if (text.toLowerCase() === 'todo') {
    return ['⚠️ Format yang benar:', 'todo tambah (text)', '', 'Contoh:', 'todo tambah revisi skripsi'].join('\n');
  }
  if (text.toLowerCase() === 'doto') {
    return ['⚠️ Format yang benar:', 'doto (nomor)', '', 'Contoh:', 'doto 1'].join('\n');
  }

  if (/^todo\s+lihat$/i.test(text) || /^todolist$/i.test(text)) {
    const rows = db.prepare('SELECT * FROM todos WHERE group_id=? AND deleted_at IS NULL ORDER BY datetime(created_at) ASC').all(ctx.groupId);
    if (!rows.length) return '📝 TO DO LIST\n\n- Belum ada tugas.';
    listCache.set(key(ctx.groupId, ctx.senderId), rows.map((r) => r.id));
    const lines = rows.map((r, i) => `${i + 1}. ${r.is_done ? '✅' : '⬜'} ${r.todo_text}`);
    return ['📝 TO DO LIST', '', ...lines].join('\n');
  }

  const add = text.match(/^todo\s+tambah\s+([\s\S]+)$/i);
  if (add) {
    if (!canManage) return '❌ Anda tidak memiliki akses untuk perintah ini.';
    const todoText = add[1].trim();
    if (!todoText) return 'Format salah. Contoh: todo tambah revisi skripsi';
    const now = nowIso();
    db.prepare('INSERT INTO todos (group_id, todo_text, is_done, created_at, updated_at) VALUES (?, ?, 0, ?, ?)').run(ctx.groupId, todoText, now, now);
    return `✅ Todo ditambahkan: ${todoText}`;
  }

  const done = text.match(/^(?:todo\s+selesai|doto)\s+(\d+)$/i);
  if (done) {
    if (!canManage) return '❌ Anda tidak memiliki akses untuk perintah ini.';
    const no = Number.parseInt(done[1], 10);
    const ids = listCache.get(key(ctx.groupId, ctx.senderId)) || [];
    const id = ids[no - 1];
    if (!id) return 'Nomor todo tidak ditemukan. Jalankan todolist dulu.';
    const res = db.prepare('UPDATE todos SET is_done=1, updated_at=? WHERE id=? AND deleted_at IS NULL').run(nowIso(), id);
    if (!res.changes) return 'Todo tidak ditemukan.';
    return `✅ Todo #${no} selesai.`;
  }

  return null;
}


function clearGroupCache(groupId) {
  for (const k of listCache.keys()) {
    if (k.startsWith(`${groupId}::`)) listCache.delete(k);
  }
}

module.exports = { handleTodo, clearGroupCache };
