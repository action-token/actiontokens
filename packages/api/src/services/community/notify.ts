import type { NotificationType } from "@actiontokens/db";

import type { Context } from "../../context";
import { notify } from "../notifications/send";

type Switch = "newPosts" | "newComments" | "newMembers" | "reactions";

/**
 * Tells community members about something through the central notification system (the same bell
 * as everything else). `only` limits who hears (a post's author, the owner); everyone else in
 * `only` is skipped when they switched this kind off for this community. Best effort: a failed
 * notification never undoes the post, comment or join that caused it.
 */
export async function notifyCommunity(
  ctx: Pick<Context, "db">,
  event: {
    type: NotificationType;
    actorId: string;
    communityId: string;
    /** Which of the member's switches silences this; omitted means it can't be silenced. */
    switch?: Switch;
    /** Who to tell; omitted means every member. */
    only?: string[];
  },
) {
  try {
    const [members, muted] = await Promise.all([
      event.only
        ? Promise.resolve(event.only.map((userId) => ({ userId })))
        : ctx.db.communityMember.findMany({
            where: { communityId: event.communityId },
            select: { userId: true },
          }),
      event.switch
        ? ctx.db.communityNotificationPreference.findMany({
            where: { communityId: event.communityId, [event.switch]: false },
            select: { userId: true },
          })
        : Promise.resolve([]),
    ]);
    const off = new Set(muted.map((row) => row.userId));
    await notify(ctx, {
      type: event.type,
      actorId: event.actorId,
      entityId: event.communityId,
      recipients: members.filter((m) => !off.has(m.userId)).map((m) => ({ id: m.userId })),
    });
  } catch (error) {
    console.error("[notify] couldn't tell community members", { type: event.type, error });
  }
}
