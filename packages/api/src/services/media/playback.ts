import type { Db } from "@actiontokens/db";
import { AppError, ErrorCodes } from "@actiontokens/errors";
import { signedMediaUrl } from "@actiontokens/storage";

/** How much of a track someone who doesn't own it can hear. */
export const PREVIEW_SECONDS = 30;

export type Playback = {
  url: string;
  /** False: a preview; the player stops at `durationSec` and offers the item */
  full: boolean;
  durationSec: number | null;
};

/**
 * What the player may load for an item. Owners (buyers, gift recipients),
 * its creator and its artist get the full track; everyone else gets only a
 * preview, never the full file:
 *
 *   transcoded media  → signed URL of the cut 30 s preview
 *   artist's demo     → the demo file they uploaded
 *   older uploads     → /api/media/preview/<id>, which streams only the
 *                       30 s window from the server (see previewByteRange)
 */
export async function playbackFor(
  db: Db,
  viewerId: string | null,
  itemId: string,
): Promise<Playback> {
  const item = await db.item.findFirst({
    where: { id: itemId, deletedAt: null },
    select: {
      createdById: true,
      artist: { select: { userId: true } },
      media: {
        select: {
          mediaType: true,
          sourceUrl: true,
          demoUrl: true,
          status: true,
          streamKey: true,
          previewKey: true,
          durationSec: true,
        },
      },
    },
  });
  const media = item?.media;
  if (!item || !media || (media.mediaType !== "AUDIO" && media.mediaType !== "VIDEO")) {
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Nothing to play here." });
  }

  if (viewerId && (await canPlayFull(db, viewerId, itemId, item))) {
    const url =
      media.status === "READY" && media.streamKey
        ? await signedMediaUrl(media.streamKey)
        : media.sourceUrl;
    return { url, full: true, durationSec: media.durationSec };
  }

  const previewLength = media.durationSec
    ? Math.min(PREVIEW_SECONDS, media.durationSec)
    : PREVIEW_SECONDS;
  if (media.status === "READY" && media.previewKey) {
    return { url: await signedMediaUrl(media.previewKey), full: false, durationSec: previewLength };
  }
  if (media.demoUrl) return { url: media.demoUrl, full: false, durationSec: null };
  return { url: `/api/media/preview/${itemId}`, full: false, durationSec: previewLength };
}

export async function canPlayFull(
  db: Db,
  viewerId: string,
  itemId: string,
  item: { createdById: string; artist: { userId: string } | null },
) {
  if (item.createdById === viewerId || item.artist?.userId === viewerId) return true;
  const owned = await db.ownership.findUnique({
    where: { userId_itemId: { userId: viewerId, itemId } },
    select: { quantity: true },
  });
  return owned !== null && Number(owned.quantity) > 0;
}

/**
 * The bytes of an older (untranscoded, constant-bitrate) file that hold the
 * preview window. MP3 frames resync, so a slice from the middle plays.
 * Returns an inclusive range for an HTTP Range header.
 */
export function previewByteRange(input: {
  contentLength: number;
  durationSec: number;
  startSec: number;
  seconds?: number;
}) {
  const seconds = Math.min(input.seconds ?? PREVIEW_SECONDS, input.durationSec);
  const startSec = Math.max(0, Math.min(input.startSec, input.durationSec - seconds));
  const bytesPerSecond = input.contentLength / input.durationSec;
  const start = Math.floor(startSec * bytesPerSecond);
  const end = Math.min(
    input.contentLength - 1,
    Math.ceil((startSec + seconds) * bytesPerSecond) - 1,
  );
  return { start, end };
}
