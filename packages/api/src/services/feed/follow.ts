import { AppError, ErrorCodes } from "@actiontokens/errors";
import type { Prisma } from "@actiontokens/db";

import type { Context } from "../../context";
import { notifyArtist } from "../notifications/send";
import { tokenOf, walletTrusts } from "./subscribe";

type ServiceCtx = Pick<Context, "db" | "activity" | "chain">;

/**
 * Follows or unfollows an approved artist (free). A fan whose wallet already
 * trusts the artist's fan token follows as a subscriber; otherwise as a
 * follower, and `fanToken` says they could subscribe. The artist hears about a fan's first follow only, so
 * following and unfollowing again doesn't ping them each time.
 */
export async function setFollowing(
  ctx: ServiceCtx,
  user: { id: string; walletAddress: string },
  where: Prisma.ArtistWhereInput,
  following: boolean,
) {
  const artist = await ctx.db.artist.findFirst({
    where: { ...where, status: "APPROVED" },
    select: {
      id: true,
      userId: true,
      fanTokenItem: { select: { classicToken: { select: { code: true, issuer: true } } } },
    },
  });
  if (!artist)
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "This artist doesn't exist." });
  ctx.activity.set({ targetType: "Artist", targetId: artist.id });
  const userId = user.id;
  const key = { userId, artistId: artist.id };
  const token = tokenOf(artist);

  let subscribed = false;
  if (following) {
    const before = await ctx.db.follow.findUnique({
      where: { userId_artistId: key },
      select: { userId: true },
    });
    // Trusting the token makes them a subscriber; an unreadable wallet counts as a follower for now.
    const trusts = (await walletTrusts(ctx, user.walletAddress, token)) === true;
    await ctx.db.follow.upsert({
      where: { userId_artistId: key },
      create: { ...key, isTemporary: !trusts },
      update: { isTemporary: !trusts },
    });
    subscribed = trusts;
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
    // A fan who still trusts the token would be followed again as soon as it is looked at.
    if (token && (await walletTrusts(ctx, user.walletAddress, token)) === true)
      throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
        message: `You're subscribed because your wallet holds the ${token.code} line. Remove the ${token.code} line in your wallet to stop.`,
      });
    await ctx.db.follow.deleteMany({ where: key });
  }
  const [followers, subscribers] = await Promise.all([
    ctx.db.follow.count({ where: { artistId: artist.id } }),
    ctx.db.follow.count({ where: { artistId: artist.id, isTemporary: false } }),
  ]);
  // A follower can subscribe by trusting the artist's fan token (see recharge TOKEN_TRUST).
  return {
    following,
    subscribed,
    followers,
    subscribers,
    fanToken: following && !subscribed && token ? { code: token.code, artistId: artist.id } : null,
  };
}
