import { getStore } from "@netlify/blobs";

const ROOM_RE = /^[a-z0-9-]{4,40}$/i;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export default async (req) => {
  const url = new URL(req.url);
  const room = (url.searchParams.get("room") || "").trim();
  if (!ROOM_RE.test(room)) return json({ error: "bad room" }, 400);

  const store = getStore("ams-waw-games");

  if (req.method === "GET") {
    const existing = await store.get(room, { type: "json" });
    return json(existing || null);
  }

  if (req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "bad json" }, 400);
    }
    if (!body || typeof body !== "object" || !body.state) {
      return json({ error: "missing state" }, 400);
    }

    const current = await store.get(room, { type: "json" });
    const currentRev = current ? current.rev : 0;

    if (typeof body.rev === "number" && current && body.rev !== currentRev) {
      return json({ conflict: true, ...current }, 409);
    }

    const next = { state: body.state, rev: currentRev + 1, updatedAt: Date.now() };
    await store.setJSON(room, next);
    return json(next);
  }

  return json({ error: "method not allowed" }, 405);
};

export const config = { path: "/.netlify/functions/state" };
