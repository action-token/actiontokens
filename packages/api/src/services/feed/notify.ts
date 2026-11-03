import type { NotificationType } from "@bandcoin/db";

import type { Context } from "../../context";
import { notify } from "../notifications/send";

/** Tells people about something done on a post (best effort, see notifications/send). */
export const notifyAboutPost = (
  ctx: Pick<Context, "db">,
  event: {
    type: NotificationType;
    actorId: string;
    postId: string;
    recipients: { id: string; isForArtist: boolean }[];
  },
) =>
  notify(ctx, {
    type: event.type,
    actorId: event.actorId,
    entityId: event.postId,
    recipients: event.recipients,
  });
