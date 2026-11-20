import { AppError, ErrorCodes } from "@actiontokens/errors";

import type { Context } from "../../context";

const RECENT_PINS = 10;

/** One artist for /admin/artists/[id], as Wadzzo's creator page: who, what they made, their accounts. */
export async function getArtist(ctx: Pick<Context, "db">, artistId: string) {
  const artist = await ctx.db.artist.findUnique({
    where: { id: artistId },
    select: {
      id: true,
      name: true,
      slug: true,
      bio: true,
      avatarUrl: true,
      coverUrl: true,
      status: true,
      rejectionReason: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          email: true,
          walletAddress: true,
          suspendedAt: true,
        },
      },
      issuerAccount: { select: { publicKey: true } },
      storageAccount: { select: { publicKey: true } },
      pendingFanToken: true,
      fanTokenItem: {
        select: { title: true, coverUrl: true, classicToken: { select: { code: true } } },
      },
      _count: {
        select: {
          pins: true,
          followers: true,
          posts: true,
          bounties: true,
          items: true,
          tiers: true,
        },
      },
      pins: {
        orderBy: { createdAt: "desc" },
        take: RECENT_PINS,
        select: {
          id: true,
          title: true,
          imageUrl: true,
          approval: true,
          isHidden: true,
          startsAt: true,
          endsAt: true,
          claimLimit: true,
          claimsLeft: true,
          _count: { select: { spots: true } },
        },
      },
    },
  });
  if (!artist) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Artist not found" });
  const collected = await ctx.db.pinClaim.count({ where: { spot: { pin: { artistId } } } });

  return {
    id: artist.id,
    name: artist.name,
    slug: artist.slug,
    bio: artist.bio,
    avatarUrl: artist.avatarUrl,
    coverUrl: artist.coverUrl,
    status: artist.status,
    rejectionReason: artist.rejectionReason,
    createdAt: artist.createdAt,
    owner: {
      id: artist.user.id,
      name: artist.user.displayName ?? artist.user.username,
      email: artist.user.email,
      walletAddress: artist.user.walletAddress,
      suspended: artist.user.suspendedAt !== null,
    },
    issuer: artist.issuerAccount?.publicKey ?? null,
    storage: artist.storageAccount?.publicKey ?? null,
    fanToken: artist.fanTokenItem
      ? {
          code: artist.fanTokenItem.classicToken?.code ?? null,
          title: artist.fanTokenItem.title,
          coverUrl: artist.fanTokenItem.coverUrl,
        }
      : null,
    /** The token chosen while applying, made when approved */
    chosenFanToken: artist.pendingFanToken as {
      mode: "NEW" | "EXISTING";
      code: string;
      issuer?: string;
      coverUrl: string;
    } | null,
    counts: { ...artist._count, collected },
    recentPins: artist.pins.map((pin) => ({
      id: pin.id,
      title: pin.title,
      imageUrl: pin.imageUrl,
      approval: pin.approval,
      paused: pin.isHidden,
      startsAt: pin.startsAt,
      endsAt: pin.endsAt,
      spots: pin._count.spots,
      claimed: Math.max(0, pin.claimLimit - pin.claimsLeft),
    })),
  };
}
