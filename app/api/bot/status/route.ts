import { BOT_API_TOKEN, BOT_API_URL } from "@/app/lib/constants";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const groupId = url.searchParams.get("group_id") ?? "";

  if (!BOT_API_TOKEN) {
    return Response.json(
      { ok: false, message: "BOT_API_TOKEN belum dikonfigurasi" },
      { status: 200 },
    );
  }

  try {
    const base = BOT_API_URL.replace(/\/$/, "");
    const paths = ["/status", "/api/status", "/health", "/api/health", "/"];

    for (const path of paths) {
      const response = await fetch(
        `${base}${path}${path === "/" ? "" : `?group_id=${encodeURIComponent(groupId)}`}`,
        {
          headers: {
            Authorization: `Bearer ${BOT_API_TOKEN}`,
          },
        },
      );
      const data = await response.json().catch(() => ({}));
      const endpointMissing =
        response.status === 404 ||
        String((data as { error?: string }).error ?? "")
          .toLowerCase()
          .includes("not found");

      if (!endpointMissing) {
        return Response.json(
          { ok: response.ok, source: path, ...data },
          { status: 200 },
        );
      }
    }

    return Response.json(
      { ok: false, message: "Endpoint status bot belum tersedia" },
      { status: 200 },
    );
  } catch {
    return Response.json(
      { ok: false, message: "Status bot tidak tersedia" },
      { status: 200 },
    );
  }
}
