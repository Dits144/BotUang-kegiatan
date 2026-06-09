const { db } = require('./db/database');
console.log('REMINDERS:', db.prepare('SELECT * FROM reminders WHERE deleted_at IS NULL').all());
console.log('DISPATCHES:', db.prepare('SELECT * FROM reminder_dispatch').all());
