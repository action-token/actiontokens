import { queueTranscode } from "@bandcoin/api";
import type { Db } from "@bandcoin/db";
import { AppError, ErrorCodes } from "@bandcoin/errors";

/**
 * Songs uploaded before processing existed (LEGACY) still play as uploaded.
 * This queues a batch of them for the worker, oldest first:
 *
 *   pnpm --filter @bandcoin/worker backfill:music [how many, default 50]
 */
export async function backfillMusic(db: Db, limit: number) {
  const rows = await db.itemMedia.findMany({
    where: {
      status: "LEGACY",
      mediaType: "AUDIO",
      item: { type: "TRACK", deletedAt: null },
    },
    orderBy: { item: { createdAt: "asc" } },
    take: limit,
    select: { itemId: true },
  });
  for (const { itemId } of rows) {
    await db.itemMedia.update({ where: { itemId }, data: { status: "PENDING" } });
    await queueTranscode(db, itemId, "all");
  }
  return rows.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { db } = await import("@bandcoin/db/server");
  const limit = Number(process.argv[2] ?? 50);
  if (!Number.isInteger(limit) || limit < 1)
    throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: "Give how many songs, e.g. 50" });
  console.log(`[backfill] queued ${await backfillMusic(db, limit)} songs`);
  await db.$disconnect();
}
