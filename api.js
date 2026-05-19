const express = require('express');
const cors = require('cors');

function startApi(sock) {
  const app = express();
  app.set('sock', sock);
  const PORT = process.env.API_PORT || 3005;

  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Authentication middleware
  app.use((req, res, next) => {
    // 1. Bypass auth for root and connect validation endpoints
    if (
      req.path === '/' || 
      req.path === '/api' || 
      req.path === '/api/' || 
      req.path === '/connect' ||
      req.path === '/connect/verify' ||
      (req.path === '/api/owner/qris' && req.method === 'GET') ||
      req.path.endsWith('/connect/validate')
    ) {
      return next();
    }
    
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: Missing or invalid token format' });
    }
    
    const token = authHeader.substring(7);
    const apiKey = process.env.LOVABLE_API_KEY || 'KunciRahasiaBotUangSaya12345';
    
    // 2. Allow if global API Key matches
    if (token === apiKey) {
      return next();
    }
    
    // 3. Allow if it is a valid, non-expired temporary session token for this group
    let groupId = req.headers['x-group-id'];
    if (!groupId) {
      const match = req.path.match(/\/api\/groups\/([^/]+)/);
      if (match) {
        groupId = decodeURIComponent(match[1]);
      }
    }
    
    if (groupId) {
      const { db } = require('./db/database');
      const { DateTime } = require('luxon');
      const { TIMEZONE } = require('./config');
      const nowIso = DateTime.now().setZone(TIMEZONE).toISO();
      
      const validToken = db.prepare('SELECT * FROM dashboard_tokens WHERE token = ? AND group_id = ? AND pin_verified = 1 AND datetime(expires_at) > datetime(?)')
        .get(token, groupId, nowIso);
        
      if (validToken) {
        return next();
      }
    }
    
    return res.status(401).json({ error: 'Unauthorized: Invalid API Key or session token' });
  });

  // HTML page for PIN setting / verification
  app.get('/connect', (req, res) => {
    const { group_id, token } = req.query;
    if (!group_id || !token) {
      return res.status(400).send('❌ Parameter tidak lengkap (group_id dan token diperlukan).');
    }

    const { db } = require('./db/database');
    const { DateTime } = require('luxon');
    const { TIMEZONE } = require('./config');
    const nowIso = DateTime.now().setZone(TIMEZONE).toISO();

    const validToken = db.prepare('SELECT * FROM dashboard_tokens WHERE token = ? AND group_id = ? AND datetime(expires_at) > datetime(?)')
      .get(token, group_id, nowIso);

    if (!validToken) {
      return res.status(401).send('❌ Token akses tidak valid atau sudah kadaluarsa. Silakan ketik "dashboard" lagi di grup WhatsApp.');
    }

    // Helper for manual cookie parsing
    const parseCookies = (r) => {
      const list = {};
      const rc = r.headers.cookie;
      if (rc) {
        rc.split(';').forEach(c => {
          const parts = c.split('=');
          list[parts.shift().trim()] = decodeURI(parts.join('='));
        });
      }
      return list;
    };

    const cookies = parseCookies(req);
    const isAlreadyVerified = cookies[`verified_${group_id}`] === 'true';

    if (isAlreadyVerified) {
      // Auto-login! Mark token as verified
      db.prepare('UPDATE dashboard_tokens SET pin_verified = 1 WHERE token = ?').run(token);

      // Redirect to Lovable dashboard
      const WEB_URL = process.env.LOVABLE_API_URL || 'https://wabot-dashboard.lovable.app';
      const botApiUrl = process.env.VITE_BOT_API_URL || process.env.BOT_API_URL || '';
      
      let finalApiUrl = botApiUrl;
      if (!finalApiUrl) {
        const fs = require('fs');
        const path = require('path');
        const os = require('os');
        const possiblePaths = [
          path.join(os.homedir(), '.pm2/logs/cloudflare-tunnel-3005-out.log'),
          path.join(os.homedir(), '.pm2/logs/cloudflare-tunnel-3005-error.log'),
          path.join(os.homedir(), '.pm2/logs/cloudflare-tunnel-3005.log')
        ];
        for (const logPath of possiblePaths) {
          if (fs.existsSync(logPath)) {
            try {
              const content = fs.readFileSync(logPath, 'utf8');
              const match = content.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
              if (match) {
                finalApiUrl = match[0];
                break;
              }
            } catch(e){}
          }
        }
      }
      return res.redirect(`${WEB_URL}/connect?group_id=${encodeURIComponent(group_id)}&token=${encodeURIComponent(token)}${finalApiUrl ? `&apiUrl=${encodeURIComponent(finalApiUrl)}` : ''}`);
    }

    const rental = db.prepare('SELECT password FROM group_rentals WHERE group_id = ?').get(group_id);
    const hasPassword = rental && rental.password;

    const subtitleText = hasPassword 
      ? 'Grup Anda telah diamankan dengan PIN. Silakan masukkan PIN / Password grup untuk masuk.'
      : 'Selamat Datang! Silakan setel PIN / Password keamanan baru untuk membatasi akses ke dashboard grup ini.';
    const labelText = hasPassword ? 'Masukkan PIN / Password Grup' : 'Setel PIN / Password Baru';
    const placeholderText = hasPassword ? 'Masukkan PIN Anda' : 'Bebas, misal PIN 6 angka atau kata sandi';
    const buttonText = hasPassword ? 'Verifikasi & Masuk' : 'Simpan PIN & Masuk';
    const errorHtml = req.query.error ? `<div class="error-msg">⚠️ PIN / Password salah! Silakan coba lagi.</div>` : '';

    res.send(`
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Akses Keamanan Dashboard - Bot Uang</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0b0f19;
      --panel: rgba(17, 24, 39, 0.7);
      --border: rgba(255, 255, 255, 0.08);
      --primary: #10b981;
      --primary-glow: rgba(16, 185, 129, 0.4);
      --text: #f3f4f6;
      --text-mute: #9ca3af;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Outfit', sans-serif;
      background: var(--bg);
      background-image: 
        radial-gradient(at 0% 0%, rgba(16, 185, 129, 0.1) 0px, transparent 50%),
        radial-gradient(at 100% 100%, rgba(59, 130, 246, 0.1) 0px, transparent 50%);
      color: var(--text);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      overflow-x: hidden;
    }
    .card {
      background: var(--panel);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--border);
      border-radius: 24px;
      padding: 40px 32px;
      width: 100%;
      max-width: 420px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
      text-align: center;
      animation: fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .logo-container {
      margin-bottom: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 64px;
      height: 64px;
      border-radius: 18px;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.2);
      box-shadow: 0 8px 24px var(--primary-glow);
    }
    .logo-icon {
      font-size: 28px;
    }
    h1 {
      font-size: 24px;
      font-weight: 800;
      margin-bottom: 8px;
      letter-spacing: -0.5px;
    }
    h1 span {
      background: linear-gradient(135deg, #10b981, #3b82f6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .subtitle {
      font-size: 14px;
      color: var(--text-mute);
      margin-bottom: 32px;
      line-height: 1.5;
    }
    .form-group {
      text-align: left;
      margin-bottom: 24px;
    }
    label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-mute);
      margin-bottom: 8px;
    }
    input {
      width: 100%;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 14px 16px;
      color: var(--text);
      font-family: inherit;
      font-size: 16px;
      transition: all 0.3s ease;
      outline: none;
    }
    input:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
      background: rgba(255, 255, 255, 0.05);
    }
    button {
      width: 100%;
      background: linear-gradient(135deg, #10b981, #059669);
      border: none;
      border-radius: 12px;
      padding: 14px;
      color: white;
      font-family: inherit;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 12px var(--primary-glow);
      transition: all 0.2s ease;
    }
    button:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 20px var(--primary-glow);
      opacity: 0.95;
    }
    button:active {
      transform: translateY(0);
    }
    .error-msg {
      margin-bottom: 20px;
      padding: 12px;
      border-radius: 10px;
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.2);
      color: #ef4444;
      font-size: 14px;
      text-align: left;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo-container">
      <span class="logo-icon">🔐</span>
    </div>
    <h1>Akses <span>Dashboard</span></h1>
    <p class="subtitle">${subtitleText}</p>
    
    ${errorHtml}
    
    <form action="/connect/verify" method="POST">
      <input type="hidden" name="group_id" value="${group_id}">
      <input type="hidden" name="token" value="${token}">
      
      <div class="form-group">
        <label for="password">${labelText}</label>
        <input type="password" id="password" name="password" required placeholder="${placeholderText}" autofocus>
      </div>
      
      <button type="submit">${buttonText}</button>
    </form>
  </div>
</body>
</html>
    `);
  });

  app.post('/connect/verify', (req, res) => {
    const { group_id, token, password } = req.body;
    if (!group_id || !token || !password) {
      return res.status(400).send('❌ Data tidak lengkap.');
    }

    const cleanGroupId = decodeURIComponent(group_id);
    const cleanToken = decodeURIComponent(token);

    const { db } = require('./db/database');
    const { DateTime } = require('luxon');
    const { TIMEZONE } = require('./config');
    const nowIso = DateTime.now().setZone(TIMEZONE).toISO();

    const validToken = db.prepare('SELECT * FROM dashboard_tokens WHERE token = ? AND group_id = ? AND datetime(expires_at) > datetime(?)')
      .get(cleanToken, cleanGroupId, nowIso);

    if (!validToken) {
      return res.status(401).send('❌ Token akses tidak valid atau sudah kadaluarsa. Silakan ketik "dashboard" lagi di grup WhatsApp.');
    }

    const rental = db.prepare('SELECT password FROM group_rentals WHERE group_id = ?').get(cleanGroupId);
    const hasPassword = rental && rental.password;

    if (!hasPassword) {
      // Set new password
      db.prepare('UPDATE group_rentals SET password = ? WHERE group_id = ?').run(password, cleanGroupId);
    } else {
      // Verify existing password
      if (rental.password !== password) {
        return res.redirect(`/connect?group_id=${encodeURIComponent(cleanGroupId)}&token=${encodeURIComponent(cleanToken)}&error=1`);
      }
    }

    // Mark token as verified
    db.prepare('UPDATE dashboard_tokens SET pin_verified = 1 WHERE token = ?').run(cleanToken);

    // Set auto-login cookie
    res.setHeader('Set-Cookie', `verified_${cleanGroupId}=true; Max-Age=31536000; Path=/; HttpOnly; SameSite=Lax`);

    // Redirect to Lovable dashboard
    const WEB_URL = process.env.LOVABLE_API_URL || 'https://www.dashboardits.tech';
    const botApiUrl = process.env.VITE_BOT_API_URL || process.env.BOT_API_URL || '';
    
    // Find dynamic cloudflare url
    let finalApiUrl = botApiUrl;
    if (!finalApiUrl) {
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      const possiblePaths = [
        path.join(os.homedir(), '.pm2/logs/cloudflare-tunnel-3005-out.log'),
        path.join(os.homedir(), '.pm2/logs/cloudflare-tunnel-3005-error.log'),
        path.join(os.homedir(), '.pm2/logs/cloudflare-tunnel-3005.log')
      ];
      for (const logPath of possiblePaths) {
        if (fs.existsSync(logPath)) {
          try {
            const content = fs.readFileSync(logPath, 'utf8');
            const match = content.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
            if (match) {
              finalApiUrl = match[0];
              break;
            }
          } catch(e){}
        }
      }
    }

    res.redirect(`${WEB_URL}/connect?group_id=${encodeURIComponent(cleanGroupId)}&token=${encodeURIComponent(cleanToken)}${finalApiUrl ? `&apiUrl=${encodeURIComponent(finalApiUrl)}` : ''}`);
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
