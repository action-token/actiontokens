import { Prisma } from "@bandcoin/db";
import { AppError, ErrorCodes } from "@bandcoin/errors";

import type { Context } from "../../context";

/**
 * A person's Studio coins. The balance and its ledger are written in one
 * transaction each time, so the balance always equals the confirmed entries
 * plus the coins held by runs still going (PENDING spends). Only the server
 * moves coins: top-ups (topup.ts), holds when a run starts, then either keeping
 * them (the run worked) or a refund entry (it failed).
 */
type ServiceCtx = Pick<Context, "db">;
type Tx = Prisma.TransactionClient;

export const LEDGER_PAGE = 25;

export async function studioBalance(ctx: ServiceCtx, userId: string) {
  const row = await ctx.db.studioBalance.findUnique({
    where: { userId },
    select: { balance: true },
  });
  return Number(row?.balance ?? 0);
}

/** The coin history, newest first: top-ups, spends (with their run) and refunds. */
export async function studioLedger(ctx: ServiceCtx, userId: string, cursor: string | null) {
  const rows = await ctx.db.studioLedgerEntry.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: LEDGER_PAGE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      kind: true,
      status: true,
      amount: true,
      note: true,
      txHash: true,
      createdAt: true,
      generation: { select: { id: true, type: true, prompt: true } },
    },
  });
  const page = rows.slice(0, LEDGER_PAGE);
  return {
    next: rows.length > LEDGER_PAGE ? (page.at(-1)?.id ?? null) : null,
    entries: page.map((row) => ({ ...row, amount: Number(row.amount) })),
  };
}

/** Adds coins with their ledger entry (a top-up, a bonus). */
export async function creditCoins(
  tx: Tx,
  input: {
    userId: string;
    coins: number;
    kind: "DEPOSIT" | "BONUS";
    note: string;
    txHash?: string | null;
  },
) {
  if (!(input.coins > 0)) return;
  await tx.studioLedgerEntry.create({
    data: {
      userId: input.userId,
      kind: input.kind,
      status: "CONFIRMED",
      amount: input.coins,
      note: input.note,
      txHash: input.txHash ?? null,
    },
  });
  await tx.studioBalance.upsert({
    where: { userId: input.userId },
    create: { userId: input.userId, balance: input.coins },
    update: { balance: { increment: input.coins } },
  });
}

/**
 * Takes a run's price from the balance before it starts. The balance only
 * goes down if it still covers the price at that moment, so two runs at once
 * can't spend the same coins.
 */
export async function holdCoins(
  ctx: ServiceCtx,
  input: { userId: string; generationId: string; coins: number; note: string },
) {
  return ctx.db.$transaction(async (tx) => {
    const { count } = await tx.studioBalance.updateMany({
      where: { userId: input.userId, balance: { gte: input.coins } },
      data: { balance: { decrement: input.coins } },
    });
    if (count !== 1)
      throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
        message: `This needs ${input.coins} coins. Top up in Studio › Coins.`,
      });
    const entry = await tx.studioLedgerEntry.create({
      data: {
        userId: input.userId,
        kind: "SPEND",
        status: "PENDING",
        amount: -input.coins,
        generationId: input.generationId,
        note: input.note,
      },
      select: { id: true },
    });
    return { entryId: entry.id };
  });
}

/**
 * Settles a held run: kept when it worked; when it failed, the spend still
 * shows and a refund entry gives the coins back. Settling twice does nothing.
 */
export async function settleHold(
  ctx: ServiceCtx,
  input: { entryId: string; outcome: "KEEP" | "REFUND"; note?: string },
) {
  return ctx.db.$transaction(async (tx) => {
    const { count } = await tx.studioLedgerEntry.updateMany({
      where: { id: input.entryId, kind: "SPEND", status: "PENDING" },
      data: { status: "CONFIRMED" },
    });
    if (count !== 1) return { settled: false as const };
    if (input.outcome === "REFUND") {
      const spend = await tx.studioLedgerEntry.findUniqueOrThrow({
        where: { id: input.entryId },
        select: { userId: true, amount: true, generationId: true },
      });
      const coins = -Number(spend.amount);
      await tx.studioLedgerEntry.create({
        data: {
          userId: spend.userId,
          kind: "REFUND",
          status: "CONFIRMED",
          amount: coins,
          generationId: spend.generationId,
          note: input.note ?? "The run didn't work, so its coins came back.",
        },
      });
      await tx.studioBalance.update({
        where: { userId: spend.userId },
        data: { balance: { increment: coins } },
      });
    }
    return { settled: true as const };
  });
}
