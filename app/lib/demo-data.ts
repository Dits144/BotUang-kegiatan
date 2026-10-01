export const DEMO_GROUP_ID = "demo-botuang-group";
export const DEMO_GROUP_NAME = "Demo Kas Grup Kegiatan (Preview)";

export function isDemoSession(groupId?: string | null): boolean {
  return groupId === DEMO_GROUP_ID;
}

export function activateDemoSession(): void {
  if (typeof window === "undefined") return;
  const demoPayload = {
    groupId: DEMO_GROUP_ID,
    groupName: DEMO_GROUP_NAME,
    isDemo: true,
    connectedAt: new Date().toISOString(),
  };
  window.localStorage.setItem("botuang.dashboard.session", JSON.stringify(demoPayload));
}

export const INITIAL_DEMO_TRANSACTIONS = [
  {
    id: "demo-tx-1",
    group_id: DEMO_GROUP_ID,
    type: "income" as const,
    amount: 1500000,
    note: "Iuran Wajib Kas Anggota (15 Orang)",
    sender_id: "6281234567890@s.whatsapp.net",
    sender_name: "Bendahara Kas",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    edited_at: null,
    deleted_at: null,
  },
  {
    id: "demo-tx-2",
    group_id: DEMO_GROUP_ID,
    type: "income" as const,
    amount: 3500000,
    note: "Sponsorship Dana Kegiatan Futsal",
    sender_id: "6289876543210@s.whatsapp.net",
    sender_name: "Ketua Panitia",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    edited_at: null,
    deleted_at: null,
  },
  {
    id: "demo-tx-3",
    group_id: DEMO_GROUP_ID,
    type: "expense" as const,
    amount: 850000,
    note: "Pembayaran Sewa Lapangan & Wasit",
    sender_id: "6281234567890@s.whatsapp.net",
    sender_name: "Seksi Acara",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    edited_at: null,
    deleted_at: null,
  },
  {
    id: "demo-tx-4",
    group_id: DEMO_GROUP_ID,
    type: "expense" as const,
    amount: 320000,
    note: "Konsumsi Rapat Koordinasi & Snack",
    sender_id: "6285551234567@s.whatsapp.net",
    sender_name: "Seksi Konsumsi",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
    edited_at: null,
    deleted_at: null,
  },
  {
    id: "demo-tx-5",
    group_id: DEMO_GROUP_ID,
    type: "income" as const,
    amount: 750000,
    note: "Penjualan Merchandise & Stiker Grup",
    sender_id: "6281234567890@s.whatsapp.net",
    sender_name: "Bendahara Kas",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 96).toISOString(),
    edited_at: null,
    deleted_at: null,
  },
  {
    id: "demo-tx-6",
    group_id: DEMO_GROUP_ID,
    type: "expense" as const,
    amount: 150000,
    note: "Beli ATK, Kertas Kwitansi & Pulpen",
    sender_id: "6281234567890@s.whatsapp.net",
    sender_name: "Sekretaris",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 120).toISOString(),
    edited_at: null,
    deleted_at: null,
  },
];

export const INITIAL_DEMO_PARTICIPANTS = [
  {
    id: "demo-part-1",
    group_id: DEMO_GROUP_ID,
    name: "Raditya Pratama (Ketua)",
    data: { phone: "08123456789", role: "Ketua", status: "Lunas" },
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 240).toISOString(),
    updated_at: null,
    deleted_at: null,
  },
  {
    id: "demo-part-2",
    group_id: DEMO_GROUP_ID,
    name: "Ahmad Fadlan (Bendahara)",
    data: { phone: "08987654321", role: "Bendahara", status: "Lunas" },
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 240).toISOString(),
    updated_at: null,
    deleted_at: null,
  },
  {
    id: "demo-part-3",
    group_id: DEMO_GROUP_ID,
    name: "Siti Rahma (Sekretaris)",
    data: { phone: "08555123456", role: "Sekretaris", status: "Lunas" },
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 200).toISOString(),
    updated_at: null,
    deleted_at: null,
  },
  {
    id: "demo-part-4",
    group_id: DEMO_GROUP_ID,
    name: "Budi Santoso",
    data: { phone: "08777123456", role: "Anggota", status: "Belum Lunas" },
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 180).toISOString(),
    updated_at: null,
    deleted_at: null,
  },
  {
    id: "demo-part-5",
    group_id: DEMO_GROUP_ID,
    name: "Dian Permata",
    data: { phone: "08888123456", role: "Anggota", status: "Lunas" },
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 160).toISOString(),
    updated_at: null,
    deleted_at: null,
  },
];

export const INITIAL_DEMO_TODOS = [
  {
    id: "demo-todo-1",
    group_id: DEMO_GROUP_ID,
    todo_text: "Rekap laporan pengeluaran kas minggu ini",
    is_done: true,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    updated_at: null,
    deleted_at: null,
  },
  {
    id: "demo-todo-2",
    group_id: DEMO_GROUP_ID,
    todo_text: "Kirim tagihan iuran kas ke anggota yang belum bayar",
    is_done: false,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    updated_at: null,
    deleted_at: null,
  },
  {
    id: "demo-todo-3",
    group_id: DEMO_GROUP_ID,
    todo_text: "Booking jadwal lapangan futsal untuk turnamen",
    is_done: false,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    updated_at: null,
    deleted_at: null,
  },
];

export const INITIAL_DEMO_REMINDERS = [
  {
    id: "demo-rem-1",
    group_id: DEMO_GROUP_ID,
    remind_type: "daily",
    remind_value: "20:00",
    remind_text: "Pengingat rekap kas harian oleh bendahara",
    created_by: "Ketua",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 100).toISOString(),
    deleted_at: null,
  },
  {
    id: "demo-rem-2",
    group_id: DEMO_GROUP_ID,
    remind_type: "weekly",
    remind_value: "Jumat 09:00",
    remind_text: "Pengingat setor uang kas mingguan ke rekening grup",
    created_by: "Bendahara",
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 100).toISOString(),
    deleted_at: null,
  },
];

export const INITIAL_DEMO_COMMANDS = [
  {
    id: "demo-cmd-1",
    group_id: DEMO_GROUP_ID,
    keyword: "rekening",
    response: "Nomor Rekening Kas Grup:\nBCA: 1234567890 a.n Bendahara Kas\nDana/GoPay: 08123456789",
    media_path: null,
    media_type: null,
    caption_text: null,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 120).toISOString(),
    updated_at: null,
    deleted_at: null,
  },
  {
    id: "demo-cmd-2",
    group_id: DEMO_GROUP_ID,
    keyword: "jadwal",
    response: "Jadwal Kegiatan Rutin:\nSetiap Sabtu pukul 16.00 WIB di Lapangan Hijau.",
    media_path: null,
    media_type: null,
    caption_text: null,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 100).toISOString(),
    updated_at: null,
    deleted_at: null,
  },
];

export const INITIAL_DEMO_RENTAL = {
  group_id: DEMO_GROUP_ID,
  group_name: DEMO_GROUP_NAME,
  is_active: true,
  start_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
  expire_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 335).toISOString(),
  password: null,
  updated_by: "System",
  updated_at: new Date().toISOString(),
};

export const INITIAL_DEMO_SETTINGS = {
  group_id: DEMO_GROUP_ID,
  header_text: "📊 REKAP KEUANGAN KAS GRUP BOTUANG",
  weather_location: "Jakarta",
  typo_enabled: true,
  updated_at: new Date().toISOString(),
};
