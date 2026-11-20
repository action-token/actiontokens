/**
 * Who gets how much. Amounts are whole stroops (1 unit = 10,000,000), so splitting a pot never
 * drifts: the shares add up to the pot exactly (the leftover stroops go to the largest remainders).
 */
const STROOPS = 10_000_000n;

export type Share = { pubkey: string; stroops: bigint };

export const toStroops = (value: string | number): bigint => {
  const [whole = "0", fraction = ""] = String(value).split(".");
  return BigInt(whole) * STROOPS + BigInt(fraction.padEnd(7, "0").slice(0, 7) || "0");
};

/** "12.5000000": the 7 decimals Stellar wants. */
export const fromStroops = (stroops: bigint): string => {
  const whole = stroops / STROOPS;
  const fraction = (stroops % STROOPS).toString().padStart(7, "0");
  return `${whole}.${fraction}`;
};

export type OriginHolder = { pubkey: string; plotBal: number; plots: unknown[] };

/**
 * The monthly reward: a holder's weight is plotBal × plots held; the pot is split by weight.
 * Blocked wallets are left out before splitting, so their share goes to everyone else.
 */
export function originShares(
  holders: OriginHolder[],
  blocked: ReadonlySet<string>,
  pot: bigint,
): Share[] {
  const eligible = holders
    .filter((holder) => !blocked.has(holder.pubkey))
    .map((holder) => ({
      pubkey: holder.pubkey,
      weight: toStroops(holder.plotBal) * BigInt(holder.plots.length),
    }))
    .filter((holder) => holder.weight > 0n);
  const total = eligible.reduce((sum, holder) => sum + holder.weight, 0n);
  if (total === 0n || pot <= 0n) return eligible.map(({ pubkey }) => ({ pubkey, stroops: 0n }));

  const parts = eligible.map((holder) => {
    const exact = holder.weight * pot;
    return { pubkey: holder.pubkey, stroops: exact / total, remainder: exact % total };
  });
  let left = pot - parts.reduce((sum, part) => sum + part.stroops, 0n);
  for (const part of [...parts].sort((a, b) =>
    b.remainder > a.remainder ? 1 : b.remainder < a.remainder ? -1 : 0,
  )) {
    if (left <= 0n) break;
    part.stroops += 1n;
    left -= 1n;
  }
  return parts.map(({ pubkey, stroops }) => ({ pubkey, stroops }));
}

export type QuarterHolder = { accountId: string; action: number };

/** The quarterly reward: one reward unit for every 1,000 ACTION held at the least over 90 days. */
export function quarterShares(holders: QuarterHolder[], blocked: ReadonlySet<string>): Share[] {
  return holders
    .filter((holder) => !blocked.has(holder.accountId))
    .map((holder) => ({ pubkey: holder.accountId, stroops: toStroops(holder.action) / 1000n }));
}
