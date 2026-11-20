import type { CustomDomainStatus } from "@actiontokens/db";

import { type HostDomainStatus, isLive } from "./host";

/**
 * How a custom domain moves when the host is asked about it (plan 32), and
 * the bell notes it sends. Pure, so the rules are tested on their own.
 *
 *   PENDING → LIVE      first time it works: verifiedAt set, "is live" bell
 *   LIVE    → BROKEN    it stopped working: brokenSince set, bell
 *   BROKEN  → LIVE      working again: "is live" bell
 *   NEEDS_SETUP         never checked: it isn't on the host
 */
export type DomainEvent = "LIVE" | "BROKEN";

type Row = { status: CustomDomainStatus; verifiedAt: Date | null; brokenSince: Date | null };

export function nextState(row: Row, host: HostDomainStatus, now: Date) {
  const live = isLive(host);
  const base = { lastCheckedAt: now, lastError: live ? null : host.error };
  if (row.status === "NEEDS_SETUP") return { ...base, status: row.status, event: null };
  if (live) {
    return {
      ...base,
      status: "LIVE" as const,
      verifiedAt: row.verifiedAt ?? now,
      brokenSince: null,
      event: row.status === "LIVE" ? null : ("LIVE" as const),
    };
  }
  if (row.status === "LIVE") {
    return { ...base, status: "BROKEN" as const, brokenSince: now, event: "BROKEN" as const };
  }
  return { ...base, status: row.status, event: null };
}

export type DomainNotice =
  | { stage: "LIVE" | "BROKEN"; domain: string }
  | { stage: "REMOVED"; domain: string; reason: string };

/** The notification's entityId: what happened, to which domain (and why, for removals). */
export function domainKey(notice: DomainNotice) {
  return notice.stage === "REMOVED"
    ? `domain:REMOVED:${notice.domain}:${notice.reason}`
    : `domain:${notice.stage}:${notice.domain}`;
}

export function parseDomainKey(key: string | null | undefined): DomainNotice | null {
  const match = /^domain:(LIVE|BROKEN|REMOVED):([^:]+)(?::([\s\S]*))?$/.exec(key ?? "");
  if (!match) return null;
  const [, stage, domain, reason] = match;
  if (stage === "REMOVED") return { stage, domain: domain!, reason: reason ?? "" };
  return { stage: stage as "LIVE" | "BROKEN", domain: domain! };
}

const SETTINGS = "/settings?tab=custom-domain";

/** What the artist reads in the portal's bell. */
export function describeDomain(notice: DomainNotice | null): { text: string; href: string } {
  if (!notice) return { text: "Your custom domain needs a look.", href: SETTINGS };
  switch (notice.stage) {
    case "LIVE":
      return { text: `${notice.domain} is live: it now shows your artist page.`, href: SETTINGS };
    case "BROKEN":
      return {
        text: `${notice.domain} stopped working. Check its DNS records in Settings.`,
        href: SETTINGS,
      };
    case "REMOVED":
      return {
        text: `An admin removed your custom domain ${notice.domain}${notice.reason ? `: ${notice.reason}` : "."}`,
        href: SETTINGS,
      };
  }
}
