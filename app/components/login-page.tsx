"use client";

import { FormEvent, useState } from "react";
import { Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { DASHBOARD_SESSION_KEY } from "@/app/lib/constants";
import { supabase } from "@/app/lib/supabase";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Input } from "./ui/input";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";

export function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [groupId, setGroupId] = useState("");
  const [loading, setLoading] = useState(false);

  async function routeToDashboard(userGroupId?: string) {
    const stored = window.localStorage.getItem(DASHBOARD_SESSION_KEY);
    const localGroup = stored ? JSON.parse(stored).groupId : "";
    const targetGroup = userGroupId || groupId || localGroup;

    if (targetGroup) {
      window.localStorage.setItem(
        DASHBOARD_SESSION_KEY,
        JSON.stringify({ groupId: targetGroup, connectedAt: new Date().toISOString() }),
      );
      window.location.href = "/dashboard";
      return;
    }

    const { data } = await supabase
      .from("group_rentals")
      .select("group_id, group_name")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (data?.group_id) {
      window.localStorage.setItem(
        DASHBOARD_SESSION_KEY,
        JSON.stringify({
          groupId: data.group_id,
          groupName: data.group_name,
          connectedAt: new Date().toISOString(),
        }),
      );
      window.location.href = "/dashboard";
      return;
    }

    toast.message("Login berhasil. Hubungkan grup dari WhatsApp untuk membuka dashboard.");
    window.location.href = "/connect";
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    const auth =
      mode === "login"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { data: { group_id: groupId || undefined } },
          });

    if (auth.error) {
      setLoading(false);
      toast.error(auth.error.message);
      return;
    }

    const userGroupId = auth.data.user?.user_metadata?.group_id as string | undefined;
    toast.success(mode === "login" ? "Login berhasil." : "Akun admin dibuat.");
    await routeToDashboard(userGroupId);
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#0B0F19] px-5 py-8 text-white">
      <Card className="w-full max-w-md border-white/[0.08] bg-white/[0.035] p-5">
        <div className="mb-6 flex items-start gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-emerald-500 text-slate-950">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-medium text-emerald-300">Admin Access</p>
            <h1 className="mt-1 text-2xl font-semibold">Login BotUang</h1>
          </div>
        </div>

        <Tabs value={mode} onValueChange={(value) => setMode(value as typeof mode)}>
          <TabsList className="mb-5 grid w-full grid-cols-2">
            <TabsTrigger value="login">Login</TabsTrigger>
            <TabsTrigger value="register">Register</TabsTrigger>
          </TabsList>
        </Tabs>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm font-medium">
            Email
            <Input
              className="mt-2"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="admin@botuang.id"
              required
            />
          </label>
          <label className="block text-sm font-medium">
            Password
            <Input
              className="mt-2"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={6}
              required
            />
          </label>
          <label className="block text-sm font-medium">
            Group ID
            <Input
              className="mt-2"
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
              placeholder="Opsional bila sudah connect"
            />
          </label>
          <Button className="w-full" disabled={loading}>
            <Mail className="h-4 w-4" />
            {loading ? "Memproses..." : mode === "login" ? "Masuk" : "Buat Akun"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
