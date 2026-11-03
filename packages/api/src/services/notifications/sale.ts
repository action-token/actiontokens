import type { Context } from "../../context";
import { notifyArtist } from "./send";

/**
 * Tells the artist someone bought one of their items. Buying the artist's
 * fan token is joining their membership, so it reads as that instead.
 * Best effort: the sale is already delivered whatever happens here.
 */
export async function tellArtistAboutSale(
  ctx: Pick<Context, "db">,
  order: { buyerId: string | null; itemId: string | null },
) {
  if (!order.buyerId || !order.itemId) return;
  try {
    const item = await ctx.db.item.findUnique({
      where: { id: order.itemId },
      select: { type: true, artist: { select: { userId: true } } },
    });
    if (!item?.artist) return;
    await notifyArtist(ctx, {
      type: item.type === "FAN_TOKEN" ? "MEMBERSHIP" : "PURCHASE",
      actorId: order.buyerId,
      entityId: order.itemId,
      artistUserId: item.artist.userId,
    });
  } catch (error) {
    console.error("[notify] couldn't tell the artist about a sale", { error });
  }
}
