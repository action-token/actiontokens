import type { Context } from "../../context";
import { settleHold } from "./balance";

/**
 * How any Studio run ends: its held coins are kept when it worked and given
 * back (once) when it didn't. Shared by music and the other generators.
 */
type Db = Pick<Context, "db">;

async function heldEntry(ctx: Db, generationId: string) {
  const entry = await ctx.db.studioLedgerEntry.findFirst({
    where: { generationId, kind: "SPEND", status: "PENDING" },
    select: { id: true },
  });
  return entry?.id ?? null;
}

/** Keeps the coins held for a run that worked. */
export async function keepRun(ctx: Db, generationId: string) {
  const entryId = await heldEntry(ctx, generationId);
  if (entryId) await settleHold(ctx, { entryId, outcome: "KEEP" });
}

/** Ends a run that didn't work and gives its coins back (once). */
export async function failRun(ctx: Db, generationId: string, reason: string) {
  await ctx.db.generation.update({
    where: { id: generationId },
    data: { status: "FAILED", error: reason.slice(0, 500), progress: null },
  });
  const entryId = await heldEntry(ctx, generationId);
  if (entryId)
    await settleHold(ctx, {
      entryId,
      outcome: "REFUND",
      note: "The run didn't work, so its coins came back.",
    });
}
