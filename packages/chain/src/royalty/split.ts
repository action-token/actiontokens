import { applyBps, sum, toAmount, toStroops } from "../money";

export type Holder = { address: string; balance: string };
export type RoyaltyShare = { address: string; balance: string; amount: string };

/**
 * Splits a royalty pool among token holders by their share of the TOTAL supply,
 * not of what has been sold: a token is worth pool ÷ supply to whoever holds it,
 * and the share of tokens nobody bought stays with the artist.
 *
 * Exact integer math in stroops, rounded down, so the shares never add up to
 * more than the pool. Holders who'd get nothing are left out.
 */
export function splitRoyalty(input: { pool: string; supply: number; holders: Holder[] }): {
  shares: RoyaltyShare[];
  paid: string;
  kept: string;
} {
  if (!Number.isInteger(input.supply) || input.supply < 1)
    throw new RangeError("Supply must be a whole number of at least 1");
  const pool = toStroops(input.pool);
  const supply = toStroops(input.supply);

  const shares = input.holders.flatMap((holder) => {
    const balance = toStroops(holder.balance);
    // A balance above the supply can only be bad data; never pay more than the whole pool.
    const capped = balance > supply ? supply : balance;
    const amount = (pool * capped) / supply;
    return amount > 0n
      ? [{ address: holder.address, balance: holder.balance, amount: toAmount(amount) }]
      : [];
  });
  const paid = sum(shares.map((share) => toStroops(share.amount)));
  return { shares, paid: toAmount(paid), kept: toAmount(pool - paid) };
}

/** The pool a revenue figure creates: revenue × the share the item gives holders (a percent, up to 2 decimals). */
export function royaltyPool(revenue: string, percent: string): string {
  return toAmount(applyBps(toStroops(revenue), Math.round(Number(percent) * 100)));
}
