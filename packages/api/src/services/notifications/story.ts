import type { PostAudience } from "@actiontokens/db";

import type { Context } from "../../context";
import { notify } from "./send";

const DAY_MS = 24 * 60 * 60_000;

/**
 * Tells followers an artist shared a story, once a day each: anyone already
 * told about a story by this artist in the last 24 hours is skipped. A story
 * for subscribers (or members) only tells the artist's subscribers, the
 * followers whose saved flag says they trust the fan token; who can really open
 * it is still decided by the lock. Best effort: a failed notification never
 * undoes the story.
 */
export async function announceStory(
  ctx: Pick<Context, "db">,
  input: { artist: { id: string; userId: string }; audience: PostAudience; now?: Date },
) {
  try {
    const { artist, audience } = input;
    const since = new Date((input.now ?? new Date()).getTime() - DAY_MS);
    const narrow = audience === "SUBSCRIBERS" || audience === "MEMBERS";
    const followers = await ctx.db.follow.findMany({
      where: { artistId: artist.id, ...(narrow ? { isTemporary: false } : {}) },
      select: { userId: true },
    });
    if (followers.length === 0) return;
    const ids = followers.map((follower) => follower.userId);
    const recent = await ctx.db.notification.findMany({
      where: {
        recipientId: { in: ids },
        isForArtist: false,
        event: { type: "STORY", actorId: artist.userId, createdAt: { gt: since } },
      },
      select: { recipientId: true },
    });
    const told = new Set(recent.map((row) => row.recipientId));
    await notify(ctx, {
      type: "STORY",
      actorId: artist.userId,
      entityId: artist.id,
      recipients: ids.filter((id) => !told.has(id)).map((id) => ({ id })),
    });
  } catch (error) {
    console.error("[notify] couldn't tell followers about a story", { error });
  }
}
