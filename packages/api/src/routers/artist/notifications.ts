import { z } from "zod";

import { loadInbox, markInboxSeen } from "../../services/notifications/inbox";
import { authedProcedure, createRouter } from "../../trpc";

/**
 * What fans did that the artist should know: follows, likes, comments,
 * sales, membership, bounty joins and submissions. Shown in the portal's
 * bell; the artist's fan-side notifications stay in the fan app.
 */
export const notificationsRouter = createRouter({
  latest: authedProcedure.query(({ ctx }) => loadInbox(ctx, ctx.session.user.id, "ARTIST", null)),

  page: authedProcedure
    .input(z.object({ cursor: z.string().min(1).nullish() }))
    .query(({ ctx, input }) => loadInbox(ctx, ctx.session.user.id, "ARTIST", input.cursor ?? null)),

  markSeen: authedProcedure.mutation(({ ctx }) =>
    markInboxSeen(ctx, ctx.session.user.id, "ARTIST"),
  ),
});
