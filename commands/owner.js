const os = require('os');
const { DateTime } = require('luxon');
const { db, extendRental, deactivateRental, getRental } = require('../db/database');
const { formatWib, rentalStatusText } = require('../utils/format');
const { TIMEZONE } = require('../config');
const { parseOwnerActivate, parseOwnerDeactivate, parseInfoGroup } = require('../utils/parser');

async function fetchGroupMeta(sock, groupId) {
  try { return await sock.groupMetadata(groupId); } catch { return null; }
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h} jam ${m} menit`;
}

function getHealthText() {
  const cpu = Math.min(100, Math.round((os.loadavg()[0] / os.cpus().length) * 100));
  const ramUsed = Math.round(process.memoryUsage().rss / 1024 / 1024);
  const ramTotal = Math.round(os.totalmem() / 1024 / 1024 / 1024);
  const uptime = formatDuration(process.uptime());
  const now = DateTime.now().setZone(TIMEZONE).toFormat('dd-MM-yyyy HH:mm');

  let status = '✅ Kondisi server aman';
  if (cpu >= 70 && cpu <= 85) status = '⚠️ CPU waspada, mohon cek beban server.';
  if (cpu > 85) status = '⚠️ CPU sedang tinggi, mohon cek beban server.';

  return [
    '🩺 HEALTH BOT',
    '',
    '🤖 Status: Online',
    `🖥 CPU: ${cpu}%`,
    `📦 RAM: ${ramUsed} MB / ${ramTotal} GB`,
    `⏱ Uptime: ${uptime}`,
    `🕒 Server Time: ${now} WIB`,
    '',
    status
  ].join('\n');
}

async function handleBroadcast(sock, message) {
  const text = message.trim();
  if (text.toLowerCase() === '#broadcast') {
    return ['⚠️ Format yang benar:', '#broadcast@(pesan)', '', 'Contoh:', '#broadcast@Assalamualaikum, bot akan maintenance malam ini pukul 23.00 WIB.'].join('\n');
  }
  const m = text.match(/^#broadcast@([\s\S]+)$/i);
  if (!m) return null;
  const payload = m[1].trim();
  if (!payload) return 'Pesan broadcast tidak boleh kosong.';

  const groups = db.prepare('SELECT DISTINCT group_id FROM group_rentals').all().map((r) => r.group_id);
  let success = 0; let failed = 0;
  for (const gid of groups) {
    try {
      await sock.sendMessage(gid, { text: `📢 BROADCAST OWNER\n\n${payload}` });
      success += 1;
    } catch (e) {
      failed += 1;
      console.error('Broadcast gagal ke', gid, e.message);
    }
  }
  return ['✅ Broadcast berhasil dikirim', `Total grup: ${groups.length}`, `Berhasil: ${success}`, `Gagal: ${failed}`].join('\n');
}

async function handleOwnerCommand({ sock, text, groupId, isGroupMessage }) {
  if (/^#health$/i.test(text.trim())) return getHealthText();

  const bc = await handleBroadcast(sock, text);
  if (bc) return bc;

  const infoReq = parseInfoGroup(text);
  if (infoReq) {
    const targetGroupId = infoReq.groupId || (isGroupMessage ? groupId : null);
    if (!targetGroupId) return '⚠️ Format yang benar:\n#infogroup (idgrup)\n\nContoh:\n#infogroup 1203xxxx@g.us';
    const meta = await fetchGroupMeta(sock, targetGroupId);
    if (!meta) return 'Group tidak ditemukan / bot tidak ada di grup tersebut.';
    const rental = getRental(targetGroupId);
    const status = rentalStatusText(rental);
    const sewaText = status.status === 'AKTIF' ? 'AKTIF' : 'Belum Aktif';
    return ['ℹ️ INFO GROUP', `Nama Grup: ${meta.subject}`, `ID Grup: ${meta.id}`, '', `Status Sewa: ${sewaText}`, `Expired: ${rental?.expire_at ? `${formatWib(rental.expire_at)} WIB` : '-'}`].join('\n');
  }

  if (text.trim().toLowerCase() === '#aktif') {
    return ['⚠️ Format yang benar:', '#aktif (idgrup) (hari)', '', 'Contoh:', '#aktif 120363xxxx@g.us 30'].join('\n');
  }
  const aktif = parseOwnerActivate(text);
  if (aktif) {
    if (!aktif.groupId.endsWith('@g.us') || aktif.days <= 0) return 'Format: #aktif 1203xxxx@g.us 30';
    const updated = extendRental(aktif.groupId, aktif.days, 'owner');
    const meta = await fetchGroupMeta(sock, aktif.groupId);
    return ['✅ Grup berhasil diaktifkan', '', `Nama: ${meta?.subject || aktif.groupId}`, `Expired: ${formatWib(updated.expire_at)} WIB`, `Durasi: ${aktif.days} hari`].join('\n');
  }

  if (text.trim().toLowerCase() === '#nonaktif') {
    return ['⚠️ Format yang benar:', '#nonaktif (idgrup)', '', 'Contoh:', '#nonaktif 120363xxxx@g.us'].join('\n');
  }
  const nonaktif = parseOwnerDeactivate(text);
  if (nonaktif) {
    deactivateRental(nonaktif.groupId, 'owner');
    return '⛔ Grup dinonaktifkan.';
  }

  if (/^#statussewa$/i.test(text.trim())) {
    if (isGroupMessage) {
      const rental = getRental(groupId);
      const status = rentalStatusText(rental);
      return ['📌 STATUS SEWA', `${groupId} | ${status.status}${status.status === 'AKTIF' ? ` | sisa ${status.remainingDays} hari` : ''}`].join('\n');
    }

    const rows = db.prepare('SELECT * FROM group_rentals ORDER BY updated_at DESC').all();
    if (!rows.length) return 'Belum ada data sewa grup.';
    const lines = rows.map((r, i) => {
      const status = rentalStatusText(r);
      return `${i + 1}) ${r.group_id} | ${status.status}${status.status === 'AKTIF' ? ` | sisa ${status.remainingDays} hari` : ''}`;
    });
    return ['📌 STATUS SEWA', '', ...lines].join('\n');
  }

  return 'Command owner: #infogroup, #aktif, #nonaktif, #statussewa, #broadcast, #health';
}

module.exports = { handleOwnerCommand };
