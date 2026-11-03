import { AppError, ErrorCodes } from "@bandcoin/errors";
import type { Prisma } from "@bandcoin/db";

import type { Context } from "../../context";
import { notifyArtist } from "../notifications/send";

type ServiceCtx = Pick<Context, "db" | "activity">;

/**
 * Follows or unfollows an approved artist (free; holding their token is a
 * separate thing). The artist hears about a fan's first follow only, so
 * following and unfollowing again doesn't ping them each time.
 */
export async function setFollowing(
  ctx: ServiceCtx,
  userId: string,
  where: Prisma.ArtistWhereInput,
  following: boolean,
) {
  const artist = await ctx.db.artist.findFirst({
    where: { ...where, status: "APPROVED" },
    select: { id: true, userId: true },
  });
  if (!artist)
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "This artist doesn't exist." });
  ctx.activity.set({ targetType: "Artist", targetId: artist.id });
  const key = { userId, artistId: artist.id };

  if (following) {
    const before = await ctx.db.follow.findUnique({
      where: { userId_artistId: key },
      select: { userId: true },
    });
    await ctx.db.follow.upsert({
      where: { userId_artistId: key },
      create: key,
      update: { isTemporary: false },
    });
    if (!before && artist.userId !== userId) {
      const told = await ctx.db.notificationEvent.findFirst({
        where: { type: "FOLLOW", actorId: userId, entityId: artist.id },
        select: { id: true },
      });
      if (!told)
        await notifyArtist(ctx, {
          type: "FOLLOW",
          actorId: userId,
          entityId: artist.id,
          artistUserId: artist.userId,
        });
    }
  } else {
    await ctx.db.follow.deleteMany({ where: key });
  }
  const followers = await ctx.db.follow.count({ where: { artistId: artist.id } });
  return { following, followers };
}
