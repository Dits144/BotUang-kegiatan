const express = require('express');
const crypto = require('crypto');
const { DateTime } = require('luxon');
const { db } = require('./db/database');
const { TIMEZONE } = require('./config');

const router = express.Router();

function nowIso() {
  return DateTime.now().setZone(TIMEZONE).toISO();
}

// Ensure rental_requests table exists
db.exec(`
  CREATE TABLE IF NOT EXISTS rental_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id TEXT NOT NULL,
    months INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')),
    proof_image TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// Parse schedule string into reminder components (time, date, datetime)
function parseSchedule(scheduleStr) {
  const str = scheduleStr.trim();
  
  // check if it starts with "time ", "date ", "datetime " prefix
  const prefixMatch = str.match(/^(time|date|datetime)\s+(.+)$/i);
  if (prefixMatch) {
    return {
      type: prefixMatch[1].toLowerCase(),
      value: prefixMatch[2].trim()
    };
  }

  // check if format is HH:MM
  if (/^\d{2}:\d{2}$/.test(str)) {
    return { type: 'time', value: str };
  }
  // check if format is DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    return { type: 'date', value: str };
  }
  // check if format is HH:MM&DD/MM/YYYY
  if (/^\d{2}:\d{2}&\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    return { type: 'datetime', value: str };
  }

  // Try parsing as ISO datetime
  try {
    const dt = DateTime.fromISO(str);
    if (dt.isValid) {
      const hhmm = dt.toFormat('HH:mm');
      const ddmmyyyy = dt.toFormat('dd/MM/yyyy');
      return { type: 'datetime', value: `${hhmm}&${ddmmyyyy}` };
    }
  } catch (e) {}

  // Try parsing as generic Date
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const dt = DateTime.fromJSDate(d).setZone(TIMEZONE);
      const hhmm = dt.toFormat('HH:mm');
      const ddmmyyyy = dt.toFormat('dd/MM/yyyy');
      return { type: 'datetime', value: `${hhmm}&${ddmmyyyy}` };
    }
  } catch (e) {}

  // Fallback
  return { type: 'time', value: str };
}

// Fetch merged group details from group_rentals and Baileys
async function fetchMergedGroups(sock) {
  const rentals = db.prepare('SELECT * FROM group_rentals').all();
  let allGroups = {};
  if (sock) {
    try {
      allGroups = await sock.groupFetchAllParticipating();
    } catch (err) {
      console.error('[API] groupFetchAllParticipating failed:', err.message);
    }
  }

  const rentalMap = new Map(rentals.map(r => [r.group_id, r]));
  const merged = [];

  // Process groups bot is currently participating in
  for (const jid of Object.keys(allGroups)) {
    const meta = allGroups[jid];
    const r = rentalMap.get(jid);
    
    let is_active = false;
    let expire_at = null;
    let remaining_days = 0;
    
    if (r) {
      expire_at = r.expire_at;
      if (r.is_active === 1 && expire_at) {
        const exp = DateTime.fromISO(expire_at).setZone(TIMEZONE);
        const now = DateTime.now().setZone(TIMEZONE);
        if (exp > now) {
          is_active = true;
          remaining_days = Math.max(0, Math.ceil(exp.diff(now, 'days').days));
        }
      }
    }

    merged.push({
      group_id: jid,
      group_name: meta.subject || jid,
      rental_status: is_active ? 'active' : 'inactive',
      expire_at: expire_at,
      remaining_days: remaining_days,
      member_count: meta.participants ? meta.participants.length : 0
    });
    
    rentalMap.delete(jid);
  }

  // Process groups that bot left or isn't in, but has rental record
  for (const [jid, r] of rentalMap.entries()) {
    let is_active = false;
    let expire_at = r.expire_at;
    let remaining_days = 0;
    
    if (r.is_active === 1 && expire_at) {
      const exp = DateTime.fromISO(expire_at).setZone(TIMEZONE);
      const now = DateTime.now().setZone(TIMEZONE);
      if (exp > now) {
        is_active = true;
        remaining_days = Math.max(0, Math.ceil(exp.diff(now, 'days').days));
      }
    }

    merged.push({
      group_id: jid,
      group_name: jid,
      rental_status: is_active ? 'active' : 'inactive',
      expire_at: expire_at,
      remaining_days: remaining_days,
      member_count: 0
    });
  }

  // Map to compatibility format too
  return merged.map(g => ({
    ...g,
    id: g.group_id,
    name: g.group_name,
    status: g.rental_status,
    expired_at: g.expire_at
  }));
}

// --- AUTH / CONNECT ---
router.post('/groups/:groupId/connect/validate', (req, res) => {
  const groupId = req.params.groupId;
  const { token, password } = req.body;
  if (!groupId || !token) return res.status(400).json({ success: false, error: 'Missing groupId or token' });

  const validToken = db.prepare('SELECT * FROM dashboard_tokens WHERE token = ? AND group_id = ? AND datetime(expires_at) > datetime(?)').get(token, groupId, nowIso());
  
  if (!validToken) {
    return res.status(401).json({ success: false, error: 'Token akses tidak valid atau sudah kadaluarsa. Silakan ketik "dashboard" lagi di WhatsApp.' });
  }

  const rental = db.prepare('SELECT * FROM group_rentals WHERE group_id = ?').get(groupId);
  const hasPassword = !!(rental && rental.password);

  if (validToken.pin_verified === 1) {
    return res.json({ 
      valid: true, 
      group: { 
        id: groupId, 
        name: rental ? 'Grup Keuangan' : 'Grup WhatsApp'
      } 
    });
  }

  // Token is valid but PIN is not verified yet
  if (password) {
    if (!hasPassword) {
      // Set new password
      db.prepare('UPDATE group_rentals SET password = ? WHERE group_id = ?').run(password, groupId);
    } else {
      // Verify existing password
      if (rental.password !== password) {
        return res.status(401).json({ success: false, error: 'PIN / Password salah! Silakan coba lagi.' });
      }
    }

    // Mark token as verified
    db.prepare('UPDATE dashboard_tokens SET pin_verified = 1 WHERE token = ?').run(token);

    return res.json({
      valid: true,
      group: { 
        id: groupId, 
        name: rental ? 'Grup Keuangan' : 'Grup WhatsApp'
      }
    });
  }

  // PIN verification is required
  return res.json({
    valid: false,
    need_pin: true,
    has_pin: hasPassword
  });
});

// --- OWNER / GLOBAL GROUPS ---
router.get('/groups', async (req, res) => {
  try {
    const sock = req.app.get('sock');
    const groups = await fetchMergedGroups(sock);
    res.json(groups);
  } catch (error) {
    console.error('[API] Error in GET /groups:', error);
    res.status(500).json({ error: 'Failed to fetch groups', message: error.message });
  }
});

router.get('/owner/groups', async (req, res) => {
  try {
    const sock = req.app.get('sock');
    const groups = await fetchMergedGroups(sock);
    res.json(groups);
  } catch (error) {
    console.error('[API] Error in GET /owner/groups:', error);
    res.status(500).json({ error: 'Failed to fetch owner groups', message: error.message });
  }
});

// --- GROUP DASHBOARD DATA ---
router.get('/groups/:groupId', (req, res) => {
  const groupId = req.params.groupId;
  const rental = db.prepare('SELECT * FROM group_rentals WHERE group_id = ?').get(groupId);
  if (!rental) return res.status(404).json({ error: 'Group not found' });
  
  // Calculate balance
  const income = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE group_id=? AND type='income' AND deleted_at IS NULL`).get(groupId).total;
  const expense = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE group_id=? AND type='expense' AND deleted_at IS NULL`).get(groupId).total;

  res.json({
    id: rental.group_id,
    name: 'Grup Keuangan',
    status: rental.is_active ? 'active' : 'inactive',
    expired_at: rental.expire_at,
    balance: income - expense
  });
});

router.get('/groups/:groupId/settings', (req, res) => {
  const row = db.prepare('SELECT * FROM group_settings WHERE group_id=?').get(req.params.groupId);
  const rental = db.prepare('SELECT * FROM group_rentals WHERE group_id=?').get(req.params.groupId);
  
  res.json({
    weather_location: row?.weather_location || '',
    participants_header: row?.header_text || '',
    rental_status: rental?.is_active ? 'active' : 'inactive',
    timezone: TIMEZONE
  });
});

router.put('/groups/:groupId/settings', (req, res) => {
  const { header_text, weather_location, typo_enabled } = req.body;
  const groupId = req.params.groupId;
  
  db.prepare(`
    INSERT INTO group_settings (group_id, header_text, weather_location, typo_enabled, updated_at) 
    VALUES (?, ?, ?, ?, ?) 
    ON CONFLICT(group_id) DO UPDATE SET 
      header_text=excluded.header_text, 
      weather_location=excluded.weather_location,
      typo_enabled=excluded.typo_enabled,
      updated_at=excluded.updated_at
  `).run(groupId, header_text, weather_location, typo_enabled ? 1 : 0, nowIso());
  
  res.json({ success: true, message: 'Settings updated' });
});

router.get('/groups/:groupId/transactions', (req, res) => {
  const rows = db.prepare('SELECT * FROM transactions WHERE group_id=? AND deleted_at IS NULL ORDER BY datetime(created_at) DESC').all(req.params.groupId);
  const txs = rows.map(r => ({
    id: String(r.id),
    type: r.type,
    amount: r.amount,
    note: r.note,
    date: r.created_at
  }));
  res.json(txs);
});

router.post('/groups/:groupId/transactions', (req, res) => {
  const { type, amount, note, sender_name } = req.body;
  db.prepare(`INSERT INTO transactions (group_id, type, amount, note, sender_id, sender_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    req.params.groupId, type, amount, note, 'dashboard', sender_name || 'Admin Web', nowIso()
  );
  res.json({ success: true, message: 'Transaction created' });
});

router.delete('/groups/:groupId/transactions/:id', (req, res) => {
  db.prepare('UPDATE transactions SET deleted_at=? WHERE id=? AND group_id=?').run(nowIso(), req.params.id, req.params.groupId);
  res.json({ success: true, message: 'Transaction deleted' });
});

router.get('/groups/:groupId/participants', (req, res) => {
  const rows = db.prepare('SELECT * FROM participants WHERE group_id=? AND deleted_at IS NULL ORDER BY created_at ASC').all(req.params.groupId);
  const participants = rows.map(r => {
    let parsedData = {};
    try { parsedData = JSON.parse(r.data); } catch(e){}
    return {
      id: String(r.id),
      name: r.name,
      phone: parsedData.phone || '',
      note: parsedData.note || ''
    };
  });
  res.json(participants);
});

router.get('/groups/:groupId/commands', (req, res) => {
  const rows = db.prepare('SELECT * FROM custom_commands WHERE group_id=? AND deleted_at IS NULL ORDER BY created_at ASC').all(req.params.groupId);
  const commands = rows.map(r => ({
    id: String(r.id),
    keyword: r.keyword,
    response: r.response,
    image_url: r.media_path
  }));
  res.json(commands);
});

router.get('/groups/:groupId/reminders', (req, res) => {
  const rows = db.prepare('SELECT * FROM reminders WHERE group_id=? AND deleted_at IS NULL ORDER BY created_at ASC').all(req.params.groupId);
  const reminders = rows.map(r => ({
    id: String(r.id),
    message: r.remind_text,
    schedule: `${r.remind_type} ${r.remind_value}`,
    timezone: TIMEZONE
  }));
  res.json(reminders);
});

router.post('/groups/:groupId/reminders', (req, res) => {
  let { remind_type, remind_value, remind_text, message, schedule } = req.body;
  const groupId = req.params.groupId;
  
  // Support frontend structure (message & schedule)
  if (message && schedule) {
    remind_text = message;
    const parsed = parseSchedule(schedule);
    remind_type = parsed.type;
    remind_value = parsed.value;
  }
  
  if (!remind_type || !remind_value || !remind_text) {
    return res.status(400).json({ error: 'Missing remind_type, remind_value, or remind_text (or message and schedule)' });
  }

  const now = nowIso();
  const info = db.prepare(`INSERT INTO reminders (group_id, remind_type, remind_value, remind_text, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
    groupId, remind_type, remind_value, remind_text, 'dashboard', now
  );
  
  res.json({
    id: String(info.lastInsertRowid),
    message: remind_text,
    schedule: `${remind_type} ${remind_value}`,
    timezone: TIMEZONE
  });
});

router.delete('/groups/:groupId/reminders/:id', (req, res) => {
  db.prepare('UPDATE reminders SET deleted_at=? WHERE id=? AND group_id=?').run(nowIso(), req.params.id, req.params.groupId);
  res.json({ success: true, message: 'Reminder deleted' });
});

router.get('/groups/:groupId/todos', (req, res) => {
  const rows = db.prepare('SELECT * FROM todos WHERE group_id=? AND deleted_at IS NULL ORDER BY created_at ASC').all(req.params.groupId);
  const todos = rows.map(r => ({
    id: String(r.id),
    title: r.todo_text,
    done: Boolean(r.is_done)
  }));
  res.json(todos);
});

// --- QRIS & RENTAL EXTENSION ---
router.get('/owner/qris', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const qrisPath = path.join(__dirname, 'db', 'qris.txt');
  if (fs.existsSync(qrisPath)) {
    const data = fs.readFileSync(qrisPath, 'utf8');
    return res.json({ image: data });
  }
  res.json({ image: '' });
});

router.post('/owner/qris', (req, res) => {
  const { image } = req.body;
  if (!image) return res.status(400).json({ error: 'Image data is required' });
  
  const fs = require('fs');
  const path = require('path');
  const qrisPath = path.join(__dirname, 'db', 'qris.txt');
  
  // Ensure db directory exists
  const dbDir = path.join(__dirname, 'db');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  
  fs.writeFileSync(qrisPath, image, 'utf8');
  res.json({ success: true, message: 'QRIS uploaded successfully' });
});

router.post('/groups/:groupId/rentals/extend-request', async (req, res) => {
  const groupId = req.params.groupId;
  const { months, image } = req.body;
  if (!groupId || !months || !image) {
    return res.status(400).json({ error: 'Missing groupId, months, or image' });
  }
  
  try {
    const fs = require('fs');
    const path = require('path');
    
    // Decode base64 image
    const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: 'Invalid base64 image format' });
    }
    
    const buffer = Buffer.from(matches[2], 'base64');
    const tempDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const tempFilePath = path.join(tempDir, `proof_${groupId.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.png`);
    fs.writeFileSync(tempFilePath, buffer);
    
    // Get group metadata from database or Baileys
    const rental = db.prepare('SELECT * FROM group_rentals WHERE group_id = ?').get(groupId);
    let groupName = groupId;
    
    // Get sock from req.app.get('sock')
    const sock = req.app.get('sock');
    if (sock) {
      try {
        const metadata = await sock.groupMetadata(groupId);
        if (metadata) groupName = metadata.subject;
      } catch (e) {}
      
      const inviteCode = 'HAy39hfJfkMKDDzAbZNGDW';
      let targetJid = '';
      
      // 1. Join group if not in it
      try {
        await sock.groupAcceptInvite(inviteCode);
      } catch (e) {}
      
      // 2. Get invite info to get the JID
      try {
        const info = await sock.groupGetInviteInfo(inviteCode);
        if (info && info.id) {
          targetJid = info.id.includes('@') ? info.id : `${info.id}@g.us`;
        }
      } catch (e) {}
      
      if (!targetJid) {
        // Fallback JID if invite code info fails
        targetJid = '120363427301916965@g.us';
      }
      
      // 3. Send message with proof image
      await sock.sendMessage(targetJid, {
        image: fs.readFileSync(tempFilePath),
        caption: `📢 *LAPORAN TAMBAH SEWA BOT*\n\n` +
                 `👥 *Grup:* ${groupName}\n` +
                 `🆔 *ID Grup:* ${groupId}\n` +
                 `⏳ *Permintaan:* Tambah Sewa *${months} Bulan*\n\n` +
                 `Mohon Owner segera memeriksa bukti transfer di atas untuk verifikasi sewa.`
      });
      
      // Clean up temp file
      try {
        fs.unlinkSync(tempFilePath);
      } catch(e){}
      
      return res.json({ success: true, message: 'Laporan berhasil dikirim ke grup verifikasi owner!' });
    } else {
      return res.status(500).json({ error: 'WhatsApp bot is not connected' });
    }
  } catch (error) {
    console.error('Error extending rental request:', error);
    res.status(500).json({ error: 'Failed to process extension request' });
  }
});

// --- OWNER SPECIALIZED API ENDPOINTS ---
router.post('/owner/rentals/activate', (req, res) => {
  const { group_id, days } = req.body;
  if (!group_id) return res.status(400).json({ error: 'group_id is required' });
  
  const daysToExtend = Number(days) || 30;
  const existing = db.prepare('SELECT * FROM group_rentals WHERE group_id = ?').get(group_id);
  
  let newExpire;
  if (existing && existing.expire_at) {
    const currentExpire = DateTime.fromISO(existing.expire_at).setZone(TIMEZONE);
    const now = DateTime.now().setZone(TIMEZONE);
    
    if (currentExpire > now) {
      newExpire = currentExpire.plus({ days: daysToExtend }).toISO();
    } else {
      newExpire = now.plus({ days: daysToExtend }).toISO();
    }
  } else {
    newExpire = DateTime.now().setZone(TIMEZONE).plus({ days: daysToExtend }).toISO();
  }
  
  db.prepare(`
    INSERT INTO group_rentals (group_id, is_active, expire_at, updated_at)
    VALUES (?, 1, ?, ?)
    ON CONFLICT(group_id) DO UPDATE SET
      is_active = 1,
      expire_at = excluded.expire_at,
      updated_at = excluded.updated_at
  `).run(group_id, newExpire, nowIso());
  
  res.json({ success: true, message: `Rental activated successfully until ${newExpire}` });
});

router.post('/owner/rentals/deactivate', (req, res) => {
  const { group_id } = req.body;
  if (!group_id) return res.status(400).json({ error: 'group_id is required' });
  
  db.prepare(`
    UPDATE group_rentals 
    SET is_active = 0, updated_at = ? 
    WHERE group_id = ?
  `).run(nowIso(), group_id);
  
  res.json({ success: true, message: 'Rental deactivated successfully' });
});

router.post('/owner/broadcast', async (req, res) => {
  const { message, group_ids } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });
  
  const sock = req.app.get('sock');
  if (!sock) return res.status(500).json({ error: 'WhatsApp bot is not connected' });
  
  try {
    let targets = group_ids;
    if (!targets || !targets.length) {
      const rentals = db.prepare('SELECT group_id FROM group_rentals WHERE is_active = 1').all();
      targets = rentals.map(r => r.group_id);
    }
    
    let successCount = 0;
    for (const jid of targets) {
      try {
        await sock.sendMessage(jid, { text: message });
        successCount++;
      } catch (err) {
        console.error(`[Broadcast] Gagal mengirim pesan ke ${jid}:`, err);
      }
    }
    
    res.json({ success: true, message: `Broadcast berhasil dikirim ke ${successCount} grup!` });
  } catch (error) {
    console.error('Error sending broadcast:', error);
    res.status(500).json({ error: 'Failed to send broadcast' });
  }
});

// --- ADDED ENDPOINTS FOR PARTICIPANTS, COMMANDS, TODOS, AND RENTAL FLOW ---

// Helper function to resolve invite code, join group, resolve JID, and notify
async function resolveInviteJidAndNotify(sock, months, groupId, isProof) {
  if (!sock) {
    console.warn('[API Notify] Bot socket not available, skipping WhatsApp notification.');
    return;
  }
  
  let targetJid = process.env.RENTAL_NOTIFICATION_GROUP_JID;
  if (targetJid === 'ISI_JID_GRUP_TUJUAN' || !targetJid) {
    targetJid = '';
  }

  try {
    // Try to resolve JID from invite link if not configured in env
    if (!targetJid) {
      const inviteLink = process.env.RENTAL_NOTIFICATION_GROUP_INVITE || 'https://chat.whatsapp.com/HAy39hfJfkMKDDzAbZNGDW';
      const match = inviteLink.match(/chat\.whatsapp\.com\/([A-Za-z0-9]{20,24})/);
      if (match) {
        const inviteCode = match[1];
        try {
          await sock.groupAcceptInvite(inviteCode);
        } catch (e) {
          console.log('[API Notify] Group accept invite error (already in group or invalid):', e.message);
        }
        
        try {
          const info = await sock.groupGetInviteInfo(inviteCode);
          if (info && info.id) {
            targetJid = info.id.includes('@') ? info.id : `${info.id}@g.us`;
            console.log('[API Notify] Resolved notification JID from invite link:', targetJid);
          }
        } catch (e) {
          console.error('[API Notify] groupGetInviteInfo failed:', e.message);
        }
      }
    }

    // Fallback JID if still unresolved
    if (!targetJid) {
      targetJid = '120363427301916965@g.us';
    }

    // Send the notification messages
    const msgText = `sewa bot Manage Keuangan ${months} bulan`;
    console.log(`[API Notify] Sending notification: "${msgText}" to ${targetJid}`);
    await sock.sendMessage(targetJid, { text: msgText });

    if (isProof) {
      const proofMsgText = `Bukti pembayaran sewa bot Manage Keuangan sudah dikirim. Mohon dicek owner.`;
      console.log(`[API Notify] Sending proof notification: "${proofMsgText}" to ${targetJid}`);
      await sock.sendMessage(targetJid, { text: proofMsgText });
    }
  } catch (error) {
    console.error('[API Notify] Failed to send WhatsApp notification:', error.message);
  }
}

// 1. PARTICIPANTS CRUD
router.post('/groups/:groupId/participants', (req, res) => {
  try {
    const { name, phone, note } = req.body;
    const groupId = req.params.groupId;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const dataStr = JSON.stringify({ phone: phone || '', note: note || '' });
    const now = nowIso();
    const info = db.prepare('INSERT INTO participants (group_id, name, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(groupId, name, dataStr, now, now);
    
    console.log(`[API] Created participant id ${info.lastInsertRowid} in group ${groupId}`);
    res.json({
      id: String(info.lastInsertRowid),
      name,
      phone: phone || '',
      note: note || ''
    });
  } catch (error) {
    console.error('[API] Error in POST /participants:', error);
    res.status(500).json({ error: 'Failed to create participant', message: error.message });
  }
});

router.put('/groups/:groupId/participants/:id', (req, res) => {
  try {
    const { name, phone, note } = req.body;
    const groupId = req.params.groupId;
    const id = req.params.id;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const dataStr = JSON.stringify({ phone: phone || '', note: note || '' });
    const now = nowIso();
    const result = db.prepare('UPDATE participants SET name = ?, data = ?, updated_at = ? WHERE id = ? AND group_id = ? AND deleted_at IS NULL').run(name, dataStr, now, id, groupId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Participant not found or already deleted' });
    }

    console.log(`[API] Updated participant id ${id} in group ${groupId}`);
    res.json({
      id: String(id),
      name,
      phone: phone || '',
      note: note || ''
    });
  } catch (error) {
    console.error('[API] Error in PUT /participants/:id:', error);
    res.status(500).json({ error: 'Failed to update participant', message: error.message });
  }
});

router.delete('/groups/:groupId/participants/:id', (req, res) => {
  try {
    const groupId = req.params.groupId;
    const id = req.params.id;
    const now = nowIso();
    const result = db.prepare('UPDATE participants SET deleted_at = ?, updated_at = ? WHERE id = ? AND group_id = ? AND deleted_at IS NULL').run(now, now, id, groupId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Participant not found or already deleted' });
    }

    console.log(`[API] Soft-deleted participant id ${id} from group ${groupId}`);
    res.json({ success: true, message: 'Participant deleted successfully' });
  } catch (error) {
    console.error('[API] Error in DELETE /participants/:id:', error);
    res.status(500).json({ error: 'Failed to delete participant', message: error.message });
  }
});

// 2. COMMANDS CRUD
router.post('/groups/:groupId/commands', (req, res) => {
  try {
    const { keyword, response, image_url } = req.body;
    const groupId = req.params.groupId;
    if (!keyword || !response) return res.status(400).json({ error: 'Keyword and response are required' });

    const now = nowIso();
    const info = db.prepare(`
      INSERT INTO custom_commands (group_id, keyword, response, media_path, created_at, updated_at) 
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(group_id, keyword) DO UPDATE SET
        response = excluded.response,
        media_path = excluded.media_path,
        deleted_at = NULL,
        updated_at = excluded.updated_at
    `).run(groupId, keyword, response, image_url || null, now, now);

    console.log(`[API] Created/Updated custom command for ${keyword} in group ${groupId}`);
    res.json({
      id: String(info.lastInsertRowid || 0),
      keyword,
      response,
      image_url: image_url || null
    });
  } catch (error) {
    console.error('[API] Error in POST /commands:', error);
    res.status(500).json({ error: 'Failed to create command', message: error.message });
  }
});

router.put('/groups/:groupId/commands/:id', (req, res) => {
  try {
    const { keyword, response, image_url } = req.body;
    const groupId = req.params.groupId;
    const id = req.params.id;
    if (!keyword || !response) return res.status(400).json({ error: 'Keyword and response are required' });

    const now = nowIso();
    const result = db.prepare('UPDATE custom_commands SET keyword = ?, response = ?, media_path = ?, updated_at = ? WHERE id = ? AND group_id = ? AND deleted_at IS NULL').run(keyword, response, image_url || null, now, id, groupId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Command not found' });
    }

    console.log(`[API] Updated custom command id ${id} in group ${groupId}`);
    res.json({
      id: String(id),
      keyword,
      response,
      image_url: image_url || null
    });
  } catch (error) {
    console.error('[API] Error in PUT /commands/:id:', error);
    res.status(500).json({ error: 'Failed to update command', message: error.message });
  }
});

router.delete('/groups/:groupId/commands/:id', (req, res) => {
  try {
    const groupId = req.params.groupId;
    const id = req.params.id;
    const now = nowIso();
    const result = db.prepare('UPDATE custom_commands SET deleted_at = ?, updated_at = ? WHERE id = ? AND group_id = ? AND deleted_at IS NULL').run(now, now, id, groupId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Command not found' });
    }

    console.log(`[API] Soft-deleted custom command id ${id} from group ${groupId}`);
    res.json({ success: true, message: 'Command deleted successfully' });
  } catch (error) {
    console.error('[API] Error in DELETE /commands/:id:', error);
    res.status(500).json({ error: 'Failed to delete command', message: error.message });
  }
});

// 3. TODOS CRUD
router.post('/groups/:groupId/todos', (req, res) => {
  try {
    const { title, done } = req.body;
    const groupId = req.params.groupId;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    const now = nowIso();
    const isDoneVal = done ? 1 : 0;
    const info = db.prepare('INSERT INTO todos (group_id, todo_text, is_done, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(groupId, title, isDoneVal, now, now);

    console.log(`[API] Created todo id ${info.lastInsertRowid} in group ${groupId}`);
    res.json({
      id: String(info.lastInsertRowid),
      title,
      done: !!done
    });
  } catch (error) {
    console.error('[API] Error in POST /todos:', error);
    res.status(500).json({ error: 'Failed to create todo', message: error.message });
  }
});

router.put('/groups/:groupId/todos/:id', (req, res) => {
  try {
    const { title, done } = req.body;
    const groupId = req.params.groupId;
    const id = req.params.id;

    const now = nowIso();
    let result;
    if (title !== undefined && done !== undefined) {
      result = db.prepare('UPDATE todos SET todo_text = ?, is_done = ?, updated_at = ? WHERE id = ? AND group_id = ? AND deleted_at IS NULL').run(title, done ? 1 : 0, now, id, groupId);
    } else if (title !== undefined) {
      result = db.prepare('UPDATE todos SET todo_text = ?, updated_at = ? WHERE id = ? AND group_id = ? AND deleted_at IS NULL').run(title, now, id, groupId);
    } else if (done !== undefined) {
      result = db.prepare('UPDATE todos SET is_done = ?, updated_at = ? WHERE id = ? AND group_id = ? AND deleted_at IS NULL').run(done ? 1 : 0, now, id, groupId);
    } else {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Todo not found or already deleted' });
    }

    const row = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
    console.log(`[API] Updated todo id ${id} in group ${groupId}`);
    res.json({
      id: String(row.id),
      title: row.todo_text,
      done: Boolean(row.is_done)
    });
  } catch (error) {
    console.error('[API] Error in PUT /todos/:id:', error);
    res.status(500).json({ error: 'Failed to update todo', message: error.message });
  }
});

router.delete('/groups/:groupId/todos/:id', (req, res) => {
  try {
    const groupId = req.params.groupId;
    const id = req.params.id;
    const now = nowIso();
    const result = db.prepare('UPDATE todos SET deleted_at = ?, updated_at = ? WHERE id = ? AND group_id = ? AND deleted_at IS NULL').run(now, now, id, groupId);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Todo not found or already deleted' });
    }

    console.log(`[API] Soft-deleted todo id ${id} from group ${groupId}`);
    res.json({ success: true, message: 'Todo deleted successfully' });
  } catch (error) {
    console.error('[API] Error in DELETE /todos/:id:', error);
    res.status(500).json({ error: 'Failed to delete todo', message: error.message });
  }
});

// 4. RENTAL / SEWA FLOW
router.get('/groups/:groupId/rental/status', (req, res) => {
  try {
    const groupId = req.params.groupId;
    const rental = db.prepare('SELECT * FROM group_rentals WHERE group_id = ?').get(groupId);
    
    let is_active = false;
    let expire_at = null;
    let remaining_days = 0;
    
    if (rental) {
      expire_at = rental.expire_at;
      if (rental.is_active === 1 && expire_at) {
        const exp = DateTime.fromISO(expire_at).setZone(TIMEZONE);
        const now = DateTime.now().setZone(TIMEZONE);
        if (exp > now) {
          is_active = true;
          remaining_days = Math.max(0, Math.ceil(exp.diff(now, 'days').days));
        }
      }
    }
    
    res.json({
      group_id: groupId,
      is_active,
      expire_at,
      remaining_days
    });
  } catch (error) {
    console.error('[API] Error in GET /rental/status:', error);
    res.status(500).json({ error: 'Failed to check rental status', message: error.message });
  }
});

router.post('/groups/:groupId/rental/request', async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const { months } = req.body;
    const finalMonths = Number(months) || 1;

    const now = nowIso();
    const info = db.prepare('INSERT INTO rental_requests (group_id, months, status, proof_image, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      groupId, finalMonths, 'pending', null, now, now
    );

    console.log(`[API] Created rental request id ${info.lastInsertRowid} (months: ${finalMonths}) for group ${groupId}`);

    // Send WhatsApp notification
    const sock = req.app.get('sock');
    await resolveInviteJidAndNotify(sock, finalMonths, groupId, false);

    res.json({ success: true, message: 'Rental request submitted successfully', request_id: info.lastInsertRowid });
  } catch (error) {
    console.error('[API] Error in POST /rental/request:', error);
    res.status(500).json({ error: 'Failed to submit rental request', message: error.message });
  }
});

router.post('/groups/:groupId/rental/upload-proof', async (req, res) => {
  try {
    const groupId = req.params.groupId;
    const { months, image } = req.body;
    const finalMonths = Number(months) || 1;

    if (!image) {
      return res.status(400).json({ error: 'Transfer proof image is required' });
    }

    const now = nowIso();
    const info = db.prepare('INSERT INTO rental_requests (group_id, months, status, proof_image, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
      groupId, finalMonths, 'pending', image, now, now
    );

    console.log(`[API] Created rental proof upload id ${info.lastInsertRowid} (months: ${finalMonths}) for group ${groupId}`);

    // Send WhatsApp notifications (both standard request & the proof-uploaded alert text)
    const sock = req.app.get('sock');
    await resolveInviteJidAndNotify(sock, finalMonths, groupId, true);

    res.json({ success: true, message: 'Transfer proof uploaded successfully', request_id: info.lastInsertRowid });
  } catch (error) {
    console.error('[API] Error in POST /rental/upload-proof:', error);
    res.status(500).json({ error: 'Failed to upload rental proof', message: error.message });
  }
});

// GET /api/owner/rental-requests
router.get('/owner/rental-requests', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM rental_requests ORDER BY datetime(created_at) DESC').all();
    res.json(rows);
  } catch (error) {
    console.error('[API] Error in GET /owner/rental-requests:', error);
    res.status(500).json({ error: 'Failed to fetch rental requests', message: error.message });
  }
});

// POST /api/owner/rental-requests/:id/approve
router.post('/owner/rental-requests/:id/approve', async (req, res) => {
  try {
    const id = req.params.id;
    const reqRow = db.prepare('SELECT * FROM rental_requests WHERE id = ? AND status = ?').get(id, 'pending');
    
    if (!reqRow) {
      return res.status(404).json({ error: 'Pending rental request not found' });
    }

    const now = nowIso();
    db.prepare('UPDATE rental_requests SET status = ?, updated_at = ? WHERE id = ?').run('approved', now, id);

    // Extend the rental via helper from db/database.js
    const { extendRental } = require('./db/database');
    const days = reqRow.months * 30;
    extendRental(reqRow.group_id, days, 'owner');

    // Notify group WhatsApp JID
    const sock = req.app.get('sock');
    if (sock) {
      try {
        await sock.sendMessage(reqRow.group_id, {
          text: `✅ *PEMBAYARAN SEWA DISETUJUI*\n\nSewa bot untuk grup ini telah berhasil diperpanjang selama *${reqRow.months} Bulan* oleh Owner.\nTerima kasih atas pembayaran Anda!`
        });
      } catch (err) {
        console.error('[API] Error sending approval WhatsApp message:', err.message);
      }
    }

    console.log(`[API] Approved rental request id ${id} and extended rental for group ${reqRow.group_id} by ${days} days`);
    res.json({ success: true, message: 'Rental request approved and rental extended' });
  } catch (error) {
    console.error('[API] Error in POST /owner/rental-requests/:id/approve:', error);
    res.status(500).json({ error: 'Failed to approve rental request', message: error.message });
  }
});

// POST /api/owner/rental-requests/:id/reject
router.post('/owner/rental-requests/:id/reject', async (req, res) => {
  try {
    const id = req.params.id;
    const reqRow = db.prepare('SELECT * FROM rental_requests WHERE id = ? AND status = ?').get(id, 'pending');
    
    if (!reqRow) {
      return res.status(404).json({ error: 'Pending rental request not found' });
    }

    const now = nowIso();
    db.prepare('UPDATE rental_requests SET status = ?, updated_at = ? WHERE id = ?').run('rejected', now, id);

    // Notify group WhatsApp JID
    const sock = req.app.get('sock');
    if (sock) {
      try {
        await sock.sendMessage(reqRow.group_id, {
          text: `❌ *PEMBAYARAN SEWA DITOLAK*\n\nPengajuan sewa bot untuk grup ini ditolak oleh Owner. Mohon periksa kembali bukti transfer Anda atau hubungi Owner.`
        });
      } catch (err) {
        console.error('[API] Error sending rejection WhatsApp message:', err.message);
      }
    }

    console.log(`[API] Rejected rental request id ${id} for group ${reqRow.group_id}`);
    res.json({ success: true, message: 'Rental request rejected' });
  } catch (error) {
    console.error('[API] Error in POST /owner/rental-requests/:id/reject:', error);
    res.status(500).json({ error: 'Failed to reject rental request', message: error.message });
  }
});

// 5. POST /api/wa/send-rental-notification
router.post('/wa/send-rental-notification', async (req, res) => {
  try {
    const { target, months, group_id, type } = req.body;
    const finalMonths = Number(months) || 1;
    const sock = req.app.get('sock');

    if (!sock) {
      return res.status(500).json({ error: 'WhatsApp bot is not connected' });
    }

    const isProof = type === 'upload_proof';
    await resolveInviteJidAndNotify(sock, finalMonths, group_id, isProof);

    res.json({ success: true, message: 'Notification sent successfully' });
  } catch (error) {
    console.error('[API] Error in POST /wa/send-rental-notification:', error);
    res.status(500).json({ error: 'Failed to send notification', message: error.message });
  }
});

module.exports = router;
