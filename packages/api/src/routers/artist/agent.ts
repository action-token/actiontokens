import { z } from "zod";

import { ActionEditsInput } from "../../services/agent/actions";
import {
  cancelAction,
  confirmAction,
  deleteConversation,
  getConversation,
  listConversations,
  overview,
  pinJobStatus,
  pollRun,
  sendMessage,
} from "../../services/agent/conversations";
import { artistProcedure, createRouter } from "../../trpc";

/** The map agent chat (Studio and the portal): conversations, messages, proposals. */
export const agentRouter = createRouter({
  overview: artistProcedure.query(({ ctx }) => overview(ctx.artist)),

  conversations: artistProcedure.query(({ ctx }) =>
    listConversations(ctx, ctx.artist, ctx.session.user),
  ),

  conversation: artistProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(({ ctx, input }) => getConversation(ctx, ctx.artist, ctx.session.user, input.id)),

  deleteConversation: artistProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const removed = await deleteConversation(ctx, ctx.artist, ctx.session.user, input.id);
      ctx.activity.set({ targetType: "AgentConversation", targetId: input.id });
      return removed;
    }),

  send: artistProcedure
    .input(
      z.object({
        conversationId: z.string().min(1).optional(),
        text: z.string().max(4000),
        timeZone: z.string().max(60).optional(),
        answer: z
          .object({
            messageId: z.string(),
            blockId: z.string(),
            labels: z.array(z.string().max(200)).max(20),
          })
          .optional(),
      }),
    )
    .mutation(({ ctx, input }) => sendMessage(ctx, ctx.artist, ctx.session.user, input)),

  poll: artistProcedure
    .input(z.object({ jobId: z.string().min(1) }))
    .query(({ ctx, input }) => pollRun(ctx, ctx.artist, ctx.session.user, input.jobId)),

  confirm: artistProcedure
    .input(z.object({ actionId: z.string().min(1), edits: ActionEditsInput.optional() }))
    .mutation(async ({ ctx, input }) => {
      const done = await confirmAction(ctx, ctx.artist, ctx.session.user, input);
      ctx.activity.set({ targetType: "AgentAction", targetId: input.actionId });
      return done;
    }),

  cancel: artistProcedure
    .input(z.object({ actionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const done = await cancelAction(ctx, ctx.artist, ctx.session.user, input.actionId);
      ctx.activity.set({ targetType: "AgentAction", targetId: input.actionId });
      return done;
    }),

  pinJob: artistProcedure
    .input(z.object({ jobId: z.string().min(1) }))
    .query(({ ctx, input }) => pinJobStatus(ctx, ctx.artist, input.jobId)),
});
