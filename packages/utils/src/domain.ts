/**
 * What an artist may type as a custom domain (plan 32). Shared by the API and
 * the portal, so the artist sees the same rule as they type.
 */

/** Action Tokens' own names, and hosting names that aren't the artist's. */
const RESERVED_SUFFIXES = ["action-tokens.com", "vercel.app", "sslip.io", "localhost"];

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * "https://WWW.Coldplay.com/music/" → "coldplay.com". A leading "www." is
 * dropped: a root domain is stored bare and its www is added as a redirect.
 */
export function normalizeDomain(raw: string) {
  let text = raw.trim().toLowerCase();
  text = text.replace(/^[a-z]+:\/\//, "");
  text = text.split(/[/?#]/)[0] ?? "";
  text = text.replace(/:\d+$/, "").replace(/\.$/, "");
  if (text.startsWith("www.")) text = text.slice(4);
  return text;
}

/** A plain reason the domain can't be used, or null when it can. */
export function validateDomain(domain: string, ownHosts: string[] = []): string | null {
  if (!domain) return "Type your domain, like yourname.com";
  if (domain.length > 253) return "That domain is too long";
  const labels = domain.split(".");
  if (labels.length < 2) return "Type the whole domain, like yourname.com";
  if (!labels.every((label) => LABEL.test(label))) {
    return "Use only letters, numbers, dashes and dots";
  }
  if (!/^[a-z]{2,}$/.test(labels.at(-1)!) && !labels.at(-1)!.startsWith("xn--")) {
    return "That doesn't end like a real domain";
  }
  const reserved = [...RESERVED_SUFFIXES, ...ownHosts.map(normalizeDomain)];
  if (reserved.some((own) => own && (domain === own || domain.endsWith(`.${own}`)))) {
    return "That's an Action Tokens address, not your own domain";
  }
  return null;
}
