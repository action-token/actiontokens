import { z } from "zod";

import { setFollowing } from "../../services/feed/follow";

import { AppError, ErrorCodes } from "@bandcoin/errors";

import { draftDesign, publishedDesign } from "../../services/artist/page";
import { currentSlugFor } from "../../services/artist/profile";
import { resolveVanity } from "../../services/artist/vanity";
import { publicBountyWhere } from "./bounty";
import { prizeView } from "../../services/bounty/prize";
import { itemCardSelect, listedItemWhere, toItemCard } from "../../services/catalog/item-card";
import { authedProcedure, createRouter, publicProcedure } from "../../trpc";

const slugInput = z.object({ slug: z.string().min(1).max(120) });

export const artistRouter = createRouter({
  /** Who answers at bandcoin.io/name: the artist's slug, and whether the link still works or only redirects. */
  /** Where an old page address points after a rename (null if it never existed). */
  renamedTo: publicProcedure
    .input(z.object({ slug: z.string().min(1).max(60) }))
    .query(({ ctx, input }) => currentSlugFor(ctx, input.slug)),

  byVanity: publicProcedure
    .input(z.object({ name: z.string().min(1).max(60) }))
    .query(({ ctx, input }) => resolveVanity(ctx, input.name)),

  /**
   * An artist's page: profile, follower count, whether you follow them,
   * popular songs, albums, everything for sale and live bounties.
   */
  bySlug: publicProcedure.input(slugInput).query(async ({ ctx, input }) => {
    const viewerId = ctx.session?.user.id;
    const artist = await ctx.db.artist.findFirst({
      where: { slug: input.slug, status: "APPROVED" },
      select: {
        id: true,
        name: true,
        slug: true,
        bio: true,
        avatarUrl: true,
        coverUrl: true,
        website: true,
        twitter: true,
        instagram: true,
        fanTokenItem: { select: { classicToken: { select: { code: true } } } },
        _count: { select: { followers: true, items: { where: listedItemWhere } } },
      },
    });
    if (!artist)
      throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "This artist doesn't exist." });

    const mine = { ...listedItemWhere, artistId: artist.id };
    const [popular, forSale, albums, bounties, following, tiers, events, design] =
      await Promise.all([
        ctx.db.item.findMany({
          where: { ...mine, type: "TRACK" },
          orderBy: [{ playCount: "desc" }, { createdAt: "desc" }],
          take: 10,
          select: itemCardSelect,
        }),
        ctx.db.item.findMany({
          where: { ...mine, listings: { some: { status: "ACTIVE" } } },
          orderBy: { createdAt: "desc" },
          take: 24,
          select: itemCardSelect,
        }),
        ctx.db.album.findMany({
          where: { artistId: artist.id },
          orderBy: { createdAt: "desc" },
          select: {
            title: true,
            slug: true,
            coverUrl: true,
            createdAt: true,
            _count: { select: { tracks: true } },
          },
        }),
        ctx.db.bounty.findMany({
          where: { ...publicBountyWhere, artistId: artist.id, status: "RUNNING" },
          orderBy: { createdAt: "desc" },
          take: 4,
          select: {
            id: true,
            title: true,
            summary: true,
            prizeAmount: true,
            prizeCurrency: true,
            prizeAssetCode: true,
            prizeAssetIssuer: true,
            _count: { select: { participants: true } },
          },
        }),
        viewerId
          ? ctx.db.follow.findUnique({
              where: { userId_artistId: { userId: viewerId, artistId: artist.id } },
              select: { userId: true },
            })
          : null,
        ctx.db.membershipTier.findMany({
          where: { artistId: artist.id, isActive: true },
          orderBy: [{ requiredTokens: "asc" }, { sortOrder: "asc" }],
          select: {
            id: true,
            name: true,
            description: true,
            features: true,
            color: true,
            isPopular: true,
            requiredTokens: true,
          },
        }),
        ctx.db.event.findMany({
          where: { artistId: artist.id, endsAt: { gte: new Date() } },
          orderBy: { startsAt: "asc" },
          take: 10,
          select: {
            id: true,
            title: true,
            startsAt: true,
            endsAt: true,
            venueName: true,
            address: true,
            coverUrl: true,
          },
        }),
        publishedDesign(ctx, artist.id),
      ]);

    const { _count, id: _id, fanTokenItem, ...profile } = artist;
    return {
      ...profile,
      /** The page the artist designed in the page builder, or null for the standard page */
      design,
      tokenCode: fanTokenItem?.classicToken?.code ?? null,
      tiers: tiers.map((tier) => ({ ...tier, requiredTokens: tier.requiredTokens.toString() })),
      events,
      followers: _count.followers,
      itemCount: _count.items,
      following: Boolean(following),
      popular: popular.map(toItemCard),
      forSale: forSale.map(toItemCard),
      albums: albums.map((album) => ({
        title: album.title,
        slug: album.slug,
        coverUrl: album.coverUrl,
        year: album.createdAt.getFullYear(),
        trackCount: album._count.tracks,
      })),
      bounties: bounties.map((bounty) => ({
        id: bounty.id,
        title: bounty.title,
        summary: bounty.summary,
        prize: prizeView(bounty, ctx.chain.config),
        participants: bounty._count.participants,
      })),
    };
  }),

  /**
   * Sell Page Assets: the artist's open bundles of their fan token, each
   * bought whole by one fan through the usual buy panel (services/purchase).
   */
  pageAssets: publicProcedure.input(slugInput).query(async ({ ctx, input }) => {
    const viewerId = ctx.session?.user.id;
    const artist = await ctx.db.artist.findFirst({
      where: { slug: input.slug, status: "APPROVED" },
      select: {
        fanTokenItem: {
          select: { id: true, coverUrl: true, classicToken: { select: { code: true } } },
        },
      },
    });
    const token = artist?.fanTokenItem;
    if (!token?.classicToken) return { code: null, coverUrl: null, offers: [] };
    const offers = await ctx.db.listing.findMany({
      where: { itemId: token.id, kind: "BUNDLE", status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        kind: true,
        bundleAmount: true,
        note: true,
        priceBandcoin: true,
        priceUsd: true,
        priceXlm: true,
        seller: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
      },
    });
    return {
      code: token.classicToken.code,
      coverUrl: token.coverUrl,
      offers: offers.map((offer) => ({
        id: offer.id,
        amount: offer.bundleAmount?.toString() ?? "0",
        note: offer.note,
        priceXlm: offer.priceXlm?.toString() ?? null,
        /** Shaped like an item page listing, for the buy panel */
        listing: {
          id: offer.id,
          kind: offer.kind,
          priceBandcoin: offer.priceBandcoin.toString(),
          priceUsd: offer.priceUsd.toString(),
          remaining: 1,
          seller: offer.seller,
          isOwn: offer.seller.id === viewerId,
        },
      })),
    };
  }),

  /** The unpublished design, for the artist's own live preview in the page builder. */
  draftDesign: authedProcedure.input(slugInput).query(async ({ ctx, input }) => {
    const artist = await ctx.db.artist.findFirst({
      where: { slug: input.slug },
      select: { id: true, userId: true },
    });
    if (!artist)
      throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "This artist doesn't exist." });
    if (artist.userId !== ctx.session.user.id && ctx.session.user.role !== "ADMIN")
      throw new AppError(ErrorCodes.AUTH_FORBIDDEN, {
        message: "Only the artist can preview their draft.",
      });
    return draftDesign(ctx, artist.id);
  }),

  /** Follow or unfollow an artist (free; holding their token is a separate thing). */
  setFollowing: authedProcedure
    .input(slugInput.extend({ following: z.boolean() }))
    .mutation(({ ctx, input }) =>
      setFollowing(ctx, ctx.session.user.id, { slug: input.slug }, input.following),
    ),
});
