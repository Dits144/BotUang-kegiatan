const { DateTime } = require('luxon');
const { TIMEZONE } = require('../config');

function formatRupiah(num) {
  return Number(num || 0).toLocaleString('id-ID');
}

function formatWib(iso, withTime = true) {
  if (!iso) return '-';
  const dt = DateTime.fromISO(iso, { zone: TIMEZONE });
  if (!dt.isValid) return iso;
  return withTime ? dt.toFormat('dd-MM-yyyy HH:mm') : dt.toFormat('dd-MM-yyyy');
}

function parseIsoDateRange(text) {
  const day = DateTime.fromFormat(text, 'yyyy-MM-dd', { zone: TIMEZONE });
  if (!day.isValid) return null;
  return { start: day.startOf('day').toISO(), end: day.plus({ days: 1 }).startOf('day').toISO() };
}

function dayRange(offsetDays = 0) {
  const now = DateTime.now().setZone(TIMEZONE).plus({ days: offsetDays });
  return { start: now.startOf('day').toISO(), end: now.plus({ days: 1 }).startOf('day').toISO() };
}

function monthRange() {
  const now = DateTime.now().setZone(TIMEZONE);
  return { start: now.startOf('month').toISO(), end: now.plus({ months: 1 }).startOf('month').toISO() };
}

function rentalStatusText(rental) {
  if (!rental || !rental.is_active || !rental.expire_at) return { status: 'EXPIRED', remainingDays: 0 };
  const now = DateTime.now().setZone(TIMEZONE);
  const exp = DateTime.fromISO(rental.expire_at, { zone: TIMEZONE });
  if (!exp.isValid || exp <= now) return { status: 'EXPIRED', remainingDays: 0 };
  return { status: 'AKTIF', remainingDays: Math.ceil(exp.diff(now, 'days').days) };
}

module.exports = {
  formatRupiah,
  formatWib,
  parseIsoDateRange,
  dayRange,
  monthRange,
  rentalStatusText
};
