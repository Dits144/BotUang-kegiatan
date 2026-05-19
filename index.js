const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, downloadContentFromMessage } = require('baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const { OWNER_NUMBERS, AUTH_DIR, LOG_LEVEL } = require('./config');
const { getOwnerNumbers } = require('./db/database');
const { normalizeJid, getSenderJid, isOwner } = require('./utils/jid');
const { menuText } = require('./commands/help');
const { handleCalc } = require('./commands/calc');
const finance = require('./commands/finance');
const participants = require('./commands/participants');
const customCommands = require('./commands/customCommands');
const reminder = require('./commands/reminder');
const todo = require('./commands/todo');
const weather = require('./commands/weather');
const { handleOwnerCommand } = require('./commands/owner');
const { isRentalActive, shouldWarnExpiring, handleCekSewa } = require('./commands/rental');
const { suggestCommand } = require('./utils/typo');
const { handleClearAll } = require('./commands/adminTools');
const { infoGroup } = require('./commands/info');
const { startApi } = require('./api');


const cooldown = new Map();
const COMMAND_CANDIDATES = [
  'help', 'menu', 'listpeserta', 'riwayat', 'saldo', 'tambah', 'kurang', 'kali', 'bagi', 'weather', 'cuaca', 'todolist',
  'addpeserta', 'updatepeserta', 'delpeserta', 'setheader', 'command', 'updatecommand', 'update command', 'listcommand', 'detailcommand', 'delcommand',
  'remind', 'listremind', 'noremind', 'todo', 'doto', 'lokweather', 'clearall', 'inputtransaksi', 'typo'
];

function getText(msg) {
  const c = msg.message;
  return c?.conversation || c?.extendedTextMessage?.text || c?.imageMessage?.caption || c?.videoMessage?.caption || '';
}

function sendFormatHelper(cmd) {
  const helpers = {
    'edit': '⚠️ Format edit:\n\nedit no (data baru)\n\nContoh:\nedit 2 + 10000 (Revisi donasi)',
    'hapus': '⚠️ Format hapus:\n\nhapus no\n\nContoh:\nhapus 3',
    'detail': '⚠️ Format detail:\n\ndetail no\n\nContoh:\ndetail 1',
    'addpeserta': '⚠️ Format addpeserta:\n\naddpeserta (nama)\n\nContoh:\naddpeserta Budi',
    'updatepeserta': '⚠️ Format updatepeserta:\n\nupdatepeserta no_lama (nama_baru)\n\nContoh:\nupdatepeserta 1 Budi Santoso',
    'delpeserta': '⚠️ Format delpeserta:\n\ndelpeserta (nomor_atau_nama)\n\nContoh:\ndelpeserta 1\ndelpeserta Budi',
    'command': '⚠️ Format command:\n\ncommand KEYWORD@(text)\n\nContoh:\ncommand RAB@RAB Open Trip Papandayan',
    'updatecommand': '⚠️ Format update command:\n\nupdate command KEYWORD@(text baru)\n\nContoh:\nupdate command RAB@RAB OT Update',
    'update command': '⚠️ Format update command:\n\nupdate command KEYWORD@(text baru)\n\nContoh:\nupdate command RAB@RAB OT Update',
    'delcommand': '⚠️ Format delcommand:\n\ndelcommand KEYWORD\n\nContoh:\ndelcommand RAB',
    'setheader': '⚠️ Format setheader:\n\nsetheader@(text)\n\nContoh:\nsetheader@Laporan Keuangan Open Trip',
    'remind': '⚠️ Format reminder:\n\nremind (time/date)@(text)\n\nContoh:\nremind 05:00@bangun subuh\nremind 17/08/2026@hari kemerdekaan\nremind 09:00&17/08/2026@rapat penting',
    'todo': '⚠️ Format todo:\n\ntodo (text)\n\nContoh:\ntodo revisi skripsi',
    'doto': '⚠️ Format doto:\n\ndoto (no)\n\nContoh:\ndoto 1'
  };
  return helpers[cmd.toLowerCase()] || null;
}

function isAdmin(participantsMeta, senderId) {
  const sender = normalizeJid(senderId);
  const p = participantsMeta.find((x) => normalizeJid(x.id) === sender);
  return Boolean(p?.admin);
}

function isSenderOwner(senderJid) {
  return isOwner(senderJid, [...OWNER_NUMBERS, ...getOwnerNumbers()]);
}

function inCooldown(senderId, key, ms = 1000) {
  const now = Date.now();
  const cacheKey = `${senderId}::${key}`;
  const prev = cooldown.get(cacheKey) || 0;
  if (now - prev < ms) return true;
  cooldown.set(cacheKey, now);
  return false;
}

async function streamToBuffer(message, type) {
  const stream = await downloadContentFromMessage(message, type);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function extractCommandMedia(msg, text) {
  if (!/^command\s+/i.test(text)) return null;
  const mediaDir = path.join(process.cwd(), 'media', 'commands');
  fs.mkdirSync(mediaDir, { recursive: true });

  if (msg.message?.imageMessage) {
    const buf = await streamToBuffer(msg.message.imageMessage, 'image');
    const fp = path.join(mediaDir, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`);
    fs.writeFileSync(fp, buf);
    return { type: 'image', path: fp };
  }

  const quoted = msg?.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (quoted?.imageMessage) {
    const buf = await streamToBuffer(quoted.imageMessage, 'image');
    const fp = path.join(mediaDir, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.jpg`);
    fs.writeFileSync(fp, buf);
    return { type: 'image', path: fp };
  }

  return null;
}

/* ─── H-1 Rental Warning Scheduler (runs every hour) ─── */
function startRentalWarningScheduler(sock) {
  async function checkAllGroups() {
    const { db } = require('./db/database');
    const groups = db.prepare('SELECT group_id FROM group_rentals WHERE is_active=1').all();
    for (const g of groups) {
      try {
        const warn = shouldWarnExpiring(g.group_id);
        if (warn) await sock.sendMessage(g.group_id, { text: warn });
      } catch (e) {
        console.error('[RentalWarn] Error for', g.group_id, e.message);
      }
    }
  }
  // Run every 30 minutes
  setInterval(() => checkAllGroups().catch(console.error), 30 * 60 * 1000);
  // Also run shortly after startup
  setTimeout(() => checkAllGroups().catch(console.error), 5000);
  console.log('[RentalWarn] Scheduler started (every 30 min)');
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({ version, auth: state, printQRInTerminal: true, logger: pino({ level: LOG_LEVEL }) });
  reminder.startReminderWorker(sock);
  startRentalWarningScheduler(sock);
  startApi(sock);

  const { sendHeartbeat, syncGroup } = require('./utils/lovableApi');
  setInterval(() => sendHeartbeat(true).catch(() => {}), 60000); // 1 menit
  sendHeartbeat(true).catch(() => {});

  async function syncToLovableOnStartup() {
    try {
      const { db } = require('./db/database');
      const groups = db.prepare('SELECT group_id FROM group_rentals WHERE is_active=1').all();
      let synced = 0;
      for (const g of groups) {
        try {
          const meta = await sock.groupMetadata(g.group_id);
          await syncGroup(g.group_id, meta.subject || g.group_id);
          synced++;
        } catch (e) {
          // Abaikan jika bot sudah tidak ada di grup
        }
      }
      if (synced > 0) console.log(`[Lovable Sync] Berhasil sinkronisasi ${synced} grup ke Dashboard.`);
    } catch (e) {
      console.error('[Lovable Sync] Gagal sinkronisasi awal:', e.message);
    }
  }
  
  // Tunggu 5 detik agar koneksi stabil, lalu sync
  setTimeout(() => syncToLovableOnStartup(), 5000);

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('📱 Scan QR berikut di WhatsApp (Linked Devices):');
      qrcode.generate(qr, { small: true });
    }
    if (connection === 'open') console.log('✅ Bot connected');
    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code !== DisconnectReason.loggedOut) start().catch(console.error);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg?.message || msg.key.fromMe) return;

    const text = getText(msg).trim();
    if (!text) return;

    const groupId = msg.key.remoteJid;
    const isGroupMessage = groupId.endsWith('@g.us');
    if (!isGroupMessage) return;
    const senderId = normalizeJid(getSenderJid(msg));
    const senderName = msg.pushName || 'Tanpa Nama';
    const location = msg.message?.locationMessage ? {
      latitude: msg.message.locationMessage.degreesLatitude,
      longitude: msg.message.locationMessage.degreesLongitude
    } : null;

    try {
      const senderIsOwner = isSenderOwner(senderId);

      if (/^#/.test(text) || /^brdcs\s+/i.test(text)) {
        if (!senderIsOwner) return;
        if (!isRentalActive(groupId) && !/^#aktif|^#health|^brdcs/i.test(text)) return;
        const resp = await handleOwnerCommand({ sock, text, groupId, isGroupMessage });
        if (resp) await sock.sendMessage(groupId, { text: resp }, { quoted: msg });
        return;
      }

      let senderIsAdmin = false;
      if (isGroupMessage) {
        const meta = await sock.groupMetadata(groupId);
        senderIsAdmin = isAdmin(meta.participants, senderId);
      }

      if (/^myrole$/i.test(text) || /^\.myrole$/i.test(text)) {
        let role = 'User biasa';
        if (senderIsOwner) role = '👑 *Owner Bot*';
        else if (senderIsAdmin) role = '👮 *Admin Grup*';
        
        await sock.sendMessage(groupId, { text: `Halo ${senderName},\nRole Anda saat ini adalah: ${role}` }, { quoted: msg });
        return;
      }

      if (!isRentalActive(groupId)) {
        if (/^info$/i.test(text)) {
          const info = await infoGroup(sock, groupId);
          if (info) await sock.sendMessage(groupId, { text: `${info}\nStatus Sewa: Belum Aktif` }, { quoted: msg });
          return;
        }

        if (/^(menu|help)$/i.test(text)) {
          if (!senderIsOwner) return; // Abaikan untuk selain owner jika expired
          const { menuText } = require('./commands/help');
          await sock.sendMessage(groupId, { text: menuText('owner') }, { quoted: msg });
          return;
        }
        
        return;
      }

      let senderIsAdmin = false;
      if (isGroupMessage) {
        const meta = await sock.groupMetadata(groupId);
        senderIsAdmin = isAdmin(meta.participants, senderId);
      }
      const canAdminManage = senderIsOwner || senderIsAdmin;

      if (text.trim().toLowerCase() === 'dashboard') {
        if (!canAdminManage) {
          await sock.sendMessage(groupId, { text: '❌ Anda tidak memiliki akses untuk perintah ini.' }, { quoted: msg });
          return;
        }
        
        // Buat token 16 karakter acak
        const crypto = require('crypto');
        const token = crypto.randomBytes(8).toString('hex');
        
        // Token berlaku 15 menit
        const { DateTime } = require('luxon');
        const { TIMEZONE } = require('./config');
        const expiresAt = DateTime.now().setZone(TIMEZONE).plus({ minutes: 15 }).toISO();
        
        const { db } = require('./db/database');
        db.prepare('INSERT INTO dashboard_tokens (token, group_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
          .run(token, groupId, DateTime.now().setZone(TIMEZONE).toISO(), expiresAt);
        
        // Gunakan URL Web Lovable
        const WEB_URL = process.env.LOVABLE_API_URL || 'https://wabot-dashboard.lovable.app';
        const link = `${WEB_URL}/connect?group_id=${groupId}&token=${token}`;
        
        await sock.sendMessage(groupId, { text: `🔐 *Akses Web Dashboard*\n\nKlik link di bawah ini untuk mengelola grup Anda (berlaku 15 menit):\n\n${link}` }, { quoted: msg });
        return;
      }

      // Determine role for help menu
      const userRole = senderIsOwner ? 'owner' : senderIsAdmin ? 'admin' : 'user';

      const userAllowed = /^(menu|help)$/i.test(text)
        || /^listpeserta(?:\s+\d+)?$/i.test(text)
        || /^\d+$/.test(text)
        || /^riwayat(\s+.*)?$/i.test(text)
        || /^(tambah|kurang|kali|bagi)(\s|$)/i.test(text)
        || /^(weather|cuaca)$/i.test(text)
        || /^todolist$/i.test(text)
        || /^todo\s+lihat$/i.test(text);

      const adminCommands = /^(menu|help|[+-]|inputtransaksi|saldo(\s|$)|edit\s*|hapus\s*|detail\s*|addpeserta\s*|delpeserta\s*|updatepeserta\s*|setheader\s*|command\s*|update\s*command\s*|updatecommand\s*|delcommand\s*|listcommand$|detailcommand\s+|remind\s*|listremind$|noremind\s*|todo\s*|doto\s*|lokweather\s*|clearall\s*|typo\s*|ceksewa$)/i.test(text);
      if (!canAdminManage && adminCommands && !userAllowed) {
        await sock.sendMessage(groupId, { text: '❌ Anda tidak memiliki akses untuk perintah ini.' }, { quoted: msg });
        return;
      }

      const ctx = { text, groupId, senderId, senderName, location, userRole };

      const formatHelperMsg = sendFormatHelper(text.trim().toLowerCase());
      if (formatHelperMsg) {
        await sock.sendMessage(groupId, { text: formatHelperMsg }, { quoted: msg });
        return;
      }

      if (/^(\+|-|inputtransaksi)$/i.test(text)) {
        await sock.sendMessage(groupId, { text: finance.formatTransactionHelp() }, { quoted: msg });
        return;
      }

      const clearRes = handleClearAll(ctx, canAdminManage, [finance.clearGroupCache, participants.clearGroupCache, todo.clearGroupCache]);
      if (clearRes) {
        await sock.sendMessage(groupId, { text: clearRes }, { quoted: msg });
        return;
      }

      const handlers = [
        () => participants.handleSetHeader(ctx, canAdminManage),
        () => participants.handleListPeserta(ctx),
        () => participants.handleNumericDetail(ctx),
        () => participants.handleAddPeserta(ctx, canAdminManage),
        () => participants.handleDeletePeserta(ctx, canAdminManage),
        () => participants.handleUpdatePeserta(ctx, canAdminManage),
        async () => customCommands.handleSaveCommand({ ...ctx, commandMedia: await extractCommandMedia(msg, text) }, canAdminManage),
        () => customCommands.handleListCommand(ctx),
        () => customCommands.handleDetailCommand(ctx),
        () => customCommands.handleDeleteCommand(ctx, canAdminManage),
        () => reminder.handleRemind(ctx, canAdminManage),
        () => reminder.handleListRemind(ctx),
        () => reminder.handleNoRemind(ctx, canAdminManage),
        () => todo.handleTodo(ctx, canAdminManage),
        () => weather.handleSetLocation(ctx, canAdminManage),
        () => weather.handleWeather(ctx),
        () => handleCekSewa(ctx)
      ];

      for (const fn of handlers) {
        const res = await fn();
        if (res) {
          await sock.sendMessage(groupId, { text: res }, { quoted: msg });
          return;
        }
      }

      if (/^typo\s+(on|off)$/i.test(text)) {
        if (!canAdminManage) {
          await sock.sendMessage(groupId, { text: '❌ Anda tidak memiliki akses untuk perintah ini.' }, { quoted: msg });
          return;
        }
        const state = /on/i.test(text) ? 1 : 0;
        const { db } = require('./db/database');
        const { DateTime } = require('luxon');
        const { TIMEZONE } = require('./config');
        db.prepare('INSERT INTO group_settings (group_id, typo_enabled, updated_at) VALUES (?, ?, ?) ON CONFLICT(group_id) DO UPDATE SET typo_enabled=excluded.typo_enabled, updated_at=excluded.updated_at').run(groupId, state, DateTime.now().setZone(TIMEZONE).toISO());
        await sock.sendMessage(groupId, { text: `✅ Fitur typo diset menjadi ${state ? 'ON' : 'OFF'}` }, { quoted: msg });
        return;
      }

      if (/^(menu|help)$/i.test(text)) return void await sock.sendMessage(groupId, { text: menuText(userRole) }, { quoted: msg });

      const calc = handleCalc(text);
      if (calc) return void await sock.sendMessage(groupId, { text: calc }, { quoted: msg });

      if (/^riwayat\s+format$/i.test(text)) return void await sock.sendMessage(groupId, { text: finance.formatRiwayatHelp() }, { quoted: msg });

      if (/^riwayat(\s|$)/i.test(text) && inCooldown(senderId, 'riwayat', 1000)) {
        return void await sock.sendMessage(groupId, { text: '⏳ Tunggu 1 detik sebelum memakai command riwayat lagi.' }, { quoted: msg });
      }

      const history = await finance.riwayat(ctx);
      if (history) return void await sock.sendMessage(groupId, { text: history }, { quoted: msg });
      const saldo = await finance.saldo(ctx);
      if (saldo) return void await sock.sendMessage(groupId, { text: saldo }, { quoted: msg });
      const edit = await finance.edit(ctx, canAdminManage);
      if (edit) return void await sock.sendMessage(groupId, { text: edit }, { quoted: msg });
      const del = await finance.remove(ctx, canAdminManage);
      if (del) return void await sock.sendMessage(groupId, { text: del }, { quoted: msg });
      const detail = await finance.detail(ctx);
      if (detail) return void await sock.sendMessage(groupId, { text: detail }, { quoted: msg });
      const tx = await finance.recordTransaction(ctx);
      if (tx) return void await sock.sendMessage(groupId, { text: tx }, { quoted: msg });

      if (/^[+-]/.test(text)) {
        await sock.sendMessage(groupId, {
          text: ['⚠️ Format belum lengkap.', '', 'Contoh yang benar:', '+ 10000 (Donasi)', '- 5000 (Beli air)'].join('\n')
        }, { quoted: msg });
        return;
      }

      const autoResp = isGroupMessage ? customCommands.handleAutoResponse(ctx) : null;
      if (autoResp?.type === 'image') return void await sock.sendMessage(groupId, { image: autoResp.imageBuffer, caption: autoResp.caption }, { quoted: msg });
      if (autoResp?.type === 'text') return void await sock.sendMessage(groupId, { text: autoResp.text }, { quoted: msg });

      const { db } = require('./db/database');
      const set = db.prepare('SELECT typo_enabled FROM group_settings WHERE group_id=?').get(groupId);
      const isTypoEnabled = set && set.typo_enabled !== undefined ? set.typo_enabled : 1;
      
      if (isTypoEnabled) {
        const suggest = suggestCommand(text, COMMAND_CANDIDATES);
        if (suggest) {
          await sock.sendMessage(groupId, { text: `❓ Perintah tidak ditemukan.\n\nApakah maksud Anda: ${suggest}\nKetik perintah yang benar untuk melanjutkan.` }, { quoted: msg });
        }
      }
    } catch (err) {
      console.error(err);
      await sock.sendMessage(groupId, { text: 'Terjadi error saat memproses command.' }, { quoted: msg });
    }
  });
}

start().catch((e) => {
  console.error('Fatal error', e);
  process.exit(1);
});
