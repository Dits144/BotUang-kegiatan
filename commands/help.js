/* ─────────────────────────────────────────────
   help.js  –  Role-based help menu
   Roles: 'owner' | 'admin' | 'user'
   ───────────────────────────────────────────── */

const USER_SECTION = [
  '━━━━━━━━━━━━━━━━━━',
  '👤 *MENU USER* 👤',
  '━━━━━━━━━━━━━━━━━━',
  'ℹ️ rolesaya             - cek role anda',
  '📋 listpeserta          - lihat list peserta',
  '📒 riwayat              - lihat riwayat transaksi',
  '🧮 kalkulator           - tambah | kurang | kali | bagi',
  '🌤 weather              - cek cuaca',
  '📝 todolist             - lihat daftar to-do',
  '⚡ keyword command      - auto-reply keyword',
].join('\n');

const ADMIN_SECTION = [
  '',
  '━━━━━━━━━━━━━━━━━━',
  '👑 *MENU ADMIN* 👑',
  '━━━━━━━━━━━━━━━━━━',
  '🌐 dasbor               - akses web dasbor',
  '💰 + nominal (catatan)  - catat pemasukan',
  '💸 - nominal (catatan)  - catat pengeluaran',
  '',
  '✏️ edit no (data baru)  - edit transaksi',
  '❌ hapus no             - hapus transaksi',
  '🔍 detail no            - detail transaksi',
  '',
  '➕ addpeserta           - tambah peserta',
  '✏️ updatepeserta        - edit data peserta',
  '❌ delpeserta           - hapus peserta',
  '',
  '📌 command KEYWORD@text - buat perintah custom',
  '🔄 updatecommand KEYWORD@text',
  '🗑 delcommand KEYWORD   - hapus command',
  '📄 listcommand          - lihat semua command',
  '',
  '⚙ setheader@text       - atur header list peserta',
  '⚙ typo on/off          - fitur koreksi perintah',
  '📊 cekaktif             - cek status sewa bot',
  '🔐 pin                  - cek PIN dashboard grup',
  '🔐 setpin               - generate PIN baru',
  '',
  '━━━━━━━━━━━━━━━━━━',
  '⏰ *REMINDER* ⏰',
  '━━━━━━━━━━━━━━━━━━',
  '🔔 remind HH.mm@pesan',
  '🔔 remind DD/MM/YYYY@pesan',
  '🔔 remind HH.mm&DD/MM/YYYY@pesan',
  '📜 listremind           - lihat reminder aktif',
  '🔕 noremind HH.mm       - hapus reminder',
  '',
  '━━━━━━━━━━━━━━━━━━',
  '📝 *TO DO* 📝',
  '━━━━━━━━━━━━━━━━━━',
  '➕ todo (text)          - tambah to-do',
  '📋 todolist             - lihat to-do',
  '✅ doto (no)            - tandai selesai',
].join('\n');

const OWNER_SECTION = [
  '',
  '━━━━━━━━━━━━━━━━━━',
  '🔑 *MENU OWNER* 🔑',
  '━━━━━━━━━━━━━━━━━━',
  'ℹ️ #infogroup (idgrup)',
  '✅ #aktif (idgrup) (hari)',
  '⛔ #nonaktif (idgrup)',
  '📊 #statussewa          - status semua sewa grup',
  '📢 #broadcast@pesan     - broadcast ke semua grup',
  '📢 brdcs 62xxx,62xxx@pesan - broadcast ke nomor',
  '🩺 #health              - cek kesehatan server',
].join('\n');

const HEADER = [
  '🤖 *BOT KEUANGAN KEGIATAN*',
  '━━━━━━━━━━━━━━━━━━',
].join('\n');

/**
 * Returns the help text based on role.
 * @param {'owner'|'admin'|'user'} role
 */
function menuText(role = 'user') {
  if (role === 'owner') {
    return [HEADER, USER_SECTION, ADMIN_SECTION, OWNER_SECTION].join('\n');
  }
  if (role === 'admin') {
    return [HEADER, USER_SECTION, ADMIN_SECTION].join('\n');
  }
  // default: user
  return [HEADER, USER_SECTION].join('\n');
}

module.exports = { menuText };
