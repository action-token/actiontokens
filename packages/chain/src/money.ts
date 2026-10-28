/**
 * Exact money math. Stellar amounts have 7 decimals, so every amount is held
 * as a bigint count of stroops (1 unit = 10 000 000 stroops) and only turned
 * back into a string at the edges. No floats ever touch a price.
 */

export const STROOPS_PER_UNIT = 10_000_000n;

const AMOUNT_PATTERN = /^(\d+)(?:\.(\d{1,7}))?$/;

/** "12.5", 12.5 or a Prisma Decimal → stroops. Throws on negatives or more than 7 decimals. */
export function toStroops(value: string | number | { toString(): string }): bigint {
  const text = typeof value === "number" ? numberToText(value) : value.toString().trim();
  const match = AMOUNT_PATTERN.exec(text);
  if (!match) throw new RangeError(`Not a valid amount: "${text}"`);
  const [, whole = "0", fraction = ""] = match;
  return BigInt(whole) * STROOPS_PER_UNIT + BigInt(fraction.padEnd(7, "0"));
}

function numberToText(value: number) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`Not a valid amount: ${value}`);
  // toFixed(7) rounds to the stroop; strip the noise floats add (0.1 + 0.2).
  return value.toFixed(7);
}

/** Stroops → "12.5000000", the form Stellar operations take. */
export function toAmount(stroops: bigint): string {
  if (stroops < 0n) throw new RangeError("Amounts can't be negative");
  const whole = stroops / STROOPS_PER_UNIT;
  const fraction = (stroops % STROOPS_PER_UNIT).toString().padStart(7, "0");
  return `${whole}.${fraction}`;
}

/** Stroops → "12.5", trailing zeros trimmed, for display and JSON. */
export function toDisplay(stroops: bigint): string {
  return toAmount(stroops).replace(/\.?0+$/, "");
}

/** `amount × bps / 10 000`, rounded up so a fee never comes out a stroop short. */
export function applyBps(amount: bigint, bps: number): bigint {
  if (!Number.isInteger(bps) || bps < 0 || bps > 10_000) throw new RangeError(`Bad bps: ${bps}`);
  return ceilDiv(amount * BigInt(bps), 10_000n);
}

/**
 * A USD amount in another currency, given USD per unit of it.
 * Rounded up to the stroop so the payer never under-pays.
 */
export function usdTo(usd: bigint, usdPerUnit: bigint): bigint {
  if (usdPerUnit <= 0n) throw new RangeError("Exchange rate must be positive");
  return ceilDiv(usd * STROOPS_PER_UNIT, usdPerUnit);
}

/** An amount of another currency in USD, given USD per unit of it. Rounded up. */
export function toUsd(amount: bigint, usdPerUnit: bigint): bigint {
  if (usdPerUnit <= 0n) throw new RangeError("Exchange rate must be positive");
  return ceilDiv(amount * usdPerUnit, STROOPS_PER_UNIT);
}

/** Cents for a card charge, rounded up. */
export function toCents(usd: bigint): number {
  return Number(ceilDiv(usd, 100_000n));
}

export const sum = (amounts: bigint[]) => amounts.reduce((total, amount) => total + amount, 0n);

const ceilDiv = (a: bigint, b: bigint) => (a + b - 1n) / b;
