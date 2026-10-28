import { db } from "@bandcoin/db/server";

import { recordEmbedEvent } from "~/lib/embed-track";

/**
 * POST /api/embed/track `{ id, e }`: one counter bump for a website embed.
 * Sent with `navigator.sendBeacon` (text/plain), so the body is parsed by
 * hand. Always 204.
 */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  try {
    await recordEmbedEvent(db, await request.text(), ip);
  } catch (error) {
    console.error("[embed/track]", error);
  }
  return new Response(null, { status: 204 });
}
