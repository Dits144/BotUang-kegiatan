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
router.post('/connect/validate', (req, res) => {
  const { group_id, token } = req.body;
  if (!group_id || !token) return res.status(400).json({ success: false, error: 'Missing group_id or token' });

  const validToken = db.prepare('SELECT * FROM dashboard_tokens WHERE token = ? AND group_id = ? AND datetime(expires_at) > datetime(?)').get(token, group_id, nowIso());
  
  if (!validToken) return res.status(401).json({ success: false, error: 'Token invalid or expired' });
  
  res.json({ success: true, message: 'Valid token' });
});

// --- OWNER DATA ---
router.get('/owner/groups', (req, res) => {
  const rentals = db.prepare('SELECT * FROM group_rentals').all();
  res.json({ success: true, data: rentals });
});

// --- GROUP DASHBOARD DATA ---
router.get('/groups/:groupId', (req, res) => {
  const groupId = req.params.groupId;
  const rental = db.prepare('SELECT * FROM group_rentals WHERE group_id = ?').get(groupId);
  if (!rental) return res.status(404).json({ success: false, error: 'Group not found' });
  res.json({ success: true, data: rental });
});

router.get('/groups/:groupId/summary', (req, res) => {
  const groupId = req.params.groupId;
  const income = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE group_id=? AND type='income' AND deleted_at IS NULL`).get(groupId).total;
  const expense = db.prepare(`SELECT COALESCE(SUM(amount),0) as total FROM transactions WHERE group_id=? AND type='expense' AND deleted_at IS NULL`).get(groupId).total;
  const participantCount = db.prepare(`SELECT COUNT(*) as c FROM participants WHERE group_id=? AND deleted_at IS NULL`).get(groupId).c;
  const reminderCount = db.prepare(`SELECT COUNT(*) as c FROM reminders WHERE group_id=? AND deleted_at IS NULL`).get(groupId).c;
  
  res.json({
    success: true,
    data: {
      balance: income - expense,
      total_income: income,
      total_expense: expense,
      participants: participantCount,
      reminders: reminderCount
    }
  });
});

router.get('/groups/:groupId/settings', (req, res) => {
  const row = db.prepare('SELECT * FROM group_settings WHERE group_id=?').get(req.params.groupId);
  res.json({ success: true, data: row || {} });
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
  `).run(groupId, header_text, weather_location, typo_enabled, nowIso());
  
  res.json({ success: true, message: 'Settings updated' });
});

router.get('/groups/:groupId/transactions', (req, res) => {
  const rows = db.prepare('SELECT * FROM transactions WHERE group_id=? AND deleted_at IS NULL ORDER BY datetime(created_at) DESC').all(req.params.groupId);
  res.json({ success: true, data: rows });
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
  res.json({ success: true, data: rows });
});

router.get('/groups/:groupId/commands', (req, res) => {
  const rows = db.prepare('SELECT * FROM custom_commands WHERE group_id=? AND deleted_at IS NULL ORDER BY created_at ASC').all(req.params.groupId);
  res.json({ success: true, data: rows });
});

router.get('/groups/:groupId/reminders', (req, res) => {
  const rows = db.prepare('SELECT * FROM reminders WHERE group_id=? AND deleted_at IS NULL ORDER BY created_at ASC').all(req.params.groupId);
  res.json({ success: true, data: rows });
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
  res.json({ success: true, data: rows });
});

module.exports = router;
