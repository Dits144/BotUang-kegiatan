const express = require('express');
const crypto = require('crypto');
const { DateTime } = require('luxon');
const { db } = require('./db/database');
const { TIMEZONE } = require('./config');

const router = express.Router();

function nowIso() {
  return DateTime.now().setZone(TIMEZONE).toISO();
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
router.get('/groups', (req, res) => {
  const rentals = db.prepare('SELECT * FROM group_rentals').all();
  const groups = rentals.map(r => ({
    id: r.group_id,
    name: 'Grup Keuangan',
    status: r.is_active ? 'active' : 'inactive',
    expired_at: r.expire_at
  }));
  res.json(groups);
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
  const { remind_type, remind_value, remind_text } = req.body;
  db.prepare(`INSERT INTO reminders (group_id, remind_type, remind_value, remind_text, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
    req.params.groupId, remind_type, remind_value, remind_text, 'dashboard', nowIso()
  );
  res.json({ success: true, message: 'Reminder created' });
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

module.exports = router;
