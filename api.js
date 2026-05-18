const express = require('express');
const cors = require('cors');

function startApi(sock) {
  const app = express();
  const PORT = process.env.API_PORT || 3000;

  app.use(cors());
  app.use(express.json());

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

  app.listen(PORT, () => {
    console.log(`🚀 API Server running on http://localhost:${PORT}`);
  });

  return app;
}

module.exports = { startApi };
