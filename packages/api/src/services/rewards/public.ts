import { AppError, ErrorCodes } from "@actiontokens/errors";

import type { Context } from "../../context";
import { type RoundKind, sharesFor } from "./distribute";
import { fromStroops } from "./shares";

type Round = Parameters<typeof sharesFor>[2];
type Ctx = Pick<Context, "db" | "chain">;

export const LEADERBOARD_PAGE = 50;

/** The rounds anyone can look at, newest first: the label, how many holders, whether it paid. */
export async function publicRounds(ctx: Ctx, kind: RoundKind) {
  const rows =
    kind === "origin"
      ? await ctx.db.originReward.findMany({ orderBy: { monthYear: "desc" }, take: 36 })
      : await ctx.db.quarterReward.findMany({
          orderBy: [{ year: "desc" }, { quarter: "desc" }],
          take: 24,
        });
  return rows.map((row) => ({
    id: row.id,
    label: "monthYear" in row ? row.monthYear : `${row.year} ${row.quarter}`,
    holders: Array.isArray(row.data) ? row.data.length : 0,
    pot: "totalBalance" in row ? row.totalBalance.toString() : null,
    rewardedAt: row.rewardedAt,
    updatedAt: row.lastUpdatedAt,
  }));
}

type OriginRow = { pubkey: string; plotBal: number; plots: unknown[] };
type QuarterRow = { accountId: string; action: number };

/**
 * One round as a ranked table: each holder, what they held, their share and whether it's paid.
 * Blocked wallets show with no share. A wallet search narrows it; pages of 50.
 */
export async function leaderboard(
  ctx: Ctx,
  kind: RoundKind,
  id: string,
  { search, page }: { search?: string; page: number },
) {
  const round = (
    kind === "origin"
      ? await ctx.db.originReward.findUnique({ where: { id } })
      : await ctx.db.quarterReward.findUnique({ where: { id } })
  ) as (Round & { rewardedAt: Date | null }) | null;
  if (!round)
    throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, {
      message: "This reward round doesn't exist.",
    });
  const share = new Map(
    (await sharesFor(ctx, kind, round)).map((s) => [s.pubkey, fromStroops(s.stroops)]),
  );
  const paid = new Set(round.completedUsers);
  const data = Array.isArray(round.data) ? round.data : [];
  const rows = (
    kind === "origin"
      ? (data as OriginRow[]).map((h) => ({
          wallet: h.pubkey,
          held: h.plotBal,
          plots: h.plots.length,
          weight: h.plotBal * h.plots.length,
        }))
      : (data as QuarterRow[]).map((h) => ({
          wallet: h.accountId,
          held: h.action,
          plots: null,
          weight: h.action,
        }))
  )
    .sort((a, b) => b.weight - a.weight)
    .map(({ weight: _weight, ...row }, index) => ({
      ...row,
      rank: index + 1,
      amount: share.get(row.wallet) ?? null,
      paid: paid.has(row.wallet),
    }));
  const needle = search?.trim().toUpperCase();
  const matched = needle ? rows.filter((row) => row.wallet.includes(needle)) : rows;
  const start = page * LEADERBOARD_PAGE;
  return {
    total: rows.length,
    matched: matched.length,
    rows: matched.slice(start, start + LEADERBOARD_PAGE),
    hasMore: start + LEADERBOARD_PAGE < matched.length,
    rewardedAt: round.rewardedAt,
  };
}

/** Who holds a token, biggest first (the top 200), from the network. */
export async function topHolders(ctx: Pick<Context, "chain">, code: string, issuer: string) {
  const { holders, complete } = await ctx.chain.assetHolders(code, issuer);
  const sorted = holders
    .filter((h) => Number(h.balance) > 0)
    .sort((a, b) => Number(b.balance) - Number(a.balance));
  return {
    total: sorted.length,
    complete,
    rows: sorted.slice(0, 200).map((h, index) => ({
      rank: index + 1,
      wallet: h.address,
      balance: h.balance,
    })),
  };
}
