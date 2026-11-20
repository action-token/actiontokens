import { AppError, ErrorCodes, isAppError } from "@actiontokens/errors";
import type { CustomDomain } from "@actiontokens/db";
import { normalizeDomain, validateDomain } from "@actiontokens/utils/domain";

import type { Context } from "../../context";
import { notifySelf } from "../notifications/send";
import { domainHostFromEnv } from "./adapter";
import { type DnsRecord, type DomainHost, DomainHostError } from "./host";
import { domainKey, nextState } from "./notice";

/**
 * An artist's custom domain (plan 32): free for approved artists, one each.
 * Added on the host first and saved only if that worked; its status is read
 * from the host when the artist opens Settings, on "Check now", and by the
 * worker (`checkDomains`). Only LIVE domains are served (`liveDomainArtist`).
 */
type ServiceCtx = Pick<Context, "db" | "activity">;
type ArtistRef = { id: string; userId: string };

const DAY = 86_400_000;
const REASON_MAX = 300;

const ownHosts = () => [process.env.NEXT_PUBLIC_APP_URL ?? ""].filter(Boolean).map(hostOf);
function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** A host failure as a plain message for the artist. */
function hostFailed(error: unknown): never {
  if (isAppError(error)) throw error;
  if (error instanceof DomainHostError) {
    throw new AppError(ErrorCodes.EXTERNAL_SERVICE_FAILED, {
      message: error.message,
      cause: error,
    });
  }
  throw new AppError(ErrorCodes.EXTERNAL_SERVICE_FAILED, {
    message: "Couldn't reach the hosting service. Try again in a minute.",
    cause: error,
  });
}

/**
 * Asks the host where a domain stands and saves it. The status only moves if
 * nobody else moved it first, so a bell is sent once even when the page and
 * the worker check at the same moment.
 */
export async function refreshDomain(
  ctx: Pick<Context, "db">,
  row: CustomDomain & { organization: { userId: string } },
  host: DomainHost,
  now = new Date(),
): Promise<{ row: CustomDomain; records: DnsRecord[] }> {
  if (row.status === "NEEDS_SETUP" || !host.available) return { row, records: [] };
  const answer = await host.status(row.domain, { withWww: row.withWww });
  const { event, ...next } = nextState(row, answer, now);
  const moved = await ctx.db.customDomain.updateMany({
    where: { id: row.id, status: row.status },
    data: next,
  });
  if (moved.count === 1 && event) {
    await notifySelf(ctx, {
      type: "DOMAIN",
      userId: row.organization.userId,
      entityId: domainKey({ stage: event, domain: row.domain }),
      isForArtist: true,
    });
  }
  return { row: { ...row, ...next }, records: answer.records };
}

const view = (row: CustomDomain, records: DnsRecord[]) => ({
  domain: row.domain,
  status: row.status,
  withWww: row.withWww,
  verifiedAt: row.verifiedAt,
  lastCheckedAt: row.lastCheckedAt,
  brokenSince: row.brokenSince,
  lastError: row.lastError,
  records,
});

/** Settings › Custom domain: the artist's domain, read fresh from the host. */
export async function getDomain(ctx: ServiceCtx, artist: ArtistRef, host = domainHostFromEnv()) {
  const row = await ctx.db.customDomain.findUnique({
    where: { organizationId: artist.id },
    include: { organization: { select: { userId: true } } },
  });
  if (!row) return { available: host.available, domain: null };
  try {
    const fresh = await refreshDomain(ctx, row, host);
    return { available: host.available, domain: view(fresh.row, fresh.records) };
  } catch {
    // The host didn't answer: show what we know rather than an error page.
    return {
      available: host.available,
      domain: { ...view(row, []), lastError: "Couldn't reach the hosting service just now." },
    };
  }
}

export async function addDomain(
  ctx: ServiceCtx,
  artist: ArtistRef,
  raw: string,
  host = domainHostFromEnv(),
) {
  if (!host.available) {
    throw new AppError(ErrorCodes.CONFIG_MISSING, { message: "Custom domains aren't open yet." });
  }
  const domain = normalizeDomain(raw);
  const invalid = validateDomain(domain, ownHosts());
  if (invalid) throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: invalid });

  const [mine, taken] = await Promise.all([
    ctx.db.customDomain.findUnique({ where: { organizationId: artist.id } }),
    ctx.db.customDomain.findUnique({ where: { domain } }),
  ]);
  if (mine) {
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: "You already have a domain. Remove it first to connect another.",
    });
  }
  if (taken) {
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: "This domain is already connected to another artist.",
    });
  }

  const { withWww } = await host.add(domain).catch(hostFailed);
  try {
    const row = await ctx.db.customDomain.create({
      data: { organizationId: artist.id, domain, withWww, status: "PENDING" },
    });
    ctx.activity.set({ targetType: "CustomDomain", targetId: row.id });
    return { domain: row.domain, withWww };
  } catch (error) {
    // Saved by someone else in the same moment: don't leave it on the host.
    await host.remove(domain).catch(() => null);
    throw error;
  }
}

/** A domain copied from bandfan: put it on the host, then wait for DNS. */
export async function reconnectDomain(
  ctx: ServiceCtx,
  artist: ArtistRef,
  host = domainHostFromEnv(),
) {
  const row = await ctx.db.customDomain.findUnique({ where: { organizationId: artist.id } });
  if (!row) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND, { message: "You have no domain." });
  if (row.status !== "NEEDS_SETUP") return { domain: row.domain };
  if (!host.available) {
    throw new AppError(ErrorCodes.CONFIG_MISSING, { message: "Custom domains aren't open yet." });
  }
  const { withWww } = await host.add(row.domain).catch(hostFailed);
  await ctx.db.customDomain.update({
    where: { id: row.id },
    data: { status: "PENDING", withWww, lastError: null },
  });
  ctx.activity.set({ targetType: "CustomDomain", targetId: row.id });
  return { domain: row.domain };
}

/** Off the host first (already gone is fine), then the row. */
async function detach(ctx: Pick<Context, "db">, row: CustomDomain, host: DomainHost) {
  if (row.status !== "NEEDS_SETUP") await host.remove(row.domain).catch(hostFailed);
  await ctx.db.customDomain.delete({ where: { id: row.id } });
}

export async function removeDomain(ctx: ServiceCtx, artist: ArtistRef, host = domainHostFromEnv()) {
  const row = await ctx.db.customDomain.findUnique({ where: { organizationId: artist.id } });
  if (!row) return { removed: false };
  await detach(ctx, row, host);
  ctx.activity.set({ targetType: "CustomDomain", targetId: row.id });
  return { removed: true };
}

/** Admin › Domains: every domain with its artist, broken ones first. */
export async function listDomainsForAdmin(ctx: Pick<Context, "db">) {
  const rows = await ctx.db.customDomain.findMany({
    include: { organization: { select: { id: true, name: true, slug: true } } },
    orderBy: [{ status: "asc" }, { domain: "asc" }],
  });
  const order = { BROKEN: 0, PENDING: 1, NEEDS_SETUP: 2, LIVE: 3 } as const;
  return rows
    .sort((a, b) => order[a.status] - order[b.status] || a.domain.localeCompare(b.domain))
    .map((row) => ({
      id: row.id,
      domain: row.domain,
      withWww: row.withWww,
      status: row.status,
      lastCheckedAt: row.lastCheckedAt,
      brokenSince: row.brokenSince,
      lastError: row.lastError,
      createdAt: row.createdAt,
      artist: row.organization,
    }));
}

/** An admin takes a domain away; the artist's bell says why. */
export async function removeDomainAsAdmin(
  ctx: ServiceCtx,
  input: { id: string; reason: string },
  host = domainHostFromEnv(),
) {
  const reason = input.reason.trim().slice(0, REASON_MAX);
  if (!reason)
    throw new AppError(ErrorCodes.VALIDATION_FAILED, { message: "Say why it's removed." });
  const row = await ctx.db.customDomain.findUnique({
    where: { id: input.id },
    include: { organization: { select: { userId: true } } },
  });
  if (!row) throw new AppError(ErrorCodes.RESOURCE_NOT_FOUND);
  await detach(ctx, row, host);
  ctx.activity.set({ targetType: "CustomDomain", targetId: row.id });
  await notifySelf(ctx, {
    type: "DOMAIN",
    userId: row.organization.userId,
    entityId: domainKey({ stage: "REMOVED", domain: row.domain, reason }),
    isForArtist: true,
  });
  return { removed: true };
}

/**
 * Worker `domains.check` (every 15 minutes): domains waiting for DNS each
 * time, live and broken ones once a day. One failing domain never stops the
 * rest; nothing is removed automatically.
 */
export async function checkDomains(
  ctx: Pick<Context, "db">,
  host = domainHostFromEnv(),
  now = new Date(),
) {
  if (!host.available) return { skipped: "no host set up", checked: 0, failed: 0 };
  const dayAgo = new Date(now.getTime() - DAY);
  const rows = await ctx.db.customDomain.findMany({
    where: {
      OR: [
        { status: "PENDING" },
        {
          status: { in: ["LIVE", "BROKEN"] },
          OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: dayAgo } }],
        },
      ],
    },
    include: { organization: { select: { userId: true } } },
  });
  let failed = 0;
  for (const row of rows) {
    try {
      await refreshDomain(ctx, row, host, now);
    } catch (error) {
      failed += 1;
      console.error("[domains.check] couldn't check", row.domain, error);
    }
  }
  return { checked: rows.length - failed, failed };
}

/** The fan app: which artist a LIVE domain (or its www) shows, if any. */
export async function liveDomainArtist(ctx: Pick<Context, "db">, rawHost: string) {
  const domain = normalizeDomain(rawHost);
  if (!domain) return null;
  const row = await ctx.db.customDomain.findUnique({
    where: { domain },
    select: { status: true, domain: true, organization: { select: { slug: true, status: true } } },
  });
  if (row?.status !== "LIVE" || row.organization.status !== "APPROVED") return null;
  return { slug: row.organization.slug, domain: row.domain };
}
