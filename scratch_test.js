const { db } = require('./db/database');
console.log('TOKENS:', db.prepare('SELECT * FROM dashboard_tokens').all());
console.log('RENTALS:', db.prepare('SELECT * FROM group_rentals').all());
