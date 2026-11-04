import { z } from "zod";

import { createMcpToken, listMcpTokens, revokeMcpToken } from "../../services/agent/mcp-token";
import { artistProcedure, createRouter } from "../../trpc";

/** Settings › AI apps: the person's access tokens. A token is shown once, when it's made; after that only its start. */
export const mcpTokensRouter = createRouter({
  list: artistProcedure.query(({ ctx }) => listMcpTokens(ctx.db, ctx.session.user)),

  create: artistProcedure
    .input(z.object({ name: z.string().max(80) }))
    .mutation(async ({ ctx, input }) => {
      const made = await createMcpToken(ctx.db, ctx.session.user, input.name);
      ctx.activity.set({ targetType: "McpToken", targetId: made.id });
      return made;
    }),

  revoke: artistProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const done = await revokeMcpToken(ctx.db, ctx.session.user, input.id);
      ctx.activity.set({ targetType: "McpToken", targetId: input.id });
      return done;
    }),
});
