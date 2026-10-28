import { previewByteRange } from "@bandcoin/api";
import { db } from "@bandcoin/db/server";
import { assertPublicHttpUrl } from "@bandcoin/storage";

/** Content length of each source file, so a preview needs one request, not two. */
const sizes = new Map<string, number>();

/**
 * The 30 s preview of an older, untranscoded track. Only that window is read
 * from the source and sent, so the full file never reaches someone who
 * doesn't own it. Transcoded tracks have a real preview file instead.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const media = await db.itemMedia.findUnique({
    where: { itemId },
    select: { mediaType: true, sourceUrl: true, durationSec: true, previewStartSec: true },
  });
  if (media?.mediaType !== "AUDIO" || !media.durationSec) {
    return new Response("No preview for this item", { status: 404 });
  }

  try {
    const source = await assertPublicHttpUrl(media.sourceUrl);
    let size = sizes.get(source.href);
    if (size === undefined) {
      const head = await fetch(source, { method: "HEAD" });
      size = Number(head.headers.get("content-length"));
      if (!head.ok || !size) return new Response("Preview unavailable", { status: 502 });
      sizes.set(source.href, size);
    }
    const { start, end } = previewByteRange({ contentLength: size, durationSec: media.durationSec, startSec: media.previewStartSec });
    const slice = await fetch(source, { headers: { Range: `bytes=${start}-${end}` } });
    if (slice.status !== 206 || !slice.body) return new Response("Preview unavailable", { status: 502 });

    return new Response(slice.body, {
      headers: {
        "Content-Type": slice.headers.get("content-type") ?? "audio/mpeg",
        "Content-Length": String(end - start + 1),
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch (error) {
    console.error("[preview] failed", { itemId, error });
    return new Response("Preview unavailable", { status: 502 });
  }
}
