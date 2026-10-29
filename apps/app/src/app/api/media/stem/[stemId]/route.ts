import { canPlayFull, previewByteRange, PREVIEW_SECONDS, wavPreview } from "@bandcoin/api";
import { sessionUserOf } from "@bandcoin/auth";
import { db } from "@bandcoin/db/server";
import { assertPublicHttpUrl, signedMediaUrl } from "@bandcoin/storage";

import { getSession } from "~/server/auth";

/** Demo stems seeded for development live in this app's public folder. */
const LOCAL_PREFIX = "/demo-stems/";

/**
 * One stem's audio, always through this route (so the browser can decode it
 * without cross-origin rules). People who may play the full song get the whole
 * file; everyone else gets only the first 30 seconds, cut here, so the full
 * stem never reaches them.
 */
export async function GET(request: Request, { params }: { params: Promise<{ stemId: string }> }) {
  const { stemId } = await params;
  const stem = await db.itemStem.findUnique({
    where: { id: stemId },
    select: {
      sourceUrl: true,
      streamKey: true,
      item: { select: { id: true, createdById: true, artist: { select: { userId: true } }, media: { select: { durationSec: true } } } },
    },
  });
  if (!stem?.item) return new Response("No such stem", { status: 404 });

  const viewerId = sessionUserOf(await getSession())?.user.id ?? null;
  const full = viewerId !== null && (await canPlayFull(db, viewerId, stem.item.id, stem.item));

  try {
    const source = stem.streamKey
      ? new URL(await signedMediaUrl(stem.streamKey))
      : stem.sourceUrl.startsWith(LOCAL_PREFIX)
        ? new URL(stem.sourceUrl, request.url)
        : await assertPublicHttpUrl(stem.sourceUrl);

    if (full) {
      const whole = await fetch(source);
      if (!whole.ok || !whole.body) return new Response("Stem unavailable", { status: 502 });
      return new Response(whole.body, {
        headers: { "Content-Type": whole.headers.get("content-type") ?? "audio/mpeg", "Cache-Control": "private, max-age=3600" },
      });
    }
    return await preview(source, stem.item.media?.durationSec ?? null);
  } catch (error) {
    console.error("[stem] failed", { stemId, error });
    return new Response("Stem unavailable", { status: 502 });
  }
}

/** The first 30 seconds only: a re-headered cut for WAV, a byte window for other (constant-bitrate) formats. */
async function preview(source: URL, durationSec: number | null) {
  const head = await fetch(source, { headers: { Range: "bytes=0-43" } });
  const start = new Uint8Array(await head.arrayBuffer());

  const wav = wavPreview(start, PREVIEW_SECONDS);
  if (wav) {
    const data = await fetch(source, { headers: { Range: `bytes=${wav.range.start}-${wav.range.end}` } });
    const body = new Uint8Array(await data.arrayBuffer());
    const out = new Uint8Array(wav.header.length + body.length);
    out.set(wav.header);
    out.set(body, wav.header.length);
    return new Response(out, { headers: { "Content-Type": "audio/wav", "Cache-Control": "public, max-age=86400, immutable" } });
  }

  if (!durationSec) return new Response("No preview for this stem", { status: 404 });
  const size = Number((await fetch(source, { method: "HEAD" })).headers.get("content-length"));
  if (!size) return new Response("Preview unavailable", { status: 502 });
  const { start: from, end } = previewByteRange({ contentLength: size, durationSec, startSec: 0 });
  const slice = await fetch(source, { headers: { Range: `bytes=${from}-${end}` } });
  if (slice.status !== 206 || !slice.body) return new Response("Preview unavailable", { status: 502 });
  return new Response(slice.body, {
    headers: { "Content-Type": slice.headers.get("content-type") ?? "audio/mpeg", "Cache-Control": "public, max-age=86400, immutable" },
  });
}
