import type { Db } from "@bandcoin/db";

import type { Context } from "../../context";
import { tokenTrusted } from "../catalog/access";

/**
 * Followers and subscribers. Following an artist is free. A fan whose wallet
 * has a trustline to the artist's fan token (whatever it holds) is also a
 * subscriber. The saved flag is `Follow.isTemporary` (the old app's
 * "followed without a trustline yet"): true is just a follower, false a
 * subscriber. It is kept true to the chain here: when a fan follows or opens an
 * artist's page, when a "hold the token" order completes, and by a worker job
 * that lists everyone who trusts each token. Gating (the Subscribers audience)
 * reads the wallet itself, never this flag.
 */
type ServiceCtx = Pick<Context, "db" | "chain">;
type Token = { code: string; issuer: string };
type ArtistTokens = { id: string; fanTokenItem: { classicToken: Token | null } | null };

export const tokenOf = (artist: Pick<ArtistTokens, "fanTokenItem">) =>
  artist.fanTokenItem?.classicToken ?? null;

/** Whether the wallet trusts the token. A wallet that can't be read counts as unknown (null). */
export async function walletTrusts(
  ctx: Pick<Context, "chain">,
  walletAddress: string,
  token: Token | null,
): Promise<boolean | null> {
  if (!token) return false;
  try {
    return tokenTrusted(await ctx.chain.loadAccount(walletAddress), token);
  } catch {
    return null;
  }
}

/** Follows the artist and marks the fan a subscriber, as one step (they trust the token). */
export async function setSubscribed(db: Pick<Db, "follow">, userId: string, artistId: string) {
  await db.follow.upsert({
    where: { userId_artistId: { userId, artistId } },
    create: { userId, artistId, isTemporary: false },
    update: { isTemporary: false },
  });
}

/**
 * Brings one fan's saved state in line with their wallet: a trustline makes
 * them a subscriber (following them if they weren't), no trustline a follower.
 * An unreadable wallet changes nothing. Writes only when something differs.
 */
export async function syncViewerSubscription(
  ctx: ServiceCtx,
  user: { id: string; walletAddress: string },
  artist: ArtistTokens,
) {
  const key = { userId: user.id, artistId: artist.id };
  const row = await ctx.db.follow.findUnique({
    where: { userId_artistId: key },
    select: { isTemporary: true },
  });
  const token = tokenOf(artist);
  if (!token) return { following: Boolean(row), subscribed: false };
  const trusts = await walletTrusts(ctx, user.walletAddress, token);
  if (trusts === null)
    return { following: Boolean(row), subscribed: Boolean(row) && !row!.isTemporary };
  if (trusts) {
    if (!row || row.isTemporary) await setSubscribed(ctx.db, user.id, artist.id);
    return { following: true, subscribed: true };
  }
  if (row && !row.isTemporary)
    await ctx.db.follow.updateMany({ where: key, data: { isTemporary: true } });
  return { following: Boolean(row), subscribed: false };
}

/**
 * Worker: for each fan token, everyone who trusts it becomes a subscriber
 * (known users only; a follow is created for those who don't follow yet), and
 * followers marked subscribers who no longer trust it go back to followers.
 * A list too long to read in full never demotes anyone.
 */
export async function syncAllSubscribers(ctx: ServiceCtx) {
  const artists = await ctx.db.artist.findMany({
    where: { status: "APPROVED", fanTokenItem: { classicToken: { isNot: null } } },
    select: {
      id: true,
      fanTokenItem: { select: { classicToken: { select: { code: true, issuer: true } } } },
    },
  });
  const done = { artists: 0, subscribed: 0, demoted: 0 };
  for (const artist of artists) {
    const token = tokenOf(artist)!;
    let trustees: { addresses: string[]; complete: boolean };
    try {
      trustees = await ctx.chain.assetTrustees(token.code, token.issuer);
    } catch (error) {
      console.error("[subscribers] couldn't list who trusts", token.code, error);
      continue;
    }
    const users = trustees.addresses.length
      ? await ctx.db.user.findMany({
          where: { walletAddress: { in: trustees.addresses } },
          select: { id: true, walletAddress: true },
        })
      : [];
    const trusting = new Set(users.map((user) => user.id));
    const follows = await ctx.db.follow.findMany({
      where: { artistId: artist.id },
      select: { userId: true, isTemporary: true },
    });
    const following = new Map(follows.map((follow) => [follow.userId, follow.isTemporary]));

    const create = users.filter((user) => !following.has(user.id)).map((user) => user.id);
    const promote = users.filter((user) => following.get(user.id) === true).map((user) => user.id);
    const demote = trustees.complete
      ? follows
          .filter((follow) => !follow.isTemporary && !trusting.has(follow.userId))
          .map((follow) => follow.userId)
      : [];
    if (create.length)
      await ctx.db.follow.createMany({
        data: create.map((userId) => ({ userId, artistId: artist.id, isTemporary: false })),
        skipDuplicates: true,
      });
    if (promote.length)
      await ctx.db.follow.updateMany({
        where: { artistId: artist.id, userId: { in: promote } },
        data: { isTemporary: false },
      });
    if (demote.length)
      await ctx.db.follow.updateMany({
        where: { artistId: artist.id, userId: { in: demote } },
        data: { isTemporary: true },
      });
    done.artists += 1;
    done.subscribed += create.length + promote.length;
    done.demoted += demote.length;
  }
  return done;
}
