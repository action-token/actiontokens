import type { GenerationType } from "@bandcoin/db";

import type { Context } from "../../context";

/**
 * A person's own Studio numbers for the Coins page, from the coin ledger and
 * their runs, over the last `days` (or everything when left out):
 *
 *   spent      coins charged for runs minus coins refunded (a failed run is
 *              refunded). Only settled entries; a run still going isn't in yet.
 *   bought     coins from top-ups. Bonus coins are given, so they're apart;
 *              coins carried over from the old credits are neither.
 *   creations  runs that started in the period and finished successfully
 *              (a live jam is one run).
 *   byTool     the same per tool, most coins first. Spending on a run since
 *              removed from the Library has no tool left: `type` is null.
 */
type ServiceCtx = Pick<Context, "db">;
const DAY = 86_400_000;

export async function studioUsage(
  ctx: ServiceCtx,
  userId: string,
  { days, now = new Date() }: { days?: number; now?: Date } = {},
) {
  const window = days ? { createdAt: { gte: new Date(now.getTime() - days * DAY) } } : {};
  const [charges, money, runs] = await Promise.all([
    ctx.db.studioLedgerEntry.findMany({
      where: { userId, status: "CONFIRMED", kind: { in: ["SPEND", "REFUND"] }, ...window },
      select: { kind: true, amount: true, generation: { select: { type: true } } },
    }),
    ctx.db.studioLedgerEntry.groupBy({
      by: ["kind"],
      where: { userId, status: "CONFIRMED", kind: { in: ["DEPOSIT", "BONUS"] }, ...window },
      _sum: { amount: true },
    }),
    ctx.db.generation.groupBy({
      by: ["type"],
      where: { userId, status: "SUCCEEDED", ...window },
      _count: { _all: true },
    }),
  ]);

  const tools = new Map<GenerationType | null, { creations: number; spent: number }>();
  const toolOf = (type: GenerationType | null) => {
    const row = tools.get(type) ?? { creations: 0, spent: 0 };
    tools.set(type, row);
    return row;
  };
  for (const run of runs) toolOf(run.type).creations += run._count._all;
  for (const entry of charges) {
    // A spend is stored negative and a refund positive: both as plain coins here.
    const coins = Math.abs(Number(entry.amount));
    toolOf(entry.generation?.type ?? null).spent += entry.kind === "SPEND" ? coins : -coins;
  }

  const sumOf = (kind: "DEPOSIT" | "BONUS") =>
    Number(money.find((row) => row.kind === kind)?._sum.amount ?? 0);
  const byTool = [...tools.entries()]
    .map(([type, row]) => ({ type, ...row }))
    .filter((row) => row.creations > 0 || row.spent !== 0)
    .sort((a, b) => b.spent - a.spent || b.creations - a.creations);
  return {
    spent: byTool.reduce((total, row) => total + row.spent, 0),
    bought: sumOf("DEPOSIT"),
    bonus: sumOf("BONUS"),
    creations: byTool.reduce((total, row) => total + row.creations, 0),
    byTool,
  };
}
