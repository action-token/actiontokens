import type { MediaType, PostAudience } from "@actiontokens/db";
import { AppError, ErrorCodes } from "@actiontokens/errors";
import { isOwnS3Url } from "@actiontokens/storage";

import type { Context } from "../../context";
import { announceStory } from "../notifications/story";
import { invalid } from "./items";

/**
 * Stories: a photo or a short video an artist shares for 24 hours. They go
 * live the moment they're saved (no review; an admin can take one down), up to
 * ten at a time, and each one picks who can open it the way posts do:
 * everyone, followers, or members of a tier. A viewer who can't open one sees a
 * lock instead (see feed/stories).
 */
type ServiceCtx = Pick<Context, "db" | "activity">;
type ArtistRef = { id: string; userId: string };

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
  await announceStory(ctx, { artist, audience, now });
  return { storyId: story.id };
}

/** How many of the artist's stories the portal lists (newest first). */
const MY_STORIES_LIMIT = 100;

/**
 * The artist's stories, live and ended (taken-down ones are gone), newest first,
 * with how many people have viewed each and whether it is still live.
 */
export async function listMyStories(
  ctx: Pick<ServiceCtx, "db">,
  artist: ArtistRef,
  now = new Date(),
) {
  const rows = await ctx.db.story.findMany({
    where: { artistId: artist.id, removedAt: null },
    orderBy: { createdAt: "desc" },
    take: MY_STORIES_LIMIT,
    select: {
      id: true,
      type: true,
      url: true,
      thumbnailUrl: true,
      caption: true,
      audience: true,
      tierId: true,
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
    live: story.expiresAt > now,
  }));
}

/**
 * Takes a story down for good, live or already ended: it leaves the ring and the
 * archive. The files stay in storage; the worker clears the row a day later.
 */
export async function removeStory(
  ctx: ServiceCtx,
  artist: ArtistRef,
  storyId: string,
  now = new Date(),
) {
  const story = await ctx.db.story.findFirst({
    where: { id: storyId, artistId: artist.id, removedAt: null },
    select: { id: true },
  });
  if (!story) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Story not found" });
  ctx.activity.set({ targetType: "Story", targetId: story.id });
  await ctx.db.story.update({ where: { id: story.id }, data: { removedAt: now } });
  return { storyId: story.id };
}

/**
 * Changes a story's caption and who can watch it, live or ended. The picture or
 * clip can't be swapped. Members needs one of the artist's active tiers; any
 * other audience drops the tier. Only what is given changes.
 */
export async function updateStory(
  ctx: ServiceCtx,
  artist: ArtistRef,
  input: {
    storyId: string;
    caption?: string | null;
    audience?: PostAudience;
    tierId?: string | null;
  },
) {
  const story = await ctx.db.story.findFirst({
    where: { id: input.storyId, artistId: artist.id, removedAt: null },
    select: { id: true },
  });
  if (!story) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "Story not found" });

  const data: { caption?: string | null; audience?: PostAudience; tierId?: string | null } = {};
  if (input.caption !== undefined) {
    const caption = input.caption?.trim() || null;
    if (caption && caption.length > MAX_CAPTION)
      throw invalid(`Keep the caption under ${MAX_CAPTION} characters.`);
    data.caption = caption;
  }
  if (input.audience !== undefined) {
    data.audience = input.audience;
    data.tierId = null;
    if (input.audience === "MEMBERS") {
      const tier = input.tierId
        ? await ctx.db.membershipTier.findFirst({
            where: { id: input.tierId, artistId: artist.id, isActive: true },
            select: { id: true },
          })
        : null;
      if (!tier) throw invalid("Pick one of your active membership tiers.");
      data.tierId = tier.id;
    }
  }
  ctx.activity.set({ targetType: "Story", targetId: story.id });
  await ctx.db.story.update({ where: { id: story.id }, data });
  return { storyId: story.id };
}
