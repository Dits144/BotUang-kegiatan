const { DateTime } = require('luxon');
const { db } = require('../db/database');
const { TIMEZONE } = require('../config');

function nowIso() {
  return DateTime.now().setZone(TIMEZONE).toISO();
}

function getLocation(groupId) {
  const row = db.prepare('SELECT weather_location FROM group_settings WHERE group_id=?').get(groupId);
  return row?.weather_location || 'Jakarta';
}

function setLocation(groupId, location) {
  db.prepare(`
    INSERT INTO group_settings (group_id, weather_location, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(group_id) DO UPDATE SET
      weather_location=excluded.weather_location,
      updated_at=excluded.updated_at
  `).run(groupId, location, nowIso());
}

async function handleSetLocation(ctx, canManage) {
  const m = ctx.text.trim().match(/^lokweather(?:\s+([\s\S]+))?$/i);
  if (!m) return null;
  if (!canManage) return '⛔ Hanya admin grup atau owner bot yang boleh ubah lokasi cuaca.';

  let location = (m[1] || '').trim();
  if (!location && ctx.location) {
    location = `${ctx.location.latitude},${ctx.location.longitude}`;
  }

  if (!location) return 'Format salah. Contoh: lokweather Bogor atau kirim share lokasi dengan caption "lokweather"';
  setLocation(ctx.groupId, location);
  return `📍 Lokasi cuaca diubah ke: ${location}`;
}

async function handleWeather(ctx) {
  if (!/^(weather|cuaca)$/i.test(ctx.text.trim())) return null;
  const locText = getLocation(ctx.groupId);
  const loc = encodeURIComponent(locText);
  try {
    const res = await fetch(`https://wttr.in/${loc}?format=j1`);
    if (!res.ok) return '⚠️ Gagal ambil data cuaca saat ini.';
    const json = await res.json();
    const current = json.current_condition?.[0];
    const temp = current?.temp_C ?? '-';
    const desc = current?.weatherDesc?.[0]?.value ?? '-';
    const humidity = current?.humidity ?? '-';
    const rain = json.weather?.[0]?.hourly?.[0]?.chanceofrain ?? '-';

    return [
      `🌤 Cuaca ${locText}`,
      `Suhu: ${temp}°C`,
      `Kondisi: ${desc}`,
      `Kelembapan: ${humidity}%`,
      `Peluang Hujan: ${rain}%`
    ].join('\n');
  } catch {
    return '⚠️ Gagal mengambil info cuaca. Coba lagi nanti.';
  }
}

module.exports = { handleSetLocation, handleWeather };
