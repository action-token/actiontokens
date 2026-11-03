import type { Context } from "../../context";
import { notifyFollowers } from "./send";

/**
 * Tells the artist's followers about a new release once it's public: on
 * create, or when a draft goes public. Each item is announced once, so
 * hiding and showing it again doesn't ping anyone twice. Fan tokens aren't
 * releases. Best effort.
 */
export async function announceItem(ctx: Pick<Context, "db">, itemId: string) {
  try {
    const item = await ctx.db.item.findUnique({
      where: { id: itemId },
      select: {
        type: true,
        visibility: true,
        deletedAt: true,
        hiddenAt: true,
        artist: { select: { id: true, userId: true } },
      },
    });
    if (!item?.artist || item.type === "FAN_TOKEN") return;
    if (item.visibility !== "PUBLIC" || item.deletedAt || item.hiddenAt) return;
    await notifyFollowers(ctx, {
      type: "NEW_ITEM",
      artist: item.artist,
      entityId: itemId,
      once: true,
    });
  } catch (error) {
    console.error("[notify] couldn't announce an item", { itemId, error });
  }
}
