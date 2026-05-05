const { DateTime } = require('luxon');
const { db, getRental, isRentalActive, markWarned } = require('../db/database');
const { formatWib } = require('../utils/format');
const { TIMEZONE } = require('../config');

function shouldWarnExpiring(groupId) {
  const rental = getRental(groupId);
  if (!rental || !rental.is_active || !rental.expire_at) return null;

  const now = DateTime.now().setZone(TIMEZONE);
  const exp = DateTime.fromISO(rental.expire_at, { zone: TIMEZONE });
  if (!exp.isValid || exp <= now) return null;

  const remainingDays = Math.ceil(exp.diff(now, 'days').days);
  if (remainingDays !== 1) return null;

  if (rental.last_h1_warning_at) {
    const lastWarn = DateTime.fromISO(rental.last_h1_warning_at, { zone: TIMEZONE });
    if (lastWarn.isValid) return null;
  }

  db.prepare('UPDATE group_rentals SET last_h1_warning_at=? WHERE group_id=?').run(now.toISO(), groupId);
  markWarned(groupId);

  return [
    '⏳ Masa sewa bot akan habis besok',
    '',
    'Sisa waktu: 1 hari',
    `Tanggal expired: ${formatWib(rental.expire_at)} WIB`,
    '',
    'Silakan hubungi owner untuk memperpanjang sewa agar fitur bot tetap aktif.'
  ].join('\n');
}

module.exports = { isRentalActive, shouldWarnExpiring };
