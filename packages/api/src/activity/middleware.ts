import { isAppError } from "@bandcoin/errors";
import type { Prisma } from "@bandcoin/db";

import type { Context } from "../context";
import { redact } from "./redact";

/**
 * Writes one ActivityLog row after every mutation, whether it worked or not.
 * It sits on the base procedure, so no mutation can skip it. Logging never
 * breaks the request: a failed write is reported and the response goes out.
 */
export async function logActivity<
  R extends { ok: boolean; error?: { cause?: unknown; code?: string } },
>(opts: {
  ctx: Context;
  type: "query" | "mutation" | "subscription";
  path: string;
  getRawInput: () => Promise<unknown>;
  next: () => Promise<R>;
}): Promise<R> {
  if (opts.type !== "mutation") return opts.next();

  const startedAt = Date.now();
  const result = await opts.next();
  const { ctx } = opts;
  const user = ctx.session?.user;
  const facts = ctx.activity.facts();
  const cause = result.ok ? undefined : result.error?.cause;

  try {
    await ctx.db.activityLog.create({
      data: {
        actorId: user?.id ?? null,
        actorRole: ctx.app === "worker" ? "SYSTEM" : (user?.role ?? "GUEST"),
        action: opts.path,
        targetType: facts.targetType ?? null,
        targetId: facts.targetId ?? null,
        input: redact(await opts.getRawInput().catch(() => null)) as Prisma.InputJsonValue,
        status: result.ok ? "SUCCESS" : "FAILED",
        errorCode: result.ok
          ? null
          : isAppError(cause)
            ? cause.code
            : (result.error?.code ?? "INTERNAL"),
        txHash: facts.txHash ?? null,
        amount: facts.amount ?? null,
        currency: facts.currency ?? null,
        app: ctx.app,
        ip: ctx.ip,
        userAgent: ctx.userAgent?.slice(0, 300) ?? null,
        requestId: ctx.requestId,
        durationMs: Date.now() - startedAt,
      },
    });
  } catch (error) {
    console.error("[activity] couldn't write the log row", { action: opts.path, error });
  }
  return result;
}
