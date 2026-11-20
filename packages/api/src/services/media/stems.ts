import type { Db } from "@actiontokens/db";

import { canPlayFull, PREVIEW_SECONDS } from "./playback";

export type StemList = {
  /** True: the whole stems. False: only the first `previewSeconds` of each */
  full: boolean;
  previewSeconds: number | null;
  stems: { id: string; name: string; color: string; url: string }[];
};

/**
 * The stems the player's mixer can load for a song. The audio never comes
 * straight from storage: every stem is fetched through `/api/media/stem/<id>`,
 * which sends the whole file only to people who may play the full song and
 * cuts it to the first 30 seconds for everyone else.
 */
export async function stemsFor(db: Db, viewerId: string | null, itemId: string): Promise<StemList> {
  const item = await db.item.findFirst({
    where: { id: itemId, deletedAt: null },
    select: {
      createdById: true,
      artist: { select: { userId: true } },
      stems: {
        orderBy: [{ trackIndex: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true, color: true },
      },
    },
  });
  if (!item || item.stems.length === 0) return { full: false, previewSeconds: null, stems: [] };

  const full = viewerId !== null && (await canPlayFull(db, viewerId, itemId, item));
  return {
    full,
    previewSeconds: full ? null : PREVIEW_SECONDS,
    stems: item.stems.map((stem) => ({
      id: stem.id,
      name: stem.name,
      color: stem.color,
      url: `/api/media/stem/${stem.id}`,
    })),
  };
}
