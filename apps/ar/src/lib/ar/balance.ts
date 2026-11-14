/**
 * How the map's profile capsule writes a BANDCOIN balance (plan 46): in full up to 100,000
 * (two decimals at most), compact above ("1.2M"). Null when it couldn't be read.
 */
export function formatCapsuleBalance(balance: string | number | null | undefined): string | null {
  const value = Number(balance);
  if (balance === null || balance === undefined || balance === "" || !Number.isFinite(value))
    return null;
  const compact = value >= 100_000;
  return value.toLocaleString("en-US", {
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 2,
  });
}
