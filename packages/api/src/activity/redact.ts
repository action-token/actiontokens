/**
 * Request input as it is stored in the activity log: secrets, signed
 * transactions, card tokens and passwords are replaced, emails are masked,
 * and anything huge is cut, so admins see what happened without the log
 * becoming a place secrets leak from.
 */

const SECRET_KEY =
  /secret|password|passphrase|token|xdr|signature|private|mnemonic|seed|sourceId|cardNonce|apiKey/i;
const EMAIL_KEY = /email/i;
const MAX_STRING = 300;
const MAX_ITEMS = 50;
const MAX_DEPTH = 6;

export const REDACTED = "[redacted]";

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (depth > MAX_DEPTH) return "[too deep]";
  if (typeof value === "string") return clip(maskStellarSecret(value));
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ITEMS).map((item) => redact(item, depth + 1));
    return value.length > MAX_ITEMS ? [...items, `[+${value.length - MAX_ITEMS} more]`] : items;
  }

  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    if (SECRET_KEY.test(key))
      out[key] = field === undefined || field === null ? (field ?? null) : REDACTED;
    else if (EMAIL_KEY.test(key) && typeof field === "string") out[key] = maskEmail(field);
    else out[key] = redact(field, depth + 1);
  }
  return out;
}

/** "nadia@demo.bandcoin.io" → "n***@demo.bandcoin.io" */
export function maskEmail(email: string) {
  const at = email.indexOf("@");
  return at < 1 ? REDACTED : `${email[0]}***${email.slice(at)}`;
}

/** A Stellar secret key pasted into any field is never stored. */
const maskStellarSecret = (text: string) => text.replace(/\bS[A-Z2-7]{55}\b/g, REDACTED);

const clip = (text: string) => (text.length > MAX_STRING ? `${text.slice(0, MAX_STRING)}…` : text);
