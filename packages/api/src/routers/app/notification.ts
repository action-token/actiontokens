import { z } from "zod";

import { loadInbox, markInboxSeen } from "../../services/notifications/inbox";
import { authedProcedure, createRouter } from "../../trpc";

/**
 * The fan's notifications (the artist's own show in the portal). Reading
 * changes nothing; opening the bell or the page marks them seen.
 */
export const notificationRouter = createRouter({
  /** The bell: the latest few and how many are unread. */
  latest: authedProcedure.query(({ ctx }) => loadInbox(ctx, ctx.session.user.id, "FAN", null)),

  /** The Notifications page, a page at a time. */
  page: authedProcedure
    .input(z.object({ cursor: z.string().min(1).nullish() }))
    .query(({ ctx, input }) => loadInbox(ctx, ctx.session.user.id, "FAN", input.cursor ?? null)),

  /** Marks every unseen notification seen. */
  markSeen: authedProcedure.mutation(({ ctx }) => markInboxSeen(ctx, ctx.session.user.id, "FAN")),
});
