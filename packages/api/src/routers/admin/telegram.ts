import { z } from "zod";

import { AppError, ErrorCodes } from "@actiontokens/errors";

import { sendTelegram } from "../../services/telegram/send";
import { adminProcedure, createRouter } from "../../trpc";

const mask = (token: string) => (token ? `${token.slice(0, 6)}…${token.slice(-4)}` : "");

/**
 * Admin › Telegram: the bot and channel new bounties are posted to. The bot token never leaves the
 * server: the admin sees it masked, and leaving it blank when saving keeps the one already stored.
 */
export const telegramRouter = createRouter({
  get: adminProcedure.query(async ({ ctx }) => {
    const row = await ctx.db.telegramConfig.findFirst({ orderBy: { id: "asc" } });
    return {
      chatId: row?.chatId ?? "",
      enabled: row?.enabled ?? false,
      updatedAt: row?.updatedAt ?? null,
      botTokenMasked: mask(row?.botToken ?? ""),
      hasToken: Boolean(row?.botToken),
    };
  }),

  save: adminProcedure
    .input(
      z.object({
        botToken: z
          .string()
          .trim()
          .min(10, "That token looks too short")
          .optional()
          .or(z.literal("")),
        chatId: z.string().trim().min(1, "Say which channel"),
        enabled: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.telegramConfig.findFirst({ orderBy: { id: "asc" } });
      const token = input.botToken || undefined;
      if (!existing && !token)
        throw new AppError(ErrorCodes.VALIDATION_FAILED, {
          message: "A bot token is needed the first time.",
        });
      const data = {
        chatId: input.chatId,
        enabled: input.enabled,
        updatedBy: ctx.session.user.id,
        ...(token ? { botToken: token } : {}),
      };
      await (existing
        ? ctx.db.telegramConfig.update({ where: { id: existing.id }, data })
        : ctx.db.telegramConfig.create({ data: { ...data, botToken: token! } }));
      return { ok: true };
    }),

  /** Sends a test message right now, so the admin sees at once whether the bot and channel work. */
  test: adminProcedure
    .input(z.object({ message: z.string().trim().min(1).max(1000).optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.telegramConfig.findFirst({ orderBy: { id: "asc" } });
      if (!row?.botToken || !row.chatId)
        throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
          message: "Telegram isn't set up yet.",
        });
      await sendTelegram(
        row,
        input?.message ?? "✅ Test message from the Action Tokens admin. Your Telegram bot works.",
      );
      return { ok: true };
    }),
});
