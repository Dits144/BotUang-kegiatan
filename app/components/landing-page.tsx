import {
  ArrowRight,
  Bot,
  CheckCircle2,
  MessageCircle,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { Button } from "./ui/button";
import { DemoButton } from "./demo-button";

const features = [
  "Catat pemasukan dan pengeluaran langsung dari WhatsApp",
  "Dashboard kas grup dengan filter, grafik, dan ekspor data",
  "Reminder, todo, dan custom command untuk aktivitas grup",
];

export function LandingPage() {
  return (
    <main className="min-h-screen bg-[#0B0F19] text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-5 md:px-8">
        <nav className="flex items-center justify-between">
          <a href="/" className="flex items-center gap-3 font-semibold">
            <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-emerald-500 text-slate-950">
              <WalletCards className="h-5 w-5" />
            </span>
            BotUang
          </a>
          <div className="flex items-center gap-2">
            <Button asChildLike="true" variant="ghost" className="hidden text-zinc-300 md:inline-flex">
              <a href="/login">Masuk</a>
            </Button>
            <Button asChildLike="true">
              <a href="/connect">Buka Dashboard</a>
            </Button>
          </div>
        </nav>

        <div className="grid flex-1 items-center gap-10 py-10 md:grid-cols-[1.05fr_0.95fr]">
          <div className="max-w-2xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-[12px] border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-300">
              <MessageCircle className="h-4 w-4 text-emerald-300" />
              Dashboard resmi untuk kas grup WhatsApp
            </div>
            <h1 className="text-4xl font-semibold leading-tight tracking-normal text-white md:text-6xl">
              BotUang Dashboard
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-zinc-300 md:text-lg">
              Kelola kas, iuran, transaksi, tugas, dan pengingat grup dari satu
              dashboard yang rapi, cepat, dan nyaman dipakai di ponsel.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Button asChildLike="true" className="w-full sm:w-auto">
                <a href="/connect">
                  Hubungkan Grup <ArrowRight className="h-4 w-4" />
                </a>
              </Button>
              <Button asChildLike="true" variant="secondary" className="w-full sm:w-auto">
                <a href="/login">Login Admin</a>
              </Button>
              <DemoButton />
            </div>
            <div className="mt-8 grid gap-3">
              {features.map((feature) => (
                <div key={feature} className="flex items-start gap-3 text-sm text-zinc-300">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-300" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4">
            <div className="rounded-xl border border-white/[0.08] bg-[#101827] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-zinc-400">Saldo Kas Saat Ini</p>
                  <p className="mt-2 font-mono text-3xl font-semibold text-white tabular-nums">
                    Rp 12.450.000
                  </p>
                </div>
                <span className="rounded-[12px] bg-emerald-500/12 p-3 text-emerald-300">
                  <ShieldCheck className="h-6 w-6" />
                </span>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.035] p-3">
                  <p className="text-xs text-zinc-500">Pemasukan</p>
                  <p className="mt-1 font-mono text-lg font-semibold text-emerald-300">
                    +Rp 3.200.000
                  </p>
                </div>
                <div className="rounded-xl border border-white/[0.08] bg-white/[0.035] p-3">
                  <p className="text-xs text-zinc-500">Pengeluaran</p>
                  <p className="mt-1 font-mono text-lg font-semibold text-rose-300">
                    -Rp 850.000
                  </p>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {["Iuran Bulanan", "Konsumsi Rapat", "Dana Acara"].map((item, index) => (
                  <div
                    key={item}
                    className="flex min-h-14 items-center justify-between border-t border-white/[0.08] pt-3"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-white/[0.07]">
                        <Bot className="h-4 w-4 text-zinc-300" />
                      </span>
                      <div>
                        <p className="text-sm font-medium">{item}</p>
                        <p className="text-xs text-zinc-500">WhatsApp group</p>
                      </div>
                    </div>
                    <p
                      className={`font-mono text-sm font-semibold tabular-nums ${
                        index === 1 ? "text-rose-300" : "text-emerald-300"
                      }`}
                    >
                      {index === 1 ? "-Rp 185.000" : "+Rp 500.000"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
