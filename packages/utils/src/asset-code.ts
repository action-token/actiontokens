/** Currencies the platform itself issues or accepts; an artist's item can't take their names. */
const RESERVED = new Set(["BANDCOIN", "XLM", "USDC", "USD"]);

/** A code suggestion from a title or name: letters and numbers only, up to 12. */
export const assetCodeFrom = (text: string) =>
  normalizeAssetCode(text.normalize("NFKD").replace(/[^A-Za-z0-9]/g, "")).slice(0, 12);

export const normalizeAssetCode = (raw: string) => raw.trim().toUpperCase();

/** null when `code` can be a Stellar asset code for an item, otherwise what to tell the artist. */
export function validateAssetCode(code: string): string | null {
  if (code.length === 0) return "Enter a code";
  if (code.length > 12) return "Use at most 12 characters";
  if (!/^[A-Za-z0-9]+$/.test(code)) return "Use only letters and numbers";
  if (RESERVED.has(code.toUpperCase())) return "That code is reserved";
  return null;
}

/** The biggest price (in whole units) an item may have, so stroop math never overflows. */
const MAX_PRICE = 10_000_000_000n;

/** null when `price` is a positive amount with at most 7 decimals, otherwise what to tell the artist. */
export function validatePrice(price: string): string | null {
  if (!/^\d+(\.\d+)?$/.test(price)) return "Enter a valid price";
  const [whole = "", fraction = ""] = price.split(".");
  if (fraction.length > 7) return "Use at most 7 decimals";
  if (BigInt(whole) >= MAX_PRICE) return "That price is too high";
  if (BigInt(whole) === 0n && /^0*$/.test(fraction)) return "Enter a price above zero";
  return null;
}
