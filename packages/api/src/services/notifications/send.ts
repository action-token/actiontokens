import type { NotificationType } from "@actiontokens/db";

import type { Context } from "../../context";

type Db = Pick<Context, "db">;

/** `isForArtist`: shown in the artist portal's bell rather than the fan app's. */
export type Recipient = { id: string; isForArtist?: boolean };

export type NotifyEvent = {
  type: NotificationType;
  actorId: string;
  /** What it's about: a post, item, bounty… (see describe.ts) */
  entityId?: string | null;
  recipients: Recipient[];
};

/**
 * Records one notification event for its recipients. Nobody is told about
 * their own action, and each person once. A failed notification must never
 * undo what caused it (a like, a purchase, a payout), so it is reported, not
 * thrown.
 */
export async function notify(ctx: Db, event: NotifyEvent) {
  const seen = new Set<string>();
  const recipients = event.recipients.filter((recipient) => {
    const key = `${recipient.id}:${recipient.isForArtist ? 1 : 0}`;
    if (recipient.id === event.actorId || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (recipients.length === 0) return;
  try {
    await ctx.db.notificationEvent.create({
      data: {
        type: event.type,
        actorId: event.actorId,
        entityId: event.entityId ?? null,
        notifications: {
          createMany: {
            data: recipients.map((recipient) => ({
              recipientId: recipient.id,
              isForArtist: recipient.isForArtist ?? false,
            })),
          },
        },
      },
    });
  } catch (error) {
    console.error("[notify] couldn't notify", {
      type: event.type,
      entityId: event.entityId,
      error,
    });
  }
}

/**
 * Tells an artist's followers about something new (a post, an item, a
 * bounty). `once` skips it when this thing was already announced, so taking
 * an item back to draft and publishing it again doesn't ping everyone twice.
 */
export async function notifyFollowers(
  ctx: Db,
  input: {
    type: NotificationType;
    artist: { id: string; userId: string };
    entityId: string;
    once?: boolean;
  },
) {
  try {
    if (input.once) {
      const sent = await ctx.db.notificationEvent.findFirst({
        where: { type: input.type, entityId: input.entityId },
        select: { id: true },
      });
      if (sent) return;
    }
    const followers = await ctx.db.follow.findMany({
      where: { artistId: input.artist.id },
      select: { userId: true },
    });
    await notify(ctx, {
      type: input.type,
      actorId: input.artist.userId,
      entityId: input.entityId,
      recipients: followers.map((follower) => ({ id: follower.userId })),
    });
  } catch (error) {
    console.error("[notify] couldn't tell followers", { type: input.type, error });
  }
}

/** Tells the artist, in their portal, about something a fan did. */
export const notifyArtist = (
  ctx: Db,
  event: {
    type: NotificationType;
    actorId: string;
    entityId?: string | null;
    artistUserId: string;
  },
) =>
  notify(ctx, {
    type: event.type,
    actorId: event.actorId,
    entityId: event.entityId,
    recipients: [{ id: event.artistUserId, isForArtist: true }],
  });

/**
 * A note to the person about their own account (a short link running out):
 * they are both who it's from and who it's for. Best effort.
 */
export async function notifySelf(
  ctx: Db,
  event: { type: NotificationType; userId: string; entityId: string; isForArtist?: boolean },
) {
  try {
    await ctx.db.notificationEvent.create({
      data: {
        type: event.type,
        actorId: event.userId,
        entityId: event.entityId,
        notifications: {
          create: { recipientId: event.userId, isForArtist: event.isForArtist ?? false },
        },
      },
    });
  } catch (error) {
    console.error("[notify] couldn't send a note", { type: event.type, error });
  }
}
