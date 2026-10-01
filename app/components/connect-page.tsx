"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { LockKeyhole, MessageCircle, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { DASHBOARD_SESSION_KEY } from "@/app/lib/constants";
import { supabase } from "@/app/lib/supabase";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Skeleton } from "./ui/skeleton";

type RentalRow = {
  group_id: string;
  group_name: string | null;
  password: string | null;
  is_active: boolean | null;
  expire_at: string | null;
};

export function ConnectPage() {
  const [groupId, setGroupId] = useState("");
  const [token, setToken] = useState("");
  const [rental, setRental] = useState<RentalRow | null>(null);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const hasPin = Boolean(rental?.password);
  const title = useMemo(() => {
    if (!rental) return "Hubungkan grup";
    return hasPin ? "Masukkan PIN grup" : "Buat PIN dashboard";
  }, [hasPin, rental]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryGroup = params.get("group_id") ?? "";
    const queryToken = params.get("token") ?? "";
    setGroupId(queryGroup);
    setToken(queryToken);

    async function load() {
      if (!queryGroup || !queryToken) {
        setError("Link dashboard belum lengkap. Ketik dashboard di WhatsApp grup untuk membuat link baru.");
        setLoading(false);
        return;
      }

      const { data: tokenRow, error: tokenError } = await supabase
        .from("dashboard_tokens")
        .select("token, group_id, expires_at")
        .eq("token", queryToken)
        .eq("group_id", queryGroup)
        .maybeSingle();

      if (tokenError || !tokenRow) {
        setError("Token dashboard tidak valid atau sudah tidak ditemukan.");
        setLoading(false);
        return;
      }

      if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
        setError("Token dashboard sudah kedaluwarsa. Buat link baru dari WhatsApp.");
        setLoading(false);
        return;
      }

      const { data, error: rentalError } = await supabase
        .from("group_rentals")
        .select("group_id, group_name, password, is_active, expire_at")
        .eq("group_id", queryGroup)
        .maybeSingle();

      if (rentalError || !data) {
        setError("Data grup belum terdaftar di BotUang.");
        setLoading(false);
        return;
      }

      setRental(data as RentalRow);
      setLoading(false);
    }

    load();
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!rental) return;
    if (pin.length < 4) {
      toast.error("PIN minimal 4 digit.");
      return;
    }

    setSaving(true);
    if (hasPin) {
      if (pin !== rental.password) {
        setSaving(false);
        toast.error("PIN tidak sesuai.");
        return;
      }
    } else {
      if (pin !== confirmPin) {
        setSaving(false);
        toast.error("Konfirmasi PIN tidak sama.");
        return;
      }
      const { error: updateError } = await supabase
        .from("group_rentals")
        .update({ password: pin, updated_at: new Date().toISOString() })
        .eq("group_id", groupId);
      if (updateError) {
        setSaving(false);
        toast.error(updateError.message);
        return;
      }
    }

    await supabase
      .from("dashboard_tokens")
      .update({ pin_verified: true })
      .eq("token", token)
      .eq("group_id", groupId);

    window.localStorage.setItem(
      DASHBOARD_SESSION_KEY,
      JSON.stringify({
        groupId,
        token,
        groupName: rental.group_name,
        connectedAt: new Date().toISOString(),
      }),
    );
    toast.success("Dashboard terhubung.");
    window.location.href = "/dashboard";
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#0B0F19] px-5 py-8 text-white">
      <Card className="w-full max-w-md border-white/[0.08] bg-white/[0.035] p-5">
        <div className="mb-6 flex items-start gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-emerald-500 text-slate-950">
            <MessageCircle className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-medium text-emerald-300">BotUang Connect</p>
            <h1 className="mt-1 text-2xl font-semibold">{title}</h1>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-20" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-4 text-sm text-rose-100">
            {error}
            <Button asChildLike="true" className="mt-4 w-full">
              <a href="/">Kembali ke Beranda</a>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4">
              <p className="text-sm text-zinc-400">Grup</p>
              <p className="mt-1 font-semibold">{rental?.group_name ?? groupId}</p>
              <p className="mt-2 flex items-center gap-2 text-sm text-zinc-400">
                <ShieldCheck className="h-4 w-4 text-emerald-300" />
                Token WhatsApp tervalidasi
              </p>
            </div>
            <label className="block text-sm font-medium">
              PIN Dashboard
              <Input
                className="mt-2"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                inputMode="numeric"
                type="password"
                autoComplete="one-time-code"
                placeholder="Minimal 4 digit"
              />
            </label>
            {!hasPin ? (
              <label className="block text-sm font-medium">
                Konfirmasi PIN
                <Input
                  className="mt-2"
                  value={confirmPin}
                  onChange={(event) => setConfirmPin(event.target.value)}
                  inputMode="numeric"
                  type="password"
                  placeholder="Ulangi PIN"
                />
              </label>
            ) : null}
            <Button className="w-full" disabled={saving}>
              <LockKeyhole className="h-4 w-4" />
              {saving ? "Memproses..." : hasPin ? "Masuk Dashboard" : "Simpan PIN"}
            </Button>
          </form>
        )}
      </Card>
    </main>
  );
}
