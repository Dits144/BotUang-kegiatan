const { LOVABLE_API_URL, LOVABLE_API_KEY } = require('../config');

// Helper to make API calls to Lovable dashboard
async function fetchLovable(endpoint, method = 'GET', body = null) {
  if (!LOVABLE_API_KEY) {
    console.warn('[Lovable API] Skiping request because LOVABLE_API_KEY is not set.');
    return null;
  }

  const url = `${LOVABLE_API_URL}${endpoint}`;
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json'
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(url, options);
    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[Lovable API] Error ${res.status} on ${method} ${endpoint}:`, errorText);
      return null;
    }
    const data = await res.json();
    return data;
  } catch (err) {
    console.error(`[Lovable API] Request failed for ${method} ${endpoint}:`, err.message);
    return null;
  }
}

async function syncGroup(jid, name) {
  return await fetchLovable('/api/public/bot/groups', 'POST', { jid, name });
}

async function syncTransaction(group_jid, type, amount, category) {
  return await fetchLovable('/api/public/bot/transactions', 'POST', {
    type, // 'in' or 'out'
    amount: Number(amount),
    category,
    group_jid
  });
}

async function markReminderSent(id) {
  return await fetchLovable('/api/public/bot/reminders', 'PATCH', { id });
}

async function sendHeartbeat(isOnline = true) {
  return await fetchLovable('/api/public/bot/heartbeat', 'POST', { online: isOnline });
}

async function createMagicLink(group_jid) {
  return await fetchLovable('/api/public/bot/auth/magic', 'POST', { group_jid });
}

async function getDueReminders() {
  return await fetchLovable('/api/public/bot/reminders?due=1', 'GET');
}

module.exports = {
  syncGroup,
  syncTransaction,
  markReminderSent,
  sendHeartbeat,
  createMagicLink,
  getDueReminders
};
