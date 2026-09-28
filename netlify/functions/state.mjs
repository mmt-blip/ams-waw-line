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

  // Strong consistency: every read sees the latest write. The default
  // (eventual) mode can serve a board up to 60s old, which made moves
  // vanish and reappear on the other phone.
  // NOTE: store name is unchanged from the original deploy — this is the
  // same blob store that already holds the live rooms, including the
  // in-progress Amsterdam/Warsaw game. Renaming it would orphan that data.
  const store = getStore({ name: "ams-waw-games", consistency: "strong" });

  if (req.method === "GET") {
    const existing = await store.get(room, { type: "json" });
    return json(existing || null);
  }

  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    if (!body || typeof body !== "object" || !body.state) {
      return json({ error: "missing state" }, 400);
    }
    const current = await store.get(room, { type: "json" });
    const currentRev = current ? current.rev : 0;
    // Seeding an empty room only works if the room really is empty.
    if (body.seed && current) return json({ conflict: true, ...current }, 409);
    if (!body.seed && typeof body.rev === "number" && current && body.rev !== currentRev) {
      return json({ conflict: true, ...current }, 409);
    }
    const next = { state: body.state, rev: currentRev + 1, updatedAt: Date.now() };
    await store.setJSON(room, next);
    return json(next);
  }

  return json({ error: "method not allowed" }, 405);
};

export const config = { path: "/.netlify/functions/state" };
