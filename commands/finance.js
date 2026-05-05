const { DateTime } = require('luxon');
const { db, insertTransaction, updateTransaction, softDeleteTransaction } = require('../db/database');
const { parseTxInput, parseEdit, parseNoCommand } = require('../utils/parser');
const { formatRupiah, formatWib, parseIsoDateRange, dayRange, monthRange } = require('../utils/format');
const { TIMEZONE } = require('../config');

const historyCache = new Map();

function cacheKey(groupId, senderId) {
  return `${groupId}::${senderId}`;
}

function clearGroupCache(groupId) {
  for (const key of historyCache.keys()) {
    if (key.startsWith(`${groupId}::`)) historyCache.delete(key);
  }
}

function formatRiwayatHelp() {
  return [
    '📒 FORMAT RIWAYAT',
    '',
    'Gunakan salah satu format berikut:',
    '',
    '• riwayat',
    '  Melihat riwayat terbaru',
    '',
    '• riwayat 50',
    '  Melihat 50 data terakhir',
    '',
    '• riwayat hari ini',
    '  Melihat transaksi hari ini',
    '',
    '• riwayat 2026-02-18',
    '  Melihat transaksi pada tanggal tertentu',
    '',
    '• riwayat 2026-02-01 2026-02-18',
    '  Melihat transaksi dalam rentang tanggal'
  ].join('\n');
}

function formatTransactionHelp() {
  return [
    '💰 FORMAT INPUT TRANSAKSI',
    '',
    'Pemasukan:',
    '+ 15000 (Donasi Pak RT)',
    '',
    'Pengeluaran:',
    '- 12000 (Beli air mineral)',
    '',
    'Catatan:',
    'Gunakan nominal dan catatan agar transaksi bisa disimpan dengan benar.'
  ].join('\n');
}

function parseRiwayatArg(text) {
  const arg = text.trim().toLowerCase();
  if (!arg) return { type: 'latest', limit: 20, label: '20 terakhir' };
  if (/^\d+$/.test(arg)) {
    const limit = Math.min(200, Math.max(1, Number.parseInt(arg, 10)));
    return { type: 'latest', limit, label: `${limit} terakhir` };
  }
  if (arg === 'hari ini') return { type: 'range', ...dayRange(0), label: 'hari ini' };
  if (arg === 'kemarin') return { type: 'range', ...dayRange(-1), label: 'kemarin' };
  const parts = arg.split(/\s+/);
  if (parts.length === 1) {
    const r = parseIsoDateRange(parts[0]);
    if (r) return { type: 'range', ...r, label: parts[0] };
  }
  if (parts.length === 2) {
    const r1 = parseIsoDateRange(parts[0]);
    const r2 = parseIsoDateRange(parts[1]);
    if (r1 && r2) return { type: 'range', start: r1.start, end: r2.end, label: `${parts[0]} s/d ${parts[1]}` };
  }
  return null;
}

async function recordTransaction(ctx) {
  const parsed = parseTxInput(ctx.text);
  if (!parsed) return null;
  insertTransaction({
    group_id: ctx.groupId,
    type: parsed.type,
    amount: parsed.amount,
    note: parsed.note,
    sender_id: ctx.senderId,
    sender_name: ctx.senderName,
    created_at: DateTime.now().setZone(TIMEZONE).toISO()
  });
  return `✅ Tercatat: ${parsed.type === 'income' ? '+' : '-'}${formatRupiah(parsed.amount)} (${parsed.note})`;
}

async function riwayat(ctx) {
  if (!/^riwayat(\s+.*)?$/i.test(ctx.text)) return null;
  const filter = parseRiwayatArg(ctx.text.replace(/^riwayat/i, '').trim());
  if (!filter) return formatRiwayatHelp();

  let rows;
  if (filter.type === 'latest') {
    rows = db.prepare('SELECT * FROM transactions WHERE group_id=? AND deleted_at IS NULL ORDER BY datetime(created_at) DESC LIMIT ?').all(ctx.groupId, filter.limit);
  } else {
    rows = db.prepare('SELECT * FROM transactions WHERE group_id=? AND deleted_at IS NULL AND datetime(created_at) >= datetime(?) AND datetime(created_at) < datetime(?) ORDER BY datetime(created_at) DESC').all(ctx.groupId, filter.start, filter.end);
  }

  if (!rows.length) return '📭 Belum ada data transaksi.';
  historyCache.set(cacheKey(ctx.groupId, ctx.senderId), rows.map((r) => r.id));
  const lines = rows.map((r, i) => `${i + 1}) ${formatWib(r.created_at)} | ${r.type === 'income' ? '+' : '-'}${formatRupiah(r.amount)} | ${r.note}`);
  return [`📒 RIWAYAT KEUANGAN (${filter.label})`, ...lines].join('\n');
}

async function detail(ctx) {
  const no = parseNoCommand(ctx.text, 'detail');
  if (!no) return null;
  const ids = historyCache.get(cacheKey(ctx.groupId, ctx.senderId)) || [];
  const id = ids[no - 1];
  if (!id) return 'Nomor tidak ditemukan. Jalankan riwayat dulu.';
  const tx = db.prepare('SELECT * FROM transactions WHERE id=?').get(id);
  if (!tx) return 'Data tidak ditemukan.';
  return [`🧾 DETAIL #${no}`, `ID: ${tx.id}`, `Group: ${tx.group_id}`, `Tipe: ${tx.type}`, `Nominal: ${tx.type === 'income' ? '+' : '-'}${formatRupiah(tx.amount)}`, `Catatan: ${tx.note}`, `Pengirim: ${tx.sender_name || '-'} (${tx.sender_id})`, `Dibuat: ${formatWib(tx.created_at)}`, `Edited: ${tx.edited_at ? formatWib(tx.edited_at) : '-'}`, `Deleted: ${tx.deleted_at ? formatWib(tx.deleted_at) : '-'}`].join('\n');
}

async function edit(ctx, isAdmin) {
  const parsed = parseEdit(ctx.text);
  if (!parsed) return null;
  const ids = historyCache.get(cacheKey(ctx.groupId, ctx.senderId)) || [];
  const id = ids[parsed.no - 1];
  if (!id) return 'Nomor tidak ditemukan. Jalankan riwayat dulu.';
  const tx = db.prepare('SELECT * FROM transactions WHERE id=? AND deleted_at IS NULL').get(id);
  if (!tx) return 'Transaksi tidak ditemukan atau sudah dihapus.';
  if (!isAdmin && tx.sender_id !== ctx.senderId) return '❌ Anda tidak memiliki akses untuk perintah ini.';
  updateTransaction({ id, type: parsed.type, amount: parsed.amount, note: parsed.note, edited_at: DateTime.now().setZone(TIMEZONE).toISO() });
  return `✅ Transaksi #${parsed.no} diperbarui: ${parsed.type === 'income' ? '+' : '-'}${formatRupiah(parsed.amount)} (${parsed.note})`;
}

async function remove(ctx, isAdmin) {
  const no = parseNoCommand(ctx.text, 'hapus');
  if (!no) return null;
  const ids = historyCache.get(cacheKey(ctx.groupId, ctx.senderId)) || [];
  const id = ids[no - 1];
  if (!id) return 'Nomor tidak ditemukan. Jalankan riwayat dulu.';
  const tx = db.prepare('SELECT * FROM transactions WHERE id=? AND deleted_at IS NULL').get(id);
  if (!tx) return 'Transaksi tidak ditemukan atau sudah dihapus.';
  if (!isAdmin && tx.sender_id !== ctx.senderId) return '❌ Anda tidak memiliki akses untuk perintah ini.';
  softDeleteTransaction(id);
  return `🗑️ Transaksi #${no} dihapus (soft delete).`;
}

async function saldo(ctx) {
  if (!/^saldo(\s+.*)?$/i.test(ctx.text)) return null;
  const arg = ctx.text.replace(/^saldo/i, '').trim().toLowerCase();
  let range = null;
  if (!arg) range = null;
  else if (arg === 'hari ini') range = dayRange(0);
  else if (arg === 'bulan ini') range = monthRange();
  else return 'Format saldo salah. Pakai: saldo | saldo hari ini | saldo bulan ini';

  const where = range ? 'group_id=? AND deleted_at IS NULL AND datetime(created_at)>=datetime(?) AND datetime(created_at)<datetime(?)' : 'group_id=? AND deleted_at IS NULL';
  const params = range ? [ctx.groupId, range.start, range.end] : [ctx.groupId];
  const income = db.prepare(`SELECT COALESCE(SUM(amount),0) total FROM transactions WHERE ${where} AND type='income'`).get(...params).total;
  const expense = db.prepare(`SELECT COALESCE(SUM(amount),0) total FROM transactions WHERE ${where} AND type='expense'`).get(...params).total;
  return ['💰 RINGKASAN', `Pemasukan: ${formatRupiah(income)}`, `Pengeluaran: ${formatRupiah(expense)}`, `Saldo: ${formatRupiah(income - expense)}`].join('\n');
}

module.exports = { recordTransaction, riwayat, detail, edit, remove, saldo, formatRiwayatHelp, formatTransactionHelp, clearGroupCache };
