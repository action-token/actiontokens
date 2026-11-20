import { AppError, ErrorCodes } from "@actiontokens/errors";

import type { Context } from "../../context";
import { enqueueJob } from "../jobs/queue";
import { type RoundKind, sharesFor } from "./distribute";
import { fromStroops } from "./shares";

type ServiceCtx = Pick<Context, "db">;
type Round = Parameters<typeof sharesFor>[2];

const missing = () =>
  new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "This reward round doesn't exist." });
const refuse = (message: string) => new AppError(ErrorCodes.PRECONDITION_NOT_MET, { message });

const findRound = (ctx: ServiceCtx, kind: RoundKind, id: string) =>
  kind === "origin"
    ? ctx.db.originReward.findUnique({ where: { id } })
    : ctx.db.quarterReward.findUnique({ where: { id } });

const blockedTable = (ctx: ServiceCtx, kind: RoundKind) =>
  // The two block lists have the same shape.
  (kind === "origin"
    ? ctx.db.originBlockedUser
    : ctx.db.quarterBlockedUser) as typeof ctx.db.originBlockedUser;

/** Rounds newest first, with how far paying has got. */
export async function listRounds(ctx: ServiceCtx, kind: RoundKind) {
  const rows =
    kind === "origin"
      ? await ctx.db.originReward.findMany({ orderBy: { monthYear: "desc" }, take: 60 })
      : await ctx.db.quarterReward.findMany({
          orderBy: [{ year: "desc" }, { quarter: "desc" }],
          take: 60,
        });
  const jobIds = rows.flatMap((row) => (row.jobId ? [row.jobId] : []));
  const jobs = jobIds.length
    ? await ctx.db.job.findMany({
        where: { id: { in: jobIds } },
        select: { id: true, status: true, attempts: true, lastError: true },
      })
    : [];
  const jobById = new Map(jobs.map((job) => [job.id, job]));
  return rows.map(({ data, ...row }) => ({
    ...row,
    holders: Array.isArray(data) ? data.length : 0,
    paid: row.completedUsers.length,
    job: row.jobId ? (jobById.get(row.jobId) ?? null) : null,
  }));
}

/** One round with each wallet's computed share, for the admin to check before paying. */
export async function roundDetail(ctx: Pick<Context, "db" | "chain">, kind: RoundKind, id: string) {
  const round = await findRound(ctx, kind, id);
  if (!round) throw missing();
  const shares = await sharesFor(ctx, kind, round as Round);
  const paid = new Set(round.completedUsers);
  const { data: _data, ...summary } = round;
  return {
    round: summary,
    shares: shares.map((share) => ({
      wallet: share.pubkey,
      amount: fromStroops(share.stroops),
      paid: paid.has(share.pubkey),
    })),
    total: fromStroops(shares.reduce((sum, share) => sum + share.stroops, 0n)),
  };
}

/** Sets aside the month's pot. Only before it's paid. */
export async function setOriginPot(ctx: ServiceCtx, monthYear: string, amount: string) {
  const existing = await ctx.db.originReward.findUnique({ where: { monthYear } });
  if (existing?.isDistributed) throw refuse("This month is already paid; its pot can't change.");
  return ctx.db.originReward.upsert({
    where: { monthYear },
    create: { monthYear, totalBalance: amount },
    update: { totalBalance: amount, lastUpdatedAt: new Date() },
    select: { id: true, monthYear: true, totalBalance: true },
  });
}

/** Queues the worker to find holders. One at a time per kind. */
export async function queueSync(ctx: ServiceCtx, kind: RoundKind) {
  const job = await enqueueJob(ctx.db, "rewards.sync", { kind }, { dedupe: true, maxAttempts: 2 });
  return { jobId: job.id };
}

/**
 * Queues the worker to pay a round. A round with a payment job already waiting or running isn't
 * started twice; after a failed run, starting again carries on where it stopped.
 */
export async function queuePayout(ctx: ServiceCtx, kind: RoundKind, id: string) {
  const round = await findRound(ctx, kind, id);
  if (!round) throw missing();
  if (round.isDistributed) throw refuse("This round is already paid.");
  if (!Array.isArray(round.data) || round.data.length === 0)
    throw refuse("This round has no holders yet. Run a sync first.");
  if ("totalBalance" in round && Number(round.totalBalance) <= 0)
    throw refuse("Set the month's pot before paying.");
  if (round.jobId) {
    const job = await ctx.db.job.findUnique({
      where: { id: round.jobId },
      select: { status: true },
    });
    if (job && (job.status === "QUEUED" || job.status === "RUNNING"))
      throw refuse("Paying this round is already in progress.");
  }
  const job = await enqueueJob(
    ctx.db,
    "rewards.distribute",
    { kind, id },
    { dedupe: true, maxAttempts: 5 },
  );
  if (kind === "origin")
    await ctx.db.originReward.update({ where: { id }, data: { jobId: job.id } });
  else await ctx.db.quarterReward.update({ where: { id }, data: { jobId: job.id } });
  return { jobId: job.id };
}

export const listBlocked = (ctx: ServiceCtx, kind: RoundKind) =>
  blockedTable(ctx, kind).findMany({ orderBy: { blockedAt: "desc" } });

export async function blockWallet(
  ctx: ServiceCtx,
  kind: RoundKind,
  input: { walletAddress: string; reason?: string },
) {
  const table = blockedTable(ctx, kind);
  if (await table.findUnique({ where: { walletAddress: input.walletAddress } }))
    throw refuse("This wallet is already blocked.");
  return table.create({ data: input });
}

export async function unblockWallet(ctx: ServiceCtx, kind: RoundKind, id: string) {
  const table = blockedTable(ctx, kind);
  if (!(await table.findUnique({ where: { id } })))
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "This block doesn't exist." });
  await table.delete({ where: { id } });
  return { ok: true };
}

/** What a wallet is owed (or was paid) in recent rounds, for the holder's own "my rewards" page. */
export async function myRewards(ctx: Pick<Context, "db" | "chain">, wallet: string) {
  const out: { kind: RoundKind; label: string; amount: string; paid: boolean; blocked: boolean }[] =
    [];
  for (const kind of ["origin", "quarter"] as const) {
    const rows =
      kind === "origin"
        ? await ctx.db.originReward.findMany({ orderBy: { monthYear: "desc" }, take: 6 })
        : await ctx.db.quarterReward.findMany({
            orderBy: [{ year: "desc" }, { quarter: "desc" }],
            take: 6,
          });
    const blocked = (await blockedTable(ctx, kind).count({ where: { walletAddress: wallet } })) > 0;
    for (const row of rows) {
      const mine = (await sharesFor(ctx, kind, row as Round)).find((s) => s.pubkey === wallet);
      const listed =
        Array.isArray(row.data) &&
        row.data.some((h) => {
          const holder = h as { pubkey?: string; accountId?: string };
          return holder.pubkey === wallet || holder.accountId === wallet;
        });
      if (!mine && !listed) continue;
      out.push({
        kind,
        label: "monthYear" in row ? row.monthYear : `${row.year} ${row.quarter}`,
        amount: fromStroops(mine?.stroops ?? 0n),
        paid: row.completedUsers.includes(wallet),
        blocked,
      });
    }
  }
  return out;
}
