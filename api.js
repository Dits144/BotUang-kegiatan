const express = require('express');
const cors = require('cors');

function startApi(sock) {
  const app = express();
  const PORT = process.env.API_PORT || 3005;

  app.use(cors());
  app.use(express.json());

  // Authentication middleware
  app.use((req, res, next) => {
    // Abaikan auth untuk path tertentu jika perlu
    if (req.path === '/') return next();
    
    const authHeader = req.headers.authorization;
    const apiKey = process.env.LOVABLE_API_KEY;
    
    if (apiKey && (!authHeader || authHeader !== `Bearer ${apiKey}`)) {
      return res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
    }
    next();
  });

  // Root path to test connection
  app.get('/', (req, res) => {
    res.send('✅ Bot API is running perfectly!');
  });

  // Check bot status
  app.get('/api/status', (req, res) => {
    if (sock && sock.user) {
      res.json({ status: 'connected', user: sock.user });
    } else {
      res.json({ status: 'disconnected' });
    }
  });

  // Send message
  app.post('/api/send-message', async (req, res) => {
    const { to, text } = req.body;
    
    if (!to || !text) {
      return res.status(400).json({ error: 'Missing "to" or "text" in request body' });
    }

    try {
      // Ensure the number is formatted correctly
      let jid = to;
      if (!jid.includes('@')) {
        jid = jid.endsWith('g.us') ? jid : `${jid}@s.whatsapp.net`;
      }
      
      await sock.sendMessage(jid, { text: text });
      res.json({ success: true, message: 'Message sent successfully' });
    } catch (error) {
      console.error('[API] Error sending message:', error);
      res.status(500).json({ success: false, error: 'Failed to send message' });
    }
  });

  // Get bot info
  app.get('/api/info', (req, res) => {
    try {
      const { db } = require('./db/database');
      const groupsCount = db.prepare('SELECT COUNT(*) as count FROM group_rentals').get().count;
      
      res.json({
        success: true,
        data: {
          activeGroups: groupsCount
        }
      });
    } catch (error) {
      console.error('[API] Error getting info:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch bot info' });
    }
  });

  // Get all groups
  app.get('/api/groups', async (req, res) => {
    try {
      if (!sock) return res.status(500).json({ success: false, error: 'Bot is not connected' });
      
      const { db } = require('./db/database');
      // Ambil grup yang aktif disewa
      const rentals = db.prepare('SELECT * FROM group_rentals WHERE is_active=1').all();
      
      // Ambil metadata dari memori Baileys
      const allGroups = await sock.groupFetchAllParticipating();
      
      const results = [];
      for (const r of rentals) {
        const meta = allGroups[r.group_id];
        results.push({
          id: r.group_id,
          jid: r.group_id,
          name: meta ? meta.subject : r.group_id,
          is_active: r.is_active === 1,
          expire_at: r.expire_at
        });
      }
      
      res.json({ success: true, data: results });
    } catch (error) {
      console.error('[API] Error getting groups:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch groups' });
    }
  });

  // Mount full CRUD routes
  const apiRoutes = require('./api-routes');
  app.use('/api', apiRoutes);

  // Catch-all route to log missing endpoints
  app.use((req, res) => {
    console.log(`[API 404] Lovable Dashboard mencoba mengakses: ${req.method} ${req.url}`);
    res.status(404).json({ error: 'Endpoint not found', path: req.url });
  });

  app.listen(PORT, () => {
    console.log(`🚀 API Server running on http://localhost:${PORT}`);
  });

  return app;
}

module.exports = { startApi };
