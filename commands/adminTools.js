const { db } = require('../db/database');

const pendingClear = new Map();

function key(groupId, senderId) {
  return `${groupId}::${senderId}`;
}

function handleClearAll(ctx, canManage, clearCallbacks = []) {
  const raw = ctx.text.trim().toLowerCase();
  if (raw !== 'clearall' && raw !== 'clearall yes') return null;

  if (!canManage) return '❌ Anda tidak memiliki akses untuk perintah ini.';

  const k = key(ctx.groupId, ctx.senderId);

  if (raw === 'clearall') {
    pendingClear.set(k, Date.now());
    return ['⚠️ Yakin ingin menghapus semua data grup ini?', '', 'Ketik:', 'clearall yes', 'untuk melanjutkan.'].join('\n');
  }

  if (!pendingClear.has(k)) {
    return 'Ketik clearall dulu untuk konfirmasi.';
  }
  pendingClear.delete(k);

  const txIds = db.prepare('SELECT id FROM transactions WHERE group_id=?').all(ctx.groupId).map((r) => r.id);
  const remIds = db.prepare('SELECT id FROM reminders WHERE group_id=?').all(ctx.groupId).map((r) => r.id);

  const run = db.transaction(() => {
    db.prepare('DELETE FROM transactions WHERE group_id=?').run(ctx.groupId);
    db.prepare('DELETE FROM participants WHERE group_id=?').run(ctx.groupId);
    db.prepare('DELETE FROM custom_commands WHERE group_id=?').run(ctx.groupId);
    db.prepare('DELETE FROM todos WHERE group_id=?').run(ctx.groupId);
    db.prepare('DELETE FROM reminders WHERE group_id=?').run(ctx.groupId);
    db.prepare('DELETE FROM group_settings WHERE group_id=?').run(ctx.groupId);
    for (const id of remIds) db.prepare('DELETE FROM reminder_dispatch WHERE reminder_id=?').run(id);
  });

  run();
  clearCallbacks.forEach((fn) => {
    try { fn(ctx.groupId); } catch {}
  });

  return ['✅ Semua data grup berhasil direset.', '', 'Database grup ini sudah dimulai dari awal.'].join('\n');
}

module.exports = { handleClearAll };
