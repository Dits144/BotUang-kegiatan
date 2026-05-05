# WhatsApp Bot Keuangan Kegiatan (Update Stabilitas)

## Update struktur file

- `index.js` (routing utama + role + gate sewa + typo)
- `commands/finance.js` (helper format riwayat/transaksi + cache history)
- `commands/adminTools.js` (**baru**, clearall per grup)
- `commands/owner.js` (tambah `#health` + `#broadcast`)
- `commands/help.js` (menu rapi per role)
- `commands/customCommands.js` (foto + caption)
- `commands/participants.js` (cache clear helper)
- `commands/todo.js` (cache clear helper)
- `db/database.js` (schema media/reminder/sewa)

## Logic handler baru

### 1) `clearall` (admin grup / owner)
- `clearall` → minta konfirmasi
- `clearall yes` → reset semua data khusus grup:
  - transaksi
  - peserta
  - custom command
  - todo
  - reminder
  - group settings (header/weather)
  - cache riwayat/peserta/todo
- Tidak menghapus:
  - data sewa grup
  - data owner
  - data global bot

### 2) `#health` (owner only)
Menampilkan:
- status bot
- CPU
- RAM
- uptime
- server time WIB
- status aman/waspada/tinggi

### 3) helper format riwayat
`finance.formatRiwayatHelp()` untuk output vertikal rapi.

### 4) helper format transaksi
`finance.formatTransactionHelp()` dipakai saat user kirim `+`, `-`, atau `inputtransaksi`.

### 5) typo suggestion
Pakai Levenshtein (`utils/typo.js`) untuk saran command terdekat.

### 6) custom command foto
- Simpan media ke `media/commands`
- Simpan `media_path`, `media_type`, `caption_text`
- Trigger keyword kirim foto + caption jika ada media

## Contoh balasan bot

### clearall
`clearall` →
```txt
⚠️ Yakin ingin menghapus semua data grup ini?

Ketik:
clearall yes
untuk melanjutkan.
```

`clearall yes` →
```txt
✅ Semua data grup berhasil direset.

Database grup ini sudah dimulai dari awal.
```

### #health
```txt
🩺 HEALTH BOT

🤖 Status: Online
🖥 CPU: 27%
📦 RAM: 312 MB / 2 GB
⏱ Uptime: 5 jam 12 menit
🕒 Server Time: 18-02-2026 06:30 WIB

✅ Kondisi server aman
```

### riwayat format
```txt
📒 FORMAT RIWAYAT
...
```

### transaksi format
```txt
💰 FORMAT INPUT TRANSAKSI
...
```

## Help (rapi)
- USER
- ADMIN GROUP
- OWNER BOT
sudah dipisah vertikal dan mudah dibaca di WhatsApp.
