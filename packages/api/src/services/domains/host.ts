/**
 * Where custom domains are attached: the hosting of the fan app (plan 32).
 * Each host is one adapter; the rest of the feature only sees this shape, so
 * moving hosts means writing one more adapter and changing DOMAIN_HOST.
 */

/** One DNS record the artist adds at their registrar. */
export type DnsRecord = {
  type: string;
  /** The full name, e.g. "coldplay.com" or "_vercel.coldplay.com" */
  name: string;
  value: string;
  /** "ownership" proves the domain is theirs; "point" sends visitors to Bandcoin */
  purpose: "ownership" | "point";
};

export type HostDomainStatus = {
  /** False when the host no longer has the domain at all */
  found: boolean;
  /** The host accepts that the domain is the artist's */
  verified: boolean;
  /** DNS points at the host and it can issue SSL */
  configured: boolean;
  records: DnsRecord[];
  /** The host's own words when something is wrong */
  error: string | null;
};

export type DomainHost = {
  /** "vercel", "manual"… shown to admins */
  name: string;
  /** False when custom domains can't be connected (no host set up) */
  available: boolean;
  /** Attaches the domain; a root domain also gets www redirecting to it. */
  add(domain: string): Promise<{ withWww: boolean }>;
  status(domain: string, opts: { withWww: boolean }): Promise<HostDomainStatus>;
  /** Detaches it (and its www); a domain the host doesn't have is fine. */
  remove(domain: string): Promise<void>;
};

/** A host refused or failed; `message` is safe to show. */
export class DomainHostError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DomainHostError";
  }
}

export const isLive = (status: HostDomainStatus) =>
  status.found && status.verified && status.configured;
