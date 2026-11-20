import { AppError, ErrorCodes } from "@actiontokens/errors";

import type { Context } from "../../context";
import { monthYearOf, quarterOf, rewardAssets } from "./config";

type ServiceCtx = Pick<Context, "db" | "chain">;

const incomplete = () =>
  new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
    message: "Too many holders to list safely; nothing was changed.",
  });

type Plot = { asset_code: string; asset_issuer: string; balance: string };
export type OriginHolderRow = { pubkey: string; plotBal: number; plots: Plot[] };

/**
 * Finds who holds PLOT land NFTs this month and what they hold, and saves it on the month's round
 * (the pot is set separately by an admin). Replaces the old admin screen that took holder lists
 * from the browser. A round already paid is never touched.
 */
export async function syncOriginHolders(ctx: ServiceCtx, now = new Date()) {
  const assets = rewardAssets(ctx);
  const monthYear = monthYearOf(now);
  const existing = await ctx.db.originReward.findUnique({ where: { monthYear } });
  if (existing?.isDistributed)
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: "This month's reward is already paid.",
    });

  const distributor = await ctx.chain.loadAccount(assets.plotDistributor);
  const nfts = (distributor?.balances ?? []).flatMap((balance) =>
    "asset_code" in balance &&
    balance.asset_type === "credit_alphanum12" &&
    /^PLOT\d{5}$/.test(balance.asset_code)
      ? [{ code: balance.asset_code, issuer: balance.asset_issuer, balance: balance.balance }]
      : [],
  );

  const byHolder = new Map<string, Plot[]>();
  for (const nft of nfts) {
    const { holders, complete } = await ctx.chain.assetHolders(nft.code, nft.issuer);
    if (!complete) throw incomplete();
    for (const holder of holders) {
      if (holder.address === assets.plotDistributor) continue;
      byHolder.set(holder.address, [
        ...(byHolder.get(holder.address) ?? []),
        { asset_code: nft.code, asset_issuer: nft.issuer, balance: nft.balance },
      ]);
    }
  }

  const data: OriginHolderRow[] = [];
  for (const [pubkey, plots] of byHolder) {
    const account = await ctx.chain.loadAccount(pubkey);
    const plotBal = Number(
      account?.balances.find(
        (b) =>
          "asset_code" in b &&
          b.asset_code === assets.plot.code &&
          b.asset_issuer === assets.plot.issuer,
      )?.balance ?? 0,
    );
    if (plotBal > 0) data.push({ pubkey, plotBal, plots });
  }

  await ctx.db.originReward.upsert({
    where: { monthYear },
    create: { monthYear, data },
    update: { data, lastUpdatedAt: now },
  });
  return { monthYear, holders: data.length };
}

/** A wallet's balance of the reward token on each recorded day: [[unixSeconds, "stroops"], …]. */
export type BalanceHistory = (
  accountId: string,
  asset: { code: string; issuer: string },
) => Promise<[number, string][]>;

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/** The least a wallet held over the last 90 days (0 with no history): that, not today's balance, is what's rewarded. */
export function minimumHeld(history: [number, string][], now: number): number {
  const recent = history.filter(([seconds]) => seconds * 1000 >= now - NINETY_DAYS_MS);
  if (recent.length === 0) return 0;
  return Math.min(...recent.map(([, stroops]) => Number(stroops))) / 1e7;
}

/**
 * The quarter's holders of the reward token and the least each held over the last 90 days. The
 * history comes from stellar.expert (mainnet only), behind `history` so tests and other sources
 * can replace it. A round already paid is never touched.
 */
export async function syncQuarterHolders(
  ctx: ServiceCtx,
  history: BalanceHistory,
  now = new Date(),
) {
  const { action } = rewardAssets(ctx);
  const { year, quarter } = quarterOf(now);
  const existing = await ctx.db.quarterReward.findUnique({
    where: { year_quarter: { year, quarter } },
  });
  if (existing?.isDistributed)
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: "This quarter's reward is already paid.",
    });

  const { holders, complete } = await ctx.chain.assetHolders(action.code, action.issuer);
  if (!complete) throw incomplete();

  const data: { accountId: string; action: number }[] = [];
  for (const holder of holders) {
    const held = minimumHeld(await history(holder.address, action), now.getTime());
    if (held > 0) data.push({ accountId: holder.address, action: held });
  }

  await ctx.db.quarterReward.upsert({
    where: { year_quarter: { year, quarter } },
    create: { year, quarter, data },
    update: { data, lastUpdatedAt: now },
  });
  return { year, quarter, holders: data.length };
}

/** stellar.expert's balance history, retried politely when it says slow down. */
export const stellarExpertHistory: BalanceHistory = async (accountId, asset) => {
  const url = `https://api.stellar.expert/explorer/public/account/${accountId}/balance/${asset.code}-${asset.issuer}/history`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (response.ok) return (await response.json()) as [number, string][];
    if (response.status !== 429)
      throw new AppError(ErrorCodes.EXTERNAL_SERVICE_FAILED, {
        message: `stellar.expert answered ${response.status} for a balance history.`,
      });
    const wait = Number(response.headers.get("retry-after")) || 1;
    await new Promise((resolve) => setTimeout(resolve, (2 ** attempt + wait) * 1000));
  }
  throw new AppError(ErrorCodes.EXTERNAL_SERVICE_FAILED, {
    message: "stellar.expert kept asking to slow down.",
  });
};
