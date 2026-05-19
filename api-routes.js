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
  const { token } = req.body;
  if (!groupId || !token) return res.status(400).json({ success: false, error: 'Missing groupId or token' });

  const validToken = db.prepare('SELECT * FROM dashboard_tokens WHERE token = ? AND group_id = ? AND pin_verified = 1 AND datetime(expires_at) > datetime(?)').get(token, groupId, nowIso());
  
  if (!validToken) return res.status(401).json({ success: false, error: 'Token invalid, expired, or PIN not verified' });

  
  const rental = db.prepare('SELECT * FROM group_rentals WHERE group_id = ?').get(groupId);
  
  res.json({ 
    valid: true, 
    group: { 
      id: groupId, 
      name: rental ? 'Grup Keuangan' : 'Grup WhatsApp'
    } 
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

module.exports = router;
