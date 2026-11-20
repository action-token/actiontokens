import { AppError, ErrorCodes, isAppError } from "@actiontokens/errors";

import type { Context } from "../../context";
import { friendlyProviderError } from "./model";

/** The free daily allowance, per person and UTC day (applicants and artists alike). Admins aren't limited. */
export const AI_DAILY_LIMIT = { text: 50, image: 10 } as const;
export type AiKind = keyof typeof AI_DAILY_LIMIT;

type QuotaCtx = Pick<Context, "db">;
type Who = { userId: string; unlimited: boolean };

/** Midnight UTC of `now`, the key of the day's counter. */
const dayOf = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

export async function aiRemaining(ctx: QuotaCtx, who: Who, now = new Date()) {
  if (who.unlimited)
    return { text: null, image: null, limit: AI_DAILY_LIMIT, unlimited: true as const };
  const used = await ctx.db.aiUsage.findUnique({
    where: { userId_day: { userId: who.userId, day: dayOf(now) } },
    select: { text: true, image: true },
  });
  return {
    text: Math.max(0, AI_DAILY_LIMIT.text - (used?.text ?? 0)),
    image: Math.max(0, AI_DAILY_LIMIT.image - (used?.image ?? 0)),
    limit: AI_DAILY_LIMIT,
    unlimited: false as const,
  };
}

/**
 * Run `work` if the person has allowance left, and count it only when it
 * succeeds, so a failed generation costs nothing.
 */
export async function withAiQuota<T>(
  ctx: QuotaCtx,
  who: Who,
  kind: AiKind,
  work: () => Promise<T>,
  now = new Date(),
): Promise<T> {
  if (!who.unlimited) {
    const left = await aiRemaining(ctx, who, now);
    if ((left[kind] ?? 0) <= 0) {
      throw new AppError(ErrorCodes.RATE_LIMITED, {
        message: `You've used today's ${AI_DAILY_LIMIT[kind]} AI ${kind === "image" ? "images" : "generations"}. It resets at midnight UTC.`,
      });
    }
  }

  let result: T;
  try {
    result = await work();
  } catch (error) {
    if (isAppError(error)) throw error;
    console.error("[ai]", error);
    throw new AppError(ErrorCodes.AI_GENERATION_FAILED, { message: friendlyProviderError(error) });
  }

  if (!who.unlimited) {
    const day = dayOf(now);
    await ctx.db.aiUsage.upsert({
      where: { userId_day: { userId: who.userId, day } },
      create: { userId: who.userId, day, [kind]: 1 },
      update: { [kind]: { increment: 1 } },
    });
  }
  return result;
}
