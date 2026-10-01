import { BOT_API_TOKEN, BOT_API_URL } from "@/app/lib/constants";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "sync";

  if (!BOT_API_TOKEN) {
    return Response.json(
      { ok: false, message: "BOT_API_TOKEN belum dikonfigurasi" },
      { status: 200 },
    );
  }

  try {
    const response = await fetch(`${BOT_API_URL.replace(/\/$/, "")}/${action}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${BOT_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    return Response.json({ ok: response.ok, ...data }, { status: 200 });
  } catch {
    return Response.json(
      { ok: false, message: "Aksi bot tidak tersedia" },
      { status: 200 },
    );
  }
}
