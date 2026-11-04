import type { MediaType, PostAudience } from "@bandcoin/db";
import { AppError, ErrorCodes } from "@bandcoin/errors";
import { isOwnS3Url } from "@bandcoin/storage";

import type { Context } from "../../context";
import { invalid } from "./items";

/**
 * Stories: a photo or a short video an artist shares for 24 hours. They go
 * live the moment they're saved (no review; an admin can take one down), up to
 * ten at a time, and each one picks who can open it the way posts do:
 * everyone, followers, or members of a tier. A viewer who can't open one sees a
 * lock instead (see feed/stories).
 */
type ServiceCtx = Pick<Context, "db" | "activity">;
type ArtistRef = { id: string };

export const MAX_LIVE_STORIES = 10;
export const STORY_LIFETIME_MS = 24 * 60 * 60_000;
export const MAX_CAPTION = 200;

export type StoryInput = {
  type: Extract<MediaType, "IMAGE" | "VIDEO">;
  url: string;
  thumbnailUrl?: string | null;
  caption?: string | null;
  /** Who can open it; MEMBERS needs `tierId`. Left out: everyone. */
  audience?: PostAudience;
  tierId?: string | null;
};

const liveWhere = (artistId: string, now: Date) => ({
  artistId,
  removedAt: null,
  expiresAt: { gt: now },
});

export async function createStory(
  ctx: ServiceCtx,
  artist: ArtistRef,
  input: StoryInput,
  now = new Date(),
) {
  if (input.type !== "IMAGE" && input.type !== "VIDEO")
    throw invalid("A story is a photo or a short video.");
  if (!isOwnS3Url(input.url) || (input.thumbnailUrl && !isOwnS3Url(input.thumbnailUrl)))
    throw invalid("Upload the file again.");
  const caption = input.caption?.trim() || null;
  if (caption && caption.length > MAX_CAPTION)
    throw invalid(`Keep the caption under ${MAX_CAPTION} characters.`);

  const audience = input.audience ?? "EVERYONE";
  let tierId: string | null = null;
  if (audience === "MEMBERS") {
    const tier = input.tierId
      ? await ctx.db.membershipTier.findFirst({
          where: { id: input.tierId, artistId: artist.id, isActive: true },
          select: { id: true },
        })
      : null;
    if (!tier) throw invalid("Pick one of your active membership tiers.");
    tierId = tier.id;
  }

  const live = await ctx.db.story.count({ where: liveWhere(artist.id, now) });
  if (live >= MAX_LIVE_STORIES)
    throw invalid(
      `You have ${MAX_LIVE_STORIES} live stories. Remove one, or wait for one to end, to add another.`,
    );

  const story = await ctx.db.story.create({
    data: {
      artistId: artist.id,
      type: input.type,
      url: input.url,
      thumbnailUrl: input.thumbnailUrl ?? null,
      caption,
      audience,
      tierId,
      expiresAt: new Date(now.getTime() + STORY_LIFETIME_MS),
    },
    select: { id: true },
  });
  ctx.activity.set({ targetType: "Story", targetId: story.id });
  return { storyId: story.id };
}

/** The artist's live stories, newest first, with how many people have viewed each. */
export async function listMyStories(ctx: Pick<ServiceCtx, "db">, artist: ArtistRef, now = new Date()) {
  const rows = await ctx.db.story.findMany({
    where: liveWhere(artist.id, now),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      type: true,
      url: true,
      thumbnailUrl: true,
      caption: true,
      audience: true,
      tier: { select: { name: true } },
      createdAt: true,
      expiresAt: true,
      _count: { select: { views: true } },
    },
  });
  return rows.map(({ _count, tier, ...story }) => ({
    ...story,
    tierName: tier?.name ?? null,
    views: _count.views,
  }));
}

/** Ends a story now. The files stay in storage; the worker clears the row a day later. */
export async function removeStory(
  ctx: ServiceCtx,
  artist: ArtistRef,
  storyId: string,
  now = new Date(),
) {
  const story = await ctx.db.story.findFirst({
    where: { id: storyId, artistId: artist.id },
    select: { id: true },
  });
  if (!story) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Story not found" });
  ctx.activity.set({ targetType: "Story", targetId: story.id });
  await ctx.db.story.update({ where: { id: story.id }, data: { removedAt: now } });
  return { storyId: story.id };
}
