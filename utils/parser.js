function normalizeAmount(raw) {
  const digits = String(raw || '').replace(/[^\d]/g, '');
  if (!digits) return null;
  return Number.parseInt(digits, 10);
}

function parseTxInput(text) {
  const m = String(text || '').trim().match(/^([+-])\s*([\d.,]+)\s*(.+)$/);
  if (!m) return null;
  const amount = normalizeAmount(m[2]);
  if (!amount || amount <= 0) return null;
  const rest = m[3].trim();
  const noteMatch = rest.match(/\(([^)]+)\)/);
  const note = (noteMatch ? noteMatch[1] : rest).trim();
  if (!note) return null;
  return { type: m[1] === '+' ? 'income' : 'expense', amount, note };
}

function parseEdit(text) {
  const m = String(text || '').trim().match(/^edit\s+(\d+)\s+([+-])\s*([\d.,]+)\s*(.+)$/i);
  if (!m) return null;
  const no = Number.parseInt(m[1], 10);
  const amount = normalizeAmount(m[3]);
  const noteMatch = m[4].trim().match(/\(([^)]+)\)/);
  const note = (noteMatch ? noteMatch[1] : m[4]).trim();
  if (!no || !amount || !note) return null;
  return { no, type: m[2] === '+' ? 'income' : 'expense', amount, note };
}

function parseNoCommand(text, cmd) {
  const m = String(text || '').trim().match(new RegExp(`^${cmd}\\s+(\\d+)$`, 'i'));
  if (!m) return null;
  return Number.parseInt(m[1], 10);
}

function parseOwnerActivate(text, currentGroupId) {
  // Format: #aktif 120363xxx@g.us 3
  let m = String(text || '').trim().match(/^#aktif\s+([^\s]+@g\.us)\s+(\d+)$/i);
  if (m) return { groupId: m[1], days: Number.parseInt(m[2], 10) };
  
  // Format: #aktif 3 (inside group)
  m = String(text || '').trim().match(/^#aktif\s+(\d+)$/i);
  if (m && currentGroupId) return { groupId: currentGroupId, days: Number.parseInt(m[1], 10) };
  
  return null;
}

function parseOwnerDeactivate(text) {
  const m = String(text || '').trim().match(/^#nonaktif\s+(\S+)$/i);
  return m ? { groupId: m[1] } : null;
}

function parseInfoGroup(text) {
  const m = String(text || '').trim().match(/^#infogroup(?:\s+(\S+))?$/i);
  return m ? { groupId: m[1] || null } : null;
}

module.exports = {
  normalizeAmount,
  parseTxInput,
  parseEdit,
  parseNoCommand,
  parseOwnerActivate,
  parseOwnerDeactivate,
  parseInfoGroup
};
