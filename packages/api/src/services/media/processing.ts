import type { Db } from "@actiontokens/db";
import { AppError, ErrorCodes } from "@actiontokens/errors";

import { enqueueJob } from "../jobs/queue";

/**
 * Asking the worker to make a song's playable files (`media.transcode`):
 *
 *   all      a new song, a Retry, or the backfill: stream, preview, waveform, stems
 *   preview  the artist moved the preview start: only the 30 s cut again
 *   stems    a stem was added to a song that's already processed
 */
export type TranscodePart = "all" | "preview" | "stems";

export const queueTranscode = (db: Db, itemId: string, part: TranscodePart) =>
  enqueueJob(db, "media.transcode", { itemId, part }, { dedupe: true });

/**
 * What changed on a song decides what to redo. Before the first processing
 * has finished there is nothing to redo: that run picks up the latest
 * preview start and every stem.
 */
export async function queueRedo(db: Db, itemId: string, part: Exclude<TranscodePart, "all">) {
  const media = await db.itemMedia.findUnique({ where: { itemId }, select: { status: true } });
  if (media?.status === "READY") await queueTranscode(db, itemId, part);
}

/** Retry on a song whose processing failed. */
export async function retryTranscode(db: Db, itemId: string) {
  const updated = await db.itemMedia.updateMany({
    where: { itemId, status: "FAILED" },
    data: { status: "PENDING" },
  });
  if (updated.count === 0)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: "This song isn't stuck." });
  await queueTranscode(db, itemId, "all");
  return { itemId };
}
