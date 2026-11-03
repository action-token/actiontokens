import type { NotificationType } from "@bandcoin/db";

import type { Context } from "../../context";

/**
 * Tells people about something done on a post. A failed notification must
 * never undo the like or comment, so it is reported, not thrown.
 */
export async function notifyAboutPost(
  ctx: Pick<Context, "db">,
  event: {
    type: NotificationType;
    actorId: string;
    postId: string;
    recipients: { id: string; isForArtist: boolean }[];
  },
) {
  const recipients = event.recipients.filter((recipient) => recipient.id !== event.actorId);
  if (recipients.length === 0) return;
  try {
    await ctx.db.notificationEvent.create({
      data: {
        type: event.type,
        actorId: event.actorId,
        entityId: event.postId,
        notifications: {
          createMany: {
            data: recipients.map((recipient) => ({
              recipientId: recipient.id,
              isForArtist: recipient.isForArtist,
            })),
          },
        },
      },
    });
  } catch (error) {
    console.error("[feed] couldn't notify", { type: event.type, postId: event.postId, error });
  }
}
