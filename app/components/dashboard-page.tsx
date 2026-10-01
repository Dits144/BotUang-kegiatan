"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Bot,
  CalendarClock,
  Check,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  Download,
  Home,
  ListTodo,
  Menu,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  Users,
  WalletCards,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { DASHBOARD_SESSION_KEY } from "@/app/lib/constants";
import {
  isDemoSession,
  DEMO_GROUP_NAME,
  INITIAL_DEMO_TRANSACTIONS,
  INITIAL_DEMO_PARTICIPANTS,
  INITIAL_DEMO_TODOS,
  INITIAL_DEMO_REMINDERS,
  INITIAL_DEMO_COMMANDS,
  INITIAL_DEMO_RENTAL,
  INITIAL_DEMO_SETTINGS,
} from "@/app/lib/demo-data";
import { daysLeft, formatDate, formatRupiah } from "@/app/lib/format";
import { supabase } from "@/app/lib/supabase";
import { cn } from "@/app/lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input, Textarea } from "./ui/input";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "./ui/sheet";
import { Skeleton } from "./ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";

type DashboardSection =
  | "overview"
  | "participants"
  | "todos"
  | "reminders"
  | "commands"
  | "settings";

type Transaction = {
  id: string;
  group_id: string;
  type: "income" | "expense";
  amount: number;
  note: string | null;
  sender_id: string | null;
  sender_name: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

type Participant = {
  id: string;
  group_id: string;
  name: string;
  data: Record<string, unknown> | null;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
};

type Todo = {
  id: string;
  group_id: string;
  todo_text: string;
  is_done: boolean;
  created_at: string;
  updated_at: string | null;
  deleted_at: string | null;
};

type Reminder = {
  id: string;
  group_id: string;
  remind_type: string;
  remind_value: string;
  remind_text: string;
  created_by: string | null;
  created_at: string;
  deleted_at: string | null;
};

type Command = {
  id: string;
  group_id: string;
  keyword: string;
  response: string;
  media_path: string | null;
  media_type: string | null;
  caption_text: string | null;
  created_at: string;
  deleted_at: string | null;
};

type Rental = {
  group_id: string;
  is_active: boolean | null;
  start_at: string | null;
  expire_at: string | null;
  password: string | null;
  group_name: string | null;
};

type GroupSettings = {
  group_id: string;
  header_text: string | null;
  weather_location: string | null;
  typo_enabled: boolean | null;
  updated_at: string | null;
};

type BotStatus = {
  ok: boolean;
  status?: string;
  message?: string;
};

const navItems = [
  { key: "overview", label: "Overview", href: "/dashboard", icon: Home },
  { key: "participants", label: "Anggota", href: "/dashboard/participants", icon: Users },
  { key: "todos", label: "Todo", href: "/dashboard/todos", icon: ListTodo },
  { key: "reminders", label: "Reminder", href: "/dashboard/reminders", icon: Bell },
  { key: "commands", label: "Command", href: "/dashboard/commands", icon: Bot },
  { key: "settings", label: "Setting", href: "/dashboard/settings", icon: Settings },
] as const;

export function DashboardPage({ section }: { section: DashboardSection }) {
  const [groupId, setGroupId] = useState("");
  const [groupName, setGroupName] = useState("BotUang Group");
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [commands, setCommands] = useState<Command[]>([]);
  const [rental, setRental] = useState<Rental | null>(null);
  const [settings, setSettings] = useState<GroupSettings | null>(null);
  const [botStatus, setBotStatus] = useState<BotStatus | null>(null);
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [menuOpen, setMenuOpen] = useState(false);
  const [isDemo, setIsDemo] = useState(false);

  async function loadData(targetGroupId = groupId) {
    if (!targetGroupId) return;

    // Demo mode — use static data, no Supabase call
    if (isDemoSession(targetGroupId)) {
      setIsDemo(true);
      setTransactions(INITIAL_DEMO_TRANSACTIONS as typeof transactions);
      setParticipants(INITIAL_DEMO_PARTICIPANTS as typeof participants);
      setTodos(INITIAL_DEMO_TODOS as typeof todos);
      setReminders(INITIAL_DEMO_REMINDERS as typeof reminders);
      setCommands(INITIAL_DEMO_COMMANDS as typeof commands);
      setRental(INITIAL_DEMO_RENTAL as typeof rental);
      setSettings(INITIAL_DEMO_SETTINGS as typeof settings);
      setBotStatus({ ok: true, message: "Demo Mode" });
      setGroupName(DEMO_GROUP_NAME);
      setLoading(false);
      return;
    }

    setIsDemo(false);
    setLoading(true);
    const [
      txResult,
      participantResult,
      todoResult,
      reminderResult,
      commandResult,
      rentalResult,
      settingResult,
      botResult,
    ] = await Promise.all([
      supabase
        .from("transactions")
        .select("*")
        .eq("group_id", targetGroupId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("participants")
        .select("*")
        .eq("group_id", targetGroupId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("todos")
        .select("*")
        .eq("group_id", targetGroupId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("reminders")
        .select("*")
        .eq("group_id", targetGroupId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("custom_commands")
        .select("*")
        .eq("group_id", targetGroupId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("group_rentals")
        .select("*")
        .eq("group_id", targetGroupId)
        .maybeSingle(),
      supabase
        .from("group_settings")
        .select("*")
        .eq("group_id", targetGroupId)
        .maybeSingle(),
      fetch(`/api/bot/status?group_id=${encodeURIComponent(targetGroupId)}`)
        .then((response) => response.json())
        .catch(() => ({ ok: false, message: "Status bot tidak tersedia" })),
    ]);

    if (txResult.error) toast.error(txResult.error.message);
    setTransactions((txResult.data ?? []) as Transaction[]);
    setParticipants((participantResult.data ?? []) as Participant[]);
    setTodos((todoResult.data ?? []) as Todo[]);
    setReminders((reminderResult.data ?? []) as Reminder[]);
    setCommands((commandResult.data ?? []) as Command[]);
    setRental((rentalResult.data as Rental | null) ?? null);
    setSettings((settingResult.data as GroupSettings | null) ?? null);
    setBotStatus(botResult as BotStatus);
    setGroupName(
      (rentalResult.data as Rental | null)?.group_name ?? targetGroupId,
    );
    setLoading(false);
  }

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("botuang.theme") as
      | "dark"
      | "light"
      | null;
    const selected = storedTheme ?? "dark";
    setTheme(selected);
    document.documentElement.dataset.theme = selected;

    const stored = window.localStorage.getItem(DASHBOARD_SESSION_KEY);
    if (!stored) {
      window.location.href = "/connect";
      return;
    }
    const session = JSON.parse(stored) as { groupId?: string; groupName?: string };
    if (!session.groupId) {
      window.location.href = "/connect";
      return;
    }
    setGroupId(session.groupId);
    setGroupName(session.groupName || session.groupId);
    loadData(session.groupId);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("botuang.theme", next);
  }

  const summary = useMemo(() => {
    const income = transactions
      .filter((item) => item.type === "income")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const expense = transactions
      .filter((item) => item.type === "expense")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    return { income, expense, balance: income - expense };
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((item) => {
      const noteMatch = (item.note ?? "")
        .toLowerCase()
        .includes(query.toLowerCase());
      const senderMatch = (item.sender_name ?? "")
        .toLowerCase()
        .includes(query.toLowerCase());
      const time = new Date(item.created_at).getTime();
      const after = fromDate ? time >= new Date(fromDate).getTime() : true;
      const before = toDate
        ? time <= new Date(`${toDate}T23:59:59`).getTime()
        : true;
      return (noteMatch || senderMatch) && after && before;
    });
  }, [fromDate, query, toDate, transactions]);

  const monthlyChart = useMemo(
    () => buildCashflow(transactions, "month"),
    [transactions],
  );
  const weeklyChart = useMemo(
    () => buildCashflow(transactions, "week"),
    [transactions],
  );

  function exportTransactions() {
    const rows = [
      ["Tanggal", "Jenis", "Nominal", "Catatan", "Pengirim"],
      ...filteredTransactions.map((item) => [
        formatDate(item.created_at),
        item.type,
        String(item.amount),
        item.note ?? "",
        item.sender_name ?? "",
      ]),
    ];
    const csv = rows
      .map((row) =>
        row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `botuang-${groupId}-transactions.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Transaksi diekspor ke CSV.");
  }

  const days = daysLeft(rental?.expire_at);

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r border-[var(--line)] bg-[var(--surface)] p-5 md:block">
          <Brand groupName={groupName} botStatus={botStatus} />
          {isDemo && (
            <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2.5">
              <p className="text-xs font-semibold text-amber-400">Mode Demo</p>
              <p className="mt-0.5 text-[11px] leading-snug text-amber-400/80">
                Data ini hanya contoh. Hubungkan grup WhatsApp untuk menggunakan data nyata.
              </p>
              <a
                href="/"
                className="mt-2 block text-[11px] font-semibold text-amber-400 underline underline-offset-2"
              >
                ← Keluar Demo
              </a>
            </div>
          )}
          <nav className="mt-8 grid gap-1">
            {navItems.map((item) => (
              <NavLink key={item.key} item={item} active={section === item.key} />
            ))}
          </nav>
        </aside>

        <div className="min-w-0 flex-1 pb-24 md:pb-0">
          {isDemo && (
            <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs font-medium text-amber-400 md:px-8">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
              Mode Demo Aktif — data di bawah adalah contoh ilustrasi, bukan data nyata.
              <a href="/" className="ml-auto font-semibold underline underline-offset-2">
                Keluar Demo
              </a>
            </div>
          )}
          <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--background)]/92 px-4 py-3 backdrop-blur md:px-8 md:py-5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-500">
                  {groupName}
                </p>
                <h1 className="truncate text-xl font-semibold md:text-2xl">
                  {navItems.find((item) => item.key === section)?.label}
                </h1>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleTheme}
                  aria-label="Ganti tema"
                >
                  {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                </Button>
                {!isDemo && <TransactionSheet groupId={groupId} onSaved={() => loadData()} />}
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  onClick={() => setMenuOpen(true)}
                  aria-label="Buka menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </header>


          <AnimatePresence mode="wait">
            <motion.div
              key={section}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="mx-auto max-w-7xl px-4 py-5 md:px-8 md:py-8"
            >
              {section === "overview" ? (
                <Overview
                  loading={loading}
                  summary={summary}
                  monthlyChart={monthlyChart}
                  weeklyChart={weeklyChart}
                  transactions={filteredTransactions}
                  query={query}
                  setQuery={setQuery}
                  fromDate={fromDate}
                  setFromDate={setFromDate}
                  toDate={toDate}
                  setToDate={setToDate}
                  onExport={exportTransactions}
                />
              ) : null}
              {section === "participants" ? (
                <ParticipantsPage
                  loading={loading}
                  groupId={groupId}
                  participants={participants}
                  onChanged={() => loadData()}
                />
              ) : null}
              {section === "todos" ? (
                <TodosPage
                  loading={loading}
                  groupId={groupId}
                  todos={todos}
                  onChanged={() => loadData()}
                />
              ) : null}
              {section === "reminders" ? (
                <RemindersPage
                  loading={loading}
                  groupId={groupId}
                  reminders={reminders}
                  onChanged={() => loadData()}
                />
              ) : null}
              {section === "commands" ? (
                <CommandsPage
                  loading={loading}
                  groupId={groupId}
                  commands={commands}
                  onChanged={() => loadData()}
                />
              ) : null}
              {section === "settings" ? (
                <SettingsPage
                  loading={loading}
                  groupId={groupId}
                  rental={rental}
                  settings={settings}
                  days={days}
                  onChanged={() => loadData()}
                />
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <MobileNav section={section} />
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent>
          <SheetTitle>Menu BotUang</SheetTitle>
          <div className="mt-5 grid gap-2">
            {navItems.map((item) => (
              <NavLink key={item.key} item={item} active={section === item.key} />
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </main>
  );
}

function Brand({
  groupName,
  botStatus,
}: {
  groupName: string;
  botStatus: BotStatus | null;
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-emerald-500 text-slate-950">
          <WalletCards className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold">BotUang</p>
          <p className="truncate text-sm text-[var(--muted)]">{groupName}</p>
        </div>
      </div>
      <div className="mt-5 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3">
        <p className="text-xs text-[var(--muted)]">Status Bot</p>
        <p className="mt-1 flex items-center gap-2 text-sm font-semibold">
          <span
            className={cn(
              "h-2.5 w-2.5 rounded-full",
              botStatus?.ok ? "bg-emerald-400" : "bg-amber-400",
            )}
          />
          {botStatus?.ok ? "Terhubung" : "Menunggu status"}
        </p>
      </div>
    </div>
  );
}

function NavLink({
  item,
  active,
}: {
  item: (typeof navItems)[number];
  active: boolean;
}) {
  const Icon = item.icon;
  return (
    <a
      href={item.href}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-[12px] px-3 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-400",
        active
          ? "bg-emerald-500 text-slate-950"
          : "text-[var(--muted)] hover:bg-[var(--panel)] hover:text-[var(--foreground)]",
      )}
    >
      <Icon className="h-4 w-4" />
      {item.label}
    </a>
  );
}

function MobileNav({ section }: { section: DashboardSection }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[var(--background)]/95 px-2 py-2 backdrop-blur md:hidden">
      <div className="grid grid-cols-6 gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = section === item.key;
          return (
            <a
              key={item.key}
              href={item.href}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 rounded-[12px] text-[11px] font-semibold transition",
                active
                  ? "bg-emerald-500 text-slate-950"
                  : "text-[var(--muted)] active:bg-[var(--panel)]",
              )}
              aria-label={item.label}
            >
              <Icon className="h-4 w-4" />
              <span className="max-w-full truncate">{item.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}

function Overview({
  loading,
  summary,
  monthlyChart,
  weeklyChart,
  transactions,
  query,
  setQuery,
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  onExport,
}: {
  loading: boolean;
  summary: { income: number; expense: number; balance: number };
  monthlyChart: ChartPoint[];
  weeklyChart: ChartPoint[];
  transactions: Transaction[];
  query: string;
  setQuery: (value: string) => void;
  fromDate: string;
  setFromDate: (value: string) => void;
  toDate: string;
  setToDate: (value: string) => void;
  onExport: () => void;
}) {
  return (
    <div className="space-y-5">
      <section className="grid gap-3 md:grid-cols-3">
        <MetricCard
          loading={loading}
          label="Saldo Kas Saat Ini"
          value={summary.balance}
          icon={WalletCards}
          tone="neutral"
          primary
        />
        <MetricCard
          loading={loading}
          label="Total Pemasukan"
          value={summary.income}
          icon={CircleDollarSign}
          tone="income"
        />
        <MetricCard
          loading={loading}
          label="Total Pengeluaran"
          value={summary.expense}
          icon={ChevronDown}
          tone="expense"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Cash Flow Bulanan</h2>
              <p className="text-sm text-[var(--muted)]">Pemasukan dan pengeluaran per bulan.</p>
            </div>
          </div>
          {loading ? (
            <Skeleton className="h-72" />
          ) : monthlyChart.length ? (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyChart}>
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="label" stroke="var(--muted)" fontSize={12} />
                  <YAxis stroke="var(--muted)" fontSize={12} tickFormatter={(value) => `${Number(value) / 1000}k`} />
                  <Tooltip content={<ChartTooltip />} />
                  <Area type="monotone" dataKey="income" stroke="#10B981" fill="#10B981" fillOpacity={0.18} />
                  <Area type="monotone" dataKey="expense" stroke="#F43F5E" fill="#F43F5E" fillOpacity={0.12} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="Belum ada cash flow" description="Transaksi yang masuk dari WhatsApp akan muncul di grafik ini." />
          )}
        </Card>

        <Card className="p-4">
          <h2 className="font-semibold">Breakdown Mingguan</h2>
          <p className="text-sm text-[var(--muted)]">Ringkasan 8 minggu terakhir.</p>
          {loading ? (
            <Skeleton className="mt-4 h-72" />
          ) : weeklyChart.length ? (
            <div className="mt-4 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyChart}>
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                  <XAxis dataKey="label" stroke="var(--muted)" fontSize={12} />
                  <YAxis stroke="var(--muted)" fontSize={12} tickFormatter={(value) => `${Number(value) / 1000}k`} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="income" fill="#10B981" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="expense" fill="#F43F5E" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="Data mingguan kosong" description="Tambahkan transaksi untuk melihat pola mingguan." />
          )}
        </Card>
      </section>

      <Card className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="font-semibold">Recent Transactions</h2>
            <p className="text-sm text-[var(--muted)]">Cari, filter tanggal, lalu ekspor data kas.</p>
          </div>
          <Button variant="outline" onClick={onExport} disabled={!transactions.length}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_170px_170px]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-[var(--muted)]" />
            <Input
              className="pl-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari catatan atau pengirim"
            />
          </label>
          <Input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          <Input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
        </div>
        <TransactionsView loading={loading} transactions={transactions} />
      </Card>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  tone,
  primary,
  loading,
}: {
  label: string;
  value: number;
  icon: typeof WalletCards;
  tone: "neutral" | "income" | "expense";
  primary?: boolean;
  loading: boolean;
}) {
  const color =
    tone === "income"
      ? "text-emerald-500"
      : tone === "expense"
        ? "text-rose-500"
        : "text-[var(--foreground)]";
  return (
    <Card className={cn("p-4", primary ? "md:p-5" : "")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-[var(--muted)]">{label}</p>
          {loading ? (
            <Skeleton className="mt-3 h-8 w-44" />
          ) : (
            <p
              className={cn(
                "mt-2 font-mono font-semibold tabular-nums",
                primary ? "text-3xl" : "text-2xl",
                color,
              )}
            >
              {formatRupiah(value)}
            </p>
          )}
        </div>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[var(--panel)] text-[var(--muted)]">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </Card>
  );
}

function TransactionsView({
  loading,
  transactions,
}: {
  loading: boolean;
  transactions: Transaction[];
}) {
  if (loading) {
    return (
      <div className="mt-5 space-y-3">
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    );
  }

  if (!transactions.length) {
    return (
      <EmptyState
        title="Belum ada transaksi"
        description="Transaksi asli dari grup WhatsApp akan tampil di sini."
      />
    );
  }

  return (
    <>
      <div className="mt-5 hidden overflow-hidden rounded-2xl border border-[var(--line)] md:block">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--panel)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Tanggal</th>
              <th className="px-4 py-3">Catatan</th>
              <th className="px-4 py-3">Pengirim</th>
              <th className="px-4 py-3">Jenis</th>
              <th className="px-4 py-3 text-right">Nominal</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((item) => (
              <tr key={item.id} className="border-t border-[var(--line)]">
                <td className="px-4 py-3 text-[var(--muted)]">{formatDate(item.created_at)}</td>
                <td className="px-4 py-3 font-medium">{item.note || "-"}</td>
                <td className="px-4 py-3 text-[var(--muted)]">{item.sender_name || "-"}</td>
                <td className="px-4 py-3">
                  <Badge tone={item.type === "income" ? "income" : "expense"}>
                    {item.type === "income" ? "Pemasukan" : "Pengeluaran"}
                  </Badge>
                </td>
                <td
                  className={cn(
                    "px-4 py-3 text-right font-mono font-semibold tabular-nums",
                    item.type === "income" ? "text-emerald-500" : "text-rose-500",
                  )}
                >
                  {item.type === "income" ? "+" : "-"}
                  {formatRupiah(item.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 grid gap-2 md:hidden">
        {transactions.map((item) => (
          <button
            key={item.id}
            className="min-h-16 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3 text-left active:scale-[0.99]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{item.note || "Transaksi"}</p>
                <p className="mt-1 truncate text-xs text-[var(--muted)]">
                  {formatDate(item.created_at)} - {item.sender_name || "WhatsApp"}
                </p>
              </div>
              <p
                className={cn(
                  "shrink-0 font-mono text-sm font-semibold tabular-nums",
                  item.type === "income" ? "text-emerald-500" : "text-rose-500",
                )}
              >
                {item.type === "income" ? "+" : "-"}
                {formatRupiah(item.amount)}
              </p>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3 text-sm shadow-xl">
      <p className="mb-2 font-semibold">{label}</p>
      {payload.map((item) => (
        <p key={item.dataKey} className="font-mono tabular-nums">
          {item.dataKey === "income" ? "Pemasukan" : "Pengeluaran"}:{" "}
          {formatRupiah(item.value)}
        </p>
      ))}
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mt-5 rounded-2xl border border-dashed border-[var(--line)] bg-[var(--panel)] p-6 text-center">
      <p className="font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm text-[var(--muted)]">{description}</p>
    </div>
  );
}

type ChartPoint = { label: string; income: number; expense: number };

function buildCashflow(transactions: Transaction[], range: "month" | "week") {
  const map = new Map<string, ChartPoint>();
  transactions.forEach((item) => {
    const date = new Date(item.created_at);
    const label =
      range === "month"
        ? new Intl.DateTimeFormat("id-ID", { month: "short", year: "2-digit" }).format(date)
        : `M${getWeek(date)}`;
    const row = map.get(label) ?? { label, income: 0, expense: 0 };
    row[item.type] += Number(item.amount || 0);
    map.set(label, row);
  });
  return Array.from(map.values()).reverse().slice(-8);
}

function getWeek(date: Date) {
  const first = new Date(date.getFullYear(), 0, 1);
  return Math.ceil(((date.getTime() - first.getTime()) / 86_400_000 + first.getDay() + 1) / 7);
}

function TransactionSheet({
  groupId,
  onSaved,
}: {
  groupId: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"income" | "expense">("income");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!groupId || Number(amount) <= 0) return;
    setSaving(true);
    const { error } = await supabase.from("transactions").insert({
      group_id: groupId,
      type,
      amount: Number(amount),
      note,
      sender_name: "Dashboard",
      created_at: new Date(`${date}T12:00:00`).toISOString(),
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Transaksi disimpan.");
    setAmount("");
    setNote("");
    setOpen(false);
    onSaved();
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Catat Transaksi</span>
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetTitle>Catat Transaksi</SheetTitle>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <Tabs value={type} onValueChange={(value) => setType(value as typeof type)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="income">Pemasukan</TabsTrigger>
              <TabsTrigger value="expense">Pengeluaran</TabsTrigger>
            </TabsList>
          </Tabs>
          <label className="block text-sm font-medium">
            Nominal
            <Input
              className="mt-2 font-mono tabular-nums"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="numeric"
              type="number"
              min="0"
              placeholder="Rp"
              required
            />
          </label>
          <label className="block text-sm font-medium">
            Catatan
            <Textarea
              className="mt-2"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Contoh: Iuran bulanan"
              required
            />
          </label>
          <label className="block text-sm font-medium">
            Tanggal
            <Input
              className="mt-2"
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <Button className="w-full" disabled={saving}>
            {saving ? "Menyimpan..." : "Simpan Transaksi"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function ParticipantsPage({
  loading,
  groupId,
  participants,
  onChanged,
}: {
  loading: boolean;
  groupId: string;
  participants: Participant[];
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [dues, setDues] = useState("");

  async function add(event: FormEvent) {
    event.preventDefault();
    const { error } = await supabase.from("participants").insert({
      group_id: groupId,
      name,
      data: { dues_amount: Number(dues || 0), status: "unpaid" },
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Anggota ditambahkan.");
      setName("");
      setDues("");
      onChanged();
    }
  }

  async function mark(participant: Participant, status: "paid" | "unpaid") {
    const { error } = await supabase
      .from("participants")
      .update({
        data: { ...(participant.data ?? {}), status },
        updated_at: new Date().toISOString(),
      })
      .eq("id", participant.id);
    if (error) toast.error(error.message);
    else onChanged();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <Card className="p-4">
        <h2 className="font-semibold">Tambah Anggota</h2>
        <form onSubmit={add} className="mt-4 space-y-3">
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nama anggota" required />
          <Input value={dues} onChange={(event) => setDues(event.target.value)} type="number" inputMode="numeric" placeholder="Nominal iuran" />
          <Button className="w-full">Tambah</Button>
        </form>
      </Card>
      <Card className="p-4">
        <h2 className="font-semibold">Kas Anggota</h2>
        {loading ? (
          <div className="mt-4 space-y-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : participants.length ? (
          <div className="mt-4 grid gap-3">
            {participants.map((participant) => {
              const status = participant.data?.status === "paid" ? "paid" : "unpaid";
              const due = Number(participant.data?.dues_amount ?? 0);
              return (
                <div key={participant.id} className="flex flex-col gap-3 rounded-2xl border border-[var(--line)] p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">{participant.name}</p>
                    <p className="font-mono text-sm text-[var(--muted)] tabular-nums">
                      Iuran: {formatRupiah(due)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={status === "paid" ? "income" : "warning"}>
                      {status === "paid" ? "Lunas" : "Belum bayar"}
                    </Badge>
                    <Button variant="outline" size="sm" onClick={() => mark(participant, status === "paid" ? "unpaid" : "paid")}>
                      {status === "paid" ? "Tandai belum" : "Tandai lunas"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState title="Anggota belum ada" description="Tambahkan anggota grup untuk memantau iuran." />
        )}
      </Card>
    </div>
  );
}

function TodosPage({
  loading,
  groupId,
  todos,
  onChanged,
}: {
  loading: boolean;
  groupId: string;
  todos: Todo[];
  onChanged: () => void;
}) {
  const [text, setText] = useState("");
  const [priority, setPriority] = useState("normal");

  async function add(event: FormEvent) {
    event.preventDefault();
    const todo_text = priority === "normal" ? text : `[${priority}] ${text}`;
    const { error } = await supabase.from("todos").insert({ group_id: groupId, todo_text });
    if (error) toast.error(error.message);
    else {
      setText("");
      toast.success("Todo ditambahkan.");
      onChanged();
    }
  }

  async function toggle(todo: Todo) {
    const { error } = await supabase
      .from("todos")
      .update({ is_done: !todo.is_done, updated_at: new Date().toISOString() })
      .eq("id", todo.id);
    if (error) toast.error(error.message);
    else onChanged();
  }

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="font-semibold">To-Do List</h2>
          <p className="text-sm text-[var(--muted)]">Tugas grup yang tersinkron dengan tabel todos.</p>
        </div>
        <form onSubmit={add} className="grid gap-2 sm:grid-cols-[1fr_130px_auto]">
          <Input value={text} onChange={(event) => setText(event.target.value)} placeholder="Tugas baru" required />
          <select value={priority} onChange={(event) => setPriority(event.target.value)} className="min-h-11 rounded-[11px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm">
            <option value="normal">Normal</option>
            <option value="tinggi">Tinggi</option>
            <option value="rendah">Rendah</option>
          </select>
          <Button>Tambah</Button>
        </form>
      </div>
      {loading ? (
        <Skeleton className="mt-5 h-32" />
      ) : todos.length ? (
        <div className="mt-5 grid gap-2">
          {todos.map((todo) => {
            const parsed = parseTodo(todo.todo_text);
            return (
              <button
                key={todo.id}
                onClick={() => toggle(todo)}
                className="flex min-h-14 items-center gap-3 rounded-2xl border border-[var(--line)] p-3 text-left transition hover:bg-[var(--panel)]"
              >
                <span className={cn("flex h-7 w-7 items-center justify-center rounded-[9px] border", todo.is_done ? "border-emerald-400 bg-emerald-500 text-slate-950" : "border-[var(--line)]")}>
                  {todo.is_done ? <Check className="h-4 w-4" /> : null}
                </span>
                <span className={cn("flex-1 font-medium", todo.is_done ? "text-[var(--muted)] line-through" : "")}>{parsed.text}</span>
                <Badge tone={parsed.priority === "tinggi" ? "warning" : "muted"}>{parsed.priority}</Badge>
              </button>
            );
          })}
        </div>
      ) : (
        <EmptyState title="Todo kosong" description="Tambahkan tugas grup tanpa membuat data palsu." />
      )}
    </Card>
  );
}

function parseTodo(value: string) {
  const match = value.match(/^\[(.+?)\]\s(.+)$/);
  return { priority: match?.[1] ?? "normal", text: match?.[2] ?? value };
}

function RemindersPage({
  loading,
  groupId,
  reminders,
  onChanged,
}: {
  loading: boolean;
  groupId: string;
  reminders: Reminder[];
  onChanged: () => void;
}) {
  const [type, setType] = useState("daily");
  const [value, setValue] = useState("");
  const [text, setText] = useState("");

  async function add(event: FormEvent) {
    event.preventDefault();
    const { error } = await supabase.from("reminders").insert({
      group_id: groupId,
      remind_type: type,
      remind_value: value,
      remind_text: text,
      created_by: "Dashboard",
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Reminder disimpan.");
      setText("");
      setValue("");
      onChanged();
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <Card className="p-4">
        <h2 className="font-semibold">Reminder Baru</h2>
        <form onSubmit={add} className="mt-4 space-y-3">
          <select value={type} onChange={(event) => setType(event.target.value)} className="min-h-11 w-full rounded-[11px] border border-[var(--line)] bg-[var(--surface)] px-3 text-sm">
            <option value="daily">Harian</option>
            <option value="weekly">Mingguan</option>
            <option value="date">Tanggal khusus</option>
          </select>
          <Input value={value} onChange={(event) => setValue(event.target.value)} placeholder="Jam, hari, atau tanggal" required />
          <Textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Isi reminder" required />
          <Button className="w-full">Simpan Reminder</Button>
        </form>
      </Card>
      <Card className="p-4">
        <h2 className="font-semibold">Jadwal Aktif</h2>
        {loading ? (
          <Skeleton className="mt-4 h-32" />
        ) : reminders.length ? (
          <div className="mt-4 grid gap-3">
            {reminders.map((reminder) => (
              <div key={reminder.id} className="rounded-2xl border border-[var(--line)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{reminder.remind_text}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      {reminder.remind_type} - {reminder.remind_value}
                    </p>
                  </div>
                  <CalendarClock className="h-5 w-5 text-emerald-500" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Belum ada reminder" description="Reminder otomatis grup akan tampil di sini." />
        )}
      </Card>
    </div>
  );
}

function CommandsPage({
  loading,
  groupId,
  commands,
  onChanged,
}: {
  loading: boolean;
  groupId: string;
  commands: Command[];
  onChanged: () => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [response, setResponse] = useState("");

  async function add(event: FormEvent) {
    event.preventDefault();
    const { error } = await supabase.from("custom_commands").insert({
      group_id: groupId,
      keyword,
      response,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Command disimpan.");
      setKeyword("");
      setResponse("");
      onChanged();
    }
  }

  async function remove(command: Command) {
    const { error } = await supabase
      .from("custom_commands")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", command.id);
    if (error) toast.error(error.message);
    else onChanged();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <Card className="p-4">
        <h2 className="font-semibold">Custom Command</h2>
        <form onSubmit={add} className="mt-4 space-y-3">
          <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Keyword, contoh: /kas" required />
          <Textarea value={response} onChange={(event) => setResponse(event.target.value)} placeholder="Respon otomatis" required />
          <Button className="w-full">Simpan Command</Button>
        </form>
      </Card>
      <Card className="p-4">
        <h2 className="font-semibold">Trigger WhatsApp</h2>
        {loading ? (
          <Skeleton className="mt-4 h-32" />
        ) : commands.length ? (
          <div className="mt-4 grid gap-3">
            {commands.map((command) => (
              <div key={command.id} className="rounded-2xl border border-[var(--line)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono font-semibold text-emerald-500">{command.keyword}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-[var(--muted)]">{command.response}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => remove(command)}>Hapus</Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Command kosong" description="Buat trigger respon otomatis untuk grup WhatsApp." />
        )}
      </Card>
    </div>
  );
}

function SettingsPage({
  loading,
  groupId,
  rental,
  settings,
  days,
  onChanged,
}: {
  loading: boolean;
  groupId: string;
  rental: Rental | null;
  settings: GroupSettings | null;
  days: number | null;
  onChanged: () => void;
}) {
  const [header, setHeader] = useState("");
  const [location, setLocation] = useState("");
  const [typoEnabled, setTypoEnabled] = useState(true);
  const [newPin, setNewPin] = useState("");
  const [months, setMonths] = useState("1");
  const [proof, setProof] = useState<File | null>(null);

  useEffect(() => {
    setHeader(settings?.header_text ?? "");
    setLocation(settings?.weather_location ?? "");
    setTypoEnabled(settings?.typo_enabled ?? true);
  }, [settings]);

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    const payload = {
      group_id: groupId,
      header_text: header,
      weather_location: location,
      typo_enabled: typoEnabled,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("group_settings").upsert(payload);
    if (error) toast.error(error.message);
    else {
      toast.success("Setting grup disimpan.");
      onChanged();
    }
  }

  async function changePin(event: FormEvent) {
    event.preventDefault();
    if (newPin.length < 4) {
      toast.error("PIN minimal 4 digit.");
      return;
    }
    const { error } = await supabase
      .from("group_rentals")
      .update({ password: newPin, updated_at: new Date().toISOString() })
      .eq("group_id", groupId);
    if (error) toast.error(error.message);
    else {
      toast.success("PIN dashboard diperbarui.");
      setNewPin("");
      onChanged();
    }
  }

  async function requestExtension(event: FormEvent) {
    event.preventDefault();
    let proofPath = "";
    if (proof) {
      const path = `${groupId}/${Date.now()}-${proof.name}`;
      const upload = await supabase.storage.from("rental-proofs").upload(path, proof);
      if (upload.error) {
        toast.error(upload.error.message);
        return;
      }
      proofPath = upload.data.path;
    }
    const { error } = await supabase.from("rental_requests").insert({
      group_id: groupId,
      months: Number(months),
      status: "pending",
      proof_image: proofPath,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Permintaan perpanjangan dikirim.");
      setProof(null);
      onChanged();
    }
  }

  if (loading) return <Skeleton className="h-96" />;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Rental Status</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{rental?.group_name ?? groupId}</p>
          </div>
          <Badge tone={rental?.is_active ? "income" : "warning"}>
            {rental?.is_active ? "Aktif" : "Tidak aktif"}
          </Badge>
        </div>
        <div className="mt-5 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <p className="text-sm text-[var(--muted)]">Sisa masa aktif</p>
          <p className="mt-2 text-3xl font-semibold">
            {days === null ? "-" : days > 0 ? `${days} hari` : "Kedaluwarsa"}
          </p>
          <p className="mt-2 text-sm text-[var(--muted)]">Berakhir: {formatDate(rental?.expire_at)}</p>
        </div>

        <form onSubmit={requestExtension} className="mt-5 space-y-3">
          <h3 className="font-semibold">Request Perpanjangan</h3>
          <Input value={months} onChange={(event) => setMonths(event.target.value)} type="number" min="1" placeholder="Jumlah bulan" />
          <Input type="file" accept="image/*" onChange={(event) => setProof(event.target.files?.[0] ?? null)} />
          <Button className="w-full">Kirim Request</Button>
        </form>
      </Card>

      <div className="space-y-5">
        <Card className="p-4">
          <h2 className="font-semibold">Group Settings</h2>
          <form onSubmit={saveSettings} className="mt-4 space-y-3">
            <Textarea value={header} onChange={(event) => setHeader(event.target.value)} placeholder="Header teks laporan grup" />
            <Input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Lokasi cuaca, contoh: Jakarta" />
            <label className="flex min-h-11 items-center justify-between rounded-2xl border border-[var(--line)] px-3 text-sm font-medium">
              Typo correction
              <input type="checkbox" checked={typoEnabled} onChange={(event) => setTypoEnabled(event.target.checked)} className="h-5 w-5 accent-emerald-500" />
            </label>
            <Button className="w-full">Simpan Setting</Button>
          </form>
        </Card>

        <Card className="p-4">
          <h2 className="font-semibold">Change PIN</h2>
          <form onSubmit={changePin} className="mt-4 space-y-3">
            <Input value={newPin} onChange={(event) => setNewPin(event.target.value)} inputMode="numeric" type="password" placeholder="PIN baru" />
            <Button className="w-full" variant="secondary">Update PIN</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
