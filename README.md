# Telegram Bot Manajemen Stok Akun Digital

Bot Telegram untuk CRUD stok akun digital (email + password), order FEFO, dan tracking masa aktif.

## Alasan memilih Node.js + TypeScript + Telegraf
- Telegraf matang untuk Telegram Bot API dan mudah dipadukan dengan scene/wizard.
- TypeScript memberi type-safety untuk state machine, service, dan query DB.
- Ekosistem Node memudahkan enkripsi, CSV export, dan deployment.

## Struktur Folder

```txt
src/
  bot/
    handlers/        # command dan callback handlers
    scenes/          # state machine (wizard)
    keyboards/       # inline keyboard
    middlewares/     # auth admin + rate limit
    index.ts
    types.ts
  services/          # business logic produk/stok/order/export/log
  db/
    migrations/      # SQL migration file
    models/          # type model
    migrate.ts       # runner migration
  utils/             # tanggal, enkripsi, masking
  config/            # env + database
  index.ts           # app entry
```

## Fitur Utama
- Admin only (`ADMIN_IDS`) untuk semua fitur manajemen.
- Produk: tambah + list.
- Stok akun: tambah dengan metode:
  - A. durasi paket aktif saat dijual.
  - B. sisa aktif sekarang (`1 bulan 5 hari`) => langsung hitung `expires_at`.
- FEFO order: ambil akun `AVAILABLE` paling dekat expired.
- Multi-qty order (1/2/3), akun tidak duplikat.
- Status akun: `AVAILABLE`, `RESERVED`, `SOLD`, `EXPIRED`.
- Auto mark expired.
- Export CSV (safe/no password atau include password).
- Encryption email/password di DB (AES-256-GCM, key dari ENV).
- Log aktivitas: `ADD_STOCK`, `SELL`, `EXPORT`, `EDIT`, `DELETE` (DELETE disiapkan untuk perluasan).
- Rate limit dasar user.

## Setup & Run

1. Install dependency
```bash
npm install
```

2. Siapkan env
```bash
cp .env.example .env
# isi BOT_TOKEN, ADMIN_IDS, ENCRYPTION_KEY, dll
```

3. Jalankan migration
```bash
npm run migrate
```

4. Jalankan bot dev
```bash
npm run dev
```

5. Build production
```bash
npm run build && npm start
```

## Konfigurasi ENV
- `BOT_TOKEN`
- `ADMIN_IDS` (pisahkan koma)
- `TIMEZONE=Asia/Jakarta`
- `ENCRYPTION_KEY`
- `DATABASE_CLIENT=sqlite|postgres`
- `DATABASE_URL` (contoh sqlite: `./data/bot.db`, postgres: full connection URI)

## Contoh Penggunaan

### 1) Admin tambah stok CapCut dengan sisa aktif `1 bulan 5 hari`
1. `/admin` -> `Tambah Produk` (jika belum ada) -> isi `CAPCUT PRO`, durasi default, catatan.
2. `/admin` -> `Tambah Stok`.
3. Pilih ID produk `CAPCUT PRO`.
4. Input email + password.
5. Pilih metode **B**.
6. Input: `1 bulan 5 hari`.
7. Bot simpan stok `AVAILABLE`, `start_at=now`, `expires_at=now + 1 bulan + 5 hari`.

### 2) User beli 1 akun
1. `/start` -> `Lihat Produk` -> `/buy`.
2. Pilih produk `CAPCUT PRO`, qty `1`.
3. Bot keluarkan akun A (FEFO), ubah status jadi `SOLD`, isi `sold_to`, `sold_at`.

### 3) User beli 1 akun lagi
1. Ulangi `/buy` produk yang sama qty `1`.
2. Bot keluarkan akun B (berbeda dengan akun A), karena akun A sudah `SOLD`.

## Catatan Upgrade PostgreSQL
- Ubah `.env`:
  - `DATABASE_CLIENT=postgres`
  - `DATABASE_URL=postgres://user:pass@host:5432/dbname`
- Jalankan migration yang sama via `npm run migrate`.
# BotUang-kegiatan
