import type { Context } from "../../context";
import { COIN_USD, loadPricing } from "../studio/pricing";
import { MODELS } from "../studio/models";

/**
 * Admin › Studio earnings: what the platform makes on Studio runs, worked out from the coin
 * ledger. A run's price is the provider's cost plus the fee set in Admin › Settings, so the
 * provider's part of each coin spent is 1 / (1 + fee) and the platform's the rest (rounding up to
 * whole coins adds a little to it). That makes the provider cost an estimate; the provider's own
 * invoice is the real figure. Bonus coins are given away, so their value comes out of the platform's
 * share once they are spent.
 */
type ReportCtx = Pick<Context, "db">;

const cents = (usd: number) => Math.round(usd * 100) / 100;

const KIND_NAME: Record<string, string> = {
  MUSIC: "Music",
  IMAGE: "Images",
  VIDEO: "Video",
  TEXT: "Writing",
  SEO: "SEO",
  SOCIAL: "Social",
};

type LedgerRow = {
  kind: string;
  amount: unknown;
  generation: { model: string | null; type: string } | null;
};

export async function studioEarnings(
  ctx: ReportCtx,
  { days, now = new Date() }: { days?: number; now?: Date } = {},
) {
  const since = days ? { gte: new Date(now.getTime() - days * 86_400_000) } : undefined;
  const window = since ? { createdAt: since } : {};

  const [pricing, spent, other, held] = await Promise.all([
    loadPricing(ctx),
    ctx.db.studioLedgerEntry.findMany({
      where: { status: "CONFIRMED", kind: { in: ["SPEND", "REFUND"] }, ...window },
      select: { kind: true, amount: true, generation: { select: { model: true, type: true } } },
    }) as Promise<LedgerRow[]>,
    ctx.db.studioLedgerEntry.groupBy({
      by: ["kind"],
      where: { status: "CONFIRMED", kind: { in: ["DEPOSIT", "BONUS", "WITHDRAW"] }, ...window },
      _sum: { amount: true },
    }),
    ctx.db.studioBalance.aggregate({ _sum: { balance: true } }),
  ]);

  const providerShare = 1 / (1 + pricing.feePercent / 100);
  const names = new Map(MODELS.map((model) => [model.id, model.name]));

  const byKey = new Map<
    string,
    { runs: number; refunds: number; charged: number; refunded: number; type: string }
  >();
  for (const row of spent) {
    const key = row.generation?.model ?? row.generation?.type ?? "unknown";
    const entry = byKey.get(key) ?? {
      runs: 0,
      refunds: 0,
      charged: 0,
      refunded: 0,
      type: row.generation?.type ?? "",
    };
    const coins = Math.abs(Number(row.amount));
    if (row.kind === "SPEND") {
      entry.runs += 1;
      entry.charged += coins;
    } else {
      entry.refunds += 1;
      entry.refunded += coins;
    }
    byKey.set(key, entry);
  }

  const models = [...byKey.entries()]
    .map(([key, entry]) => {
      const netCoins = entry.charged - entry.refunded;
      const usd = netCoins * COIN_USD;
      return {
        key,
        name: names.get(key) ?? KIND_NAME[key] ?? key,
        runs: entry.runs,
        refunds: entry.refunds,
        chargedCoins: entry.charged,
        refundedCoins: entry.refunded,
        netCoins,
        providerCostUsd: cents(usd * providerShare),
        platformUsd: cents(usd - usd * providerShare),
      };
    })
    .sort((a, b) => b.netCoins - a.netCoins);

  const sum = (kind: string) => Number(other.find((row) => row.kind === kind)?._sum.amount ?? 0);
  const spentCoins = models.reduce((total, row) => total + row.netCoins, 0);
  const bonusCoins = sum("BONUS");
  const platformUsd = cents(spentCoins * COIN_USD * (1 - providerShare));

  return {
    days: days ?? null,
    feePercent: pricing.feePercent,
    models,
    totals: {
      moneyInUsd: cents(sum("DEPOSIT") * COIN_USD),
      bonusCoins,
      withdrawnCoins: Math.abs(sum("WITHDRAW")),
      spentCoins,
      providerCostUsd: cents(spentCoins * COIN_USD * providerShare),
      platformUsd,
      afterBonusesUsd: cents(platformUsd - bonusCoins * COIN_USD),
      heldCoins: Number(held._sum.balance ?? 0),
    },
  };
}
