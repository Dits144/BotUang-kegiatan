const { DateTime } = require('luxon');
const { db, getRental, isRentalActive, markWarned } = require('../db/database');
const { formatWib, rentalStatusText } = require('../utils/format');
const { TIMEZONE } = require('../config');

/* ─── Peringatan H-1 sewa akan habis ─── */
function shouldWarnExpiring(groupId) {
  const rental = getRental(groupId);
  if (!rental || !rental.is_active || !rental.expire_at) return null;

  const nowDt = DateTime.now().setZone(TIMEZONE);
  const exp   = DateTime.fromISO(rental.expire_at, { zone: TIMEZONE });
  if (!exp.isValid || exp <= nowDt) return null;

  // Hitung sisa hari (pembulatan ke atas)
  const remainingDays = exp.diff(nowDt, 'days').days;
  // Hanya kirim peringatan saat sisa antara 1 hari s/d kurang dari 2 hari
  if (remainingDays >= 2 || remainingDays <= 0) return null;

  // Cek apakah sudah pernah warn hari ini
  if (rental.last_h1_warning_at) {
    const lastWarn = DateTime.fromISO(rental.last_h1_warning_at, { zone: TIMEZONE });
    if (lastWarn.isValid && lastWarn.hasSame(nowDt, 'day')) return null; // sudah warn hari ini
  }

  // Catat waktu warn
  db.prepare('UPDATE group_rentals SET last_h1_warning_at=? WHERE group_id=?').run(nowDt.toISO(), groupId);
  markWarned(groupId);

  return [
    '⚠️ *PERINGATAN SEWA BOT*',
    '',
    '⏳ Masa sewa bot akan habis *besok*!',
    '',
    `📅 Expired: ${formatWib(rental.expire_at)} WIB`,
    `⏱ Sisa waktu: ±${Math.ceil(remainingDays)} hari`,
    '',
    '💬 Segera hubungi owner untuk perpanjang sewa agar bot tetap aktif.'
  ].join('\n');
}

/* ─── Admin cek sewa grup sendiri ─── */
function handleCekSewa(ctx) {
  if (!/^cekaktif$/i.test(ctx.text.trim())) return null;

  const rental = getRental(ctx.groupId);
  const status = rentalStatusText(rental);

  if (status.status === 'AKTIF') {
    return [
      '📊 *STATUS SEWA BOT*',
      '',
      `✅ Status  : AKTIF`,
      `📅 Expired : ${formatWib(rental.expire_at)} WIB`,
      `⏱ Sisa    : ${status.remainingDays} hari`
    ].join('\n');
  }

  return [
    '📊 *STATUS SEWA BOT*',
    '',
    `❌ Status: TIDAK AKTIF / EXPIRED`,
    '',
    'Hubungi owner untuk mengaktifkan sewa.'
  ].join('\n');
}

/* ─── Admin cek / set PIN dashboard grup ─── */
function handlePinCommand(ctx, canAdminManage) {
  const text = ctx.text.trim();
  const isPin = /^pin$/i.test(text);
  const isSetPin = /^setpin(\s+(.+))?$/i.test(text);
  
  if (!isPin && !isSetPin) return null;

  if (!canAdminManage) {
    return '❌ Anda tidak memiliki akses untuk perintah ini.';
  }

  const rental = getRental(ctx.groupId);
  if (!rental) {
    return '❌ Grup ini belum terdaftar di sistem sewa.';
  }

  if (isPin) {
    if (rental.password) {
      return [
        '🔐 *PIN / PASSWORD GRUP*',
        '',
        `PIN saat ini: *${rental.password}*`,
        '',
        'Gunakan PIN ini untuk masuk ke dashboard manual di web.',
        'Ketik *setpin* untuk generate PIN baru secara acak.'
      ].join('\n');
    } else {
      // Generate new one automatically
      const newPin = Math.floor(100000 + Math.random() * 900000).toString();
      db.prepare('UPDATE group_rentals SET password = ? WHERE group_id = ?').run(newPin, ctx.groupId);
      return [
        '🔐 *PIN / PASSWORD GRUP BARU*',
        '',
        `PIN berhasil dibuat: *${newPin}*`,
        '',
        'Gunakan PIN ini untuk masuk ke dashboard manual di web.'
      ].join('\n');
    }
  }

  if (isSetPin) {
    const match = text.match(/^setpin\s+(.+)$/i);
    let newPin = '';
    if (match && match[1]) {
      newPin = match[1].trim();
      if (newPin.length < 4 || newPin.length > 20) {
        return '❌ PIN / Password baru harus terdiri dari 4 sampai 20 karakter.';
      }
    } else {
      // Generate random
      newPin = Math.floor(100000 + Math.random() * 900000).toString();
    }

    db.prepare('UPDATE group_rentals SET password = ? WHERE group_id = ?').run(newPin, ctx.groupId);
    return [
      '🔐 *PIN / PASSWORD GRUP BERHASIL DIUPDATE*',
      '',
      `PIN baru: *${newPin}*`,
      '',
      'Gunakan PIN ini untuk masuk ke dashboard manual di web.'
    ].join('\n');
  }

  return null;
}

module.exports = { isRentalActive, shouldWarnExpiring, handleCekSewa, handlePinCommand };
