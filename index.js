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
const { isRentalActive, shouldWarnExpiring } = require('./commands/rental');
const { suggestCommand } = require('./utils/typo');
const { handleClearAll } = require('./commands/adminTools');
const { infoGroup } = require('./commands/info');

const cooldown = new Map();
const COMMAND_CANDIDATES = [
  'help', 'menu', 'listpeserta', 'riwayat', 'saldo', 'tambah', 'kurang', 'kali', 'bagi', 'weather', 'cuaca', 'todolist',
  'addpeserta', 'updatepeserta', 'delpeserta', 'setheader', 'command', 'listcommand', 'detailcommand', 'delcommand',
  'remind', 'listremind', 'noremind', 'todo', 'doto', 'lokweather', 'clearall', 'inputtransaksi'
];

function getText(msg) {
  const c = msg.message;
  return c?.conversation || c?.extendedTextMessage?.text || c?.imageMessage?.caption || c?.videoMessage?.caption || '';
}

function isAdmin(participantsMeta, senderId) {
  const sender = normalizeJid(senderId);
  const p = participantsMeta.find((x) => normalizeJid(x.id) === sender);
  return Boolean(p?.admin);
}

function isSenderOwner(senderJid) {
  return isOwner(senderJid, [...OWNER_NUMBERS, ...getOwnerNumbers()]);
}

function parseAddSewaDays(text) {
  const m = String(text || '').trim().match(/^addsewa\s+(\d+)$/i);
  if (!m) return null;
  return Number(m[1]);
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

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();
  const sock = makeWASocket({ version, auth: state, printQRInTerminal: true, logger: pino({ level: LOG_LEVEL }) });
  reminder.startReminderWorker(sock);

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

      if (isGroupMessage) {
        const h1Warn = shouldWarnExpiring(groupId);
        if (h1Warn) await sock.sendMessage(groupId, { text: h1Warn });
      }

      if (/^#/.test(text)) {
        if (!senderIsOwner) return;
        if (!isRentalActive(groupId)) return;
        const resp = await handleOwnerCommand({ sock, text, groupId, isGroupMessage });
        if (resp) await sock.sendMessage(groupId, { text: resp }, { quoted: msg });
        return;
      }

      if (!isRentalActive(groupId)) {
        if (/^info$/i.test(text)) {
          const info = await infoGroup(sock, groupId);
          if (info) await sock.sendMessage(groupId, { text: `${info}\nStatus Sewa: Belum Aktif` }, { quoted: msg });
          return;
        }

        if (/^addsewa$/i.test(text)) {
          if (!senderIsOwner) return;
          await sock.sendMessage(groupId, { text: '⚠️ Format yang benar:\naddsewa (hari)\n\nContoh:\naddsewa 30' }, { quoted: msg });
          return;
        }

        const days = parseAddSewaDays(text);
        if (days) {
          if (!senderIsOwner) return;
          const resp = await handleOwnerCommand({ sock, text: `#aktif ${groupId} ${days}`, groupId, isGroupMessage: true });
          if (resp) await sock.sendMessage(groupId, { text: resp }, { quoted: msg });
        }
        return;
      }

      let senderIsAdmin = false;
      if (isGroupMessage) {
        const meta = await sock.groupMetadata(groupId);
        senderIsAdmin = isAdmin(meta.participants, senderId);
      }
      const canAdminManage = senderIsOwner || senderIsAdmin;

      const userAllowed = /^listpeserta(?:\s+\d+)?$/i.test(text)
        || /^\d+$/.test(text)
        || /^riwayat(\s+.*)?$/i.test(text)
        || /^(tambah|kurang|kali|bagi)(\s|$)/i.test(text)
        || /^(weather|cuaca)$/i.test(text)
        || /^todolist$/i.test(text)
        || /^todo\s+lihat$/i.test(text);

      const adminCommands = /^(menu|help|[+-]|inputtransaksi|saldo(\s|$)|edit\s+\d+|hapus\s+\d+|detail\s+\d+|addpeserta\s*|delpeserta\s*|updatepeserta\s*|setheader\s*|command\s*|delcommand\s*|listcommand$|detailcommand\s+|remind\s*|listremind$|noremind\s*|todo\s*|doto\s*|lokweather\s*|clearall\s*)/i.test(text);
      if (!canAdminManage && adminCommands && !userAllowed) {
        await sock.sendMessage(groupId, { text: '❌ Anda tidak memiliki akses untuk perintah ini.' }, { quoted: msg });
        return;
      }

      const ctx = { text, groupId, senderId, senderName, location };

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
        () => weather.handleWeather(ctx)
      ];

      for (const fn of handlers) {
        const res = await fn();
        if (res) {
          await sock.sendMessage(groupId, { text: res }, { quoted: msg });
          return;
        }
      }

      if (/^(menu|help)$/i.test(text)) return void await sock.sendMessage(groupId, { text: menuText() }, { quoted: msg });

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

      const suggest = suggestCommand(text, COMMAND_CANDIDATES);
      if (suggest) {
        await sock.sendMessage(groupId, { text: `❓ Perintah tidak ditemukan.\n\nApakah maksud Anda: ${suggest}\nKetik perintah yang benar untuk melanjutkan.` }, { quoted: msg });
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
