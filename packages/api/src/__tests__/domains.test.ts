import { describe, expect, it, vi } from "vitest";

import { normalizeDomain, validateDomain } from "@actiontokens/utils/domain";

import { describeForArtist } from "../services/notifications/describe";
import type { DomainHost, HostDomainStatus } from "../services/domains/host";
import { describeDomain, domainKey, nextState, parseDomainKey } from "../services/domains/notice";
import {
  addDomain,
  checkDomains,
  liveDomainArtist,
  reconnectDomain,
  refreshDomain,
  removeDomain,
  removeDomainAsAdmin,
} from "../services/domains/service";

const now = new Date("2026-11-09T10:00:00Z");
const artist = { id: "a1", userId: "u1" };

const answer = (over: Partial<HostDomainStatus> = {}): HostDomainStatus => ({
  found: true,
  verified: true,
  configured: true,
  records: [],
  error: null,
  ...over,
});

function fakeHost(status: HostDomainStatus = answer()): DomainHost & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    name: "fake",
    available: true,
    add: vi.fn(async (domain: string) => {
      calls.push(`add ${domain}`);
      return { withWww: !domain.includes(".", domain.indexOf(".") + 1) };
    }),
    status: vi.fn(async () => status),
    remove: vi.fn(async (domain: string) => {
      calls.push(`remove ${domain}`);
    }),
  };
}

function row(over: Record<string, unknown> = {}) {
  return {
    id: "d1",
    artistId: "a1",
    domain: "coldplay.com",
    status: "PENDING" as const,
    withWww: true,
    verifiedAt: null,
    lastCheckedAt: null,
    brokenSince: null,
    lastError: null,
    createdAt: now,
    artist: { userId: "u1" },
    ...over,
  };
}

type Setup = { mine?: unknown; taken?: unknown; rows?: unknown[]; moved?: number };

function setup({ mine = null, taken = null, rows = [], moved = 1 }: Setup = {}) {
  const db = {
    customDomain: {
      findUnique: vi.fn(async ({ where }: { where: Record<string, string> }) =>
        where.artistId ? mine : where.domain ? taken : where.id ? mine : null,
      ),
      findMany: vi.fn().mockResolvedValue(rows),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "d1", ...data })),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: moved }),
      delete: vi.fn().mockResolvedValue({}),
    },
    notificationEvent: { create: vi.fn().mockResolvedValue({}) },
  };
  const activity = { set: vi.fn(), facts: () => ({}) };
  return { ctx: { db, activity } as never, db, activity };
}

describe("custom domain names", () => {
  it("cleans up what the artist types", () => {
    expect(normalizeDomain(" https://WWW.Coldplay.com/music?x=1 ")).toBe("coldplay.com");
    expect(normalizeDomain("music.coldplay.com.")).toBe("music.coldplay.com");
  });

  it("refuses what can't be their own domain", () => {
    expect(validateDomain("coldplay.com")).toBeNull();
    expect(validateDomain("music.coldplay.co.uk")).toBeNull();
    expect(validateDomain("coldplay")).toMatch(/whole domain/);
    expect(validateDomain("cold play.com")).toMatch(/letters/);
    expect(validateDomain("luna.bandcoin.io")).toMatch(/Bandcoin address/);
    expect(validateDomain("bandcoin.io")).toMatch(/Bandcoin address/);
    expect(validateDomain("luna.mysite.app", ["https://mysite.app"])).toMatch(/Bandcoin address/);
  });
});

describe("custom domain status", () => {
  it("goes live once, breaks once, and comes back", () => {
    const pending = { status: "PENDING" as const, verifiedAt: null, brokenSince: null };
    expect(nextState(pending, answer(), now)).toMatchObject({
      status: "LIVE",
      verifiedAt: now,
      event: "LIVE",
    });
    expect(nextState(pending, answer({ configured: false, error: "No DNS" }), now)).toMatchObject({
      status: "PENDING",
      lastError: "No DNS",
      event: null,
    });
    const live = { status: "LIVE" as const, verifiedAt: now, brokenSince: null };
    expect(nextState(live, answer(), now).event).toBeNull();
    expect(nextState(live, answer({ found: false }), now)).toMatchObject({
      status: "BROKEN",
      brokenSince: now,
      event: "BROKEN",
    });
    const broken = { status: "BROKEN" as const, verifiedAt: now, brokenSince: now };
    expect(nextState(broken, answer(), now)).toMatchObject({
      status: "LIVE",
      brokenSince: null,
      event: "LIVE",
    });
    expect(nextState(broken, answer({ verified: false }), now).event).toBeNull();
  });

  it("never touches a domain copied from bandfan", () => {
    const copied = { status: "NEEDS_SETUP" as const, verifiedAt: null, brokenSince: null };
    expect(nextState(copied, answer(), now)).toMatchObject({ status: "NEEDS_SETUP", event: null });
  });

  it("round-trips what a bell note is about, reasons with colons too", () => {
    expect(parseDomainKey(domainKey({ stage: "LIVE", domain: "coldplay.com" }))).toEqual({
      stage: "LIVE",
      domain: "coldplay.com",
    });
    const removed = {
      stage: "REMOVED" as const,
      domain: "coldplay.com",
      reason: "Spam: copied page",
    };
    expect(parseDomainKey(domainKey(removed))).toEqual(removed);
    expect(parseDomainKey("p1")).toBeNull();
  });

  it("reads plainly in the artist's bell", () => {
    expect(describeDomain({ stage: "LIVE", domain: "coldplay.com" }).text).toBe(
      "coldplay.com is live: it now shows your artist page.",
    );
    const removed = describeForArtist("DOMAIN", {
      actor: { name: "Luna", username: null, artistSlug: "luna" },
      domain: { stage: "REMOVED", domain: "coldplay.com", reason: "Not theirs" },
    });
    expect(removed).toEqual({
      text: "An admin removed your custom domain coldplay.com: Not theirs",
      href: "/settings?tab=custom-domain",
    });
  });
});

describe("connecting a domain", () => {
  it("adds it on the host first, then saves it", async () => {
    const { ctx, db, activity } = setup();
    const host = fakeHost();
    expect(await addDomain(ctx, artist, "WWW.Coldplay.com", host)).toEqual({
      domain: "coldplay.com",
      withWww: true,
    });
    expect(host.calls).toEqual(["add coldplay.com"]);
    expect(db.customDomain.create).toHaveBeenCalledWith({
      data: { artistId: "a1", domain: "coldplay.com", withWww: true, status: "PENDING" },
    });
    expect(activity.set).toHaveBeenCalledWith({ targetType: "CustomDomain", targetId: "d1" });
  });

  it("one domain per artist, and one artist per domain", async () => {
    await expect(
      addDomain(setup({ mine: row() }).ctx, artist, "other.com", fakeHost()),
    ).rejects.toThrow(/Remove it first/);
    await expect(
      addDomain(setup({ taken: row({ artistId: "a2" }) }).ctx, artist, "coldplay.com", fakeHost()),
    ).rejects.toThrow(/another artist/);
  });

  it("saves nothing when the host refuses", async () => {
    const { ctx, db } = setup();
    const host = fakeHost();
    host.add = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(addDomain(ctx, artist, "coldplay.com", host)).rejects.toThrow(/hosting service/);
    expect(db.customDomain.create).not.toHaveBeenCalled();
  });

  it("takes it off the host again when saving fails", async () => {
    const { ctx, db } = setup();
    db.customDomain.create.mockRejectedValue(new Error("unique"));
    const host = fakeHost();
    await expect(addDomain(ctx, artist, "coldplay.com", host)).rejects.toThrow("unique");
    expect(host.calls).toEqual(["add coldplay.com", "remove coldplay.com"]);
  });

  it("says custom domains aren't open when no host is set up", async () => {
    const host = { ...fakeHost(), available: false };
    await expect(addDomain(setup().ctx, artist, "coldplay.com", host)).rejects.toThrow(
      "aren't open yet",
    );
  });

  it("reconnects a domain copied from bandfan", async () => {
    const { ctx, db } = setup({ mine: row({ status: "NEEDS_SETUP" }) });
    const host = fakeHost();
    await reconnectDomain(ctx, artist, host);
    expect(host.calls).toEqual(["add coldplay.com"]);
    expect(db.customDomain.update).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: { status: "PENDING", withWww: true, lastError: null },
    });
  });
});

describe("checking a domain", () => {
  it("rings the bell once when it goes live", async () => {
    const { ctx, db } = setup();
    await refreshDomain(ctx, row(), fakeHost(), now);
    expect(db.customDomain.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "d1", status: "PENDING" } }),
    );
    expect(db.notificationEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "DOMAIN", entityId: "domain:LIVE:coldplay.com" }),
    });
  });

  it("stays quiet when someone else already moved it", async () => {
    const { ctx, db } = setup({ moved: 0 });
    await refreshDomain(ctx, row(), fakeHost(), now);
    expect(db.notificationEvent.create).not.toHaveBeenCalled();
  });

  it("the worker checks waiting domains each run, live ones daily, and carries on past a failure", async () => {
    const rows = [row({ id: "d1" }), row({ id: "d2", domain: "bad.com" })];
    const { ctx, db } = setup({ rows });
    const host = fakeHost();
    host.status = vi.fn().mockResolvedValueOnce(answer()).mockRejectedValueOnce(new Error("down"));
    expect(await checkDomains(ctx, host, now)).toEqual({ checked: 1, failed: 1 });
    const where = db.customDomain.findMany.mock.calls[0]![0].where;
    expect(where.OR[0]).toEqual({ status: "PENDING" });
    expect(where.OR[1].OR[1]).toEqual({ lastCheckedAt: { lt: new Date("2026-11-08T10:00:00Z") } });
  });

  it("the worker does nothing without a host", async () => {
    expect(await checkDomains(setup().ctx, { ...fakeHost(), available: false }, now)).toMatchObject(
      { checked: 0 },
    );
  });
});

describe("removing a domain", () => {
  it("the artist removes it from the host and Bandcoin", async () => {
    const { ctx, db } = setup({ mine: row({ status: "LIVE" }) });
    const host = fakeHost();
    expect(await removeDomain(ctx, artist, host)).toEqual({ removed: true });
    expect(host.calls).toEqual(["remove coldplay.com"]);
    expect(db.customDomain.delete).toHaveBeenCalledWith({ where: { id: "d1" } });
  });

  it("keeps the row when the host fails, so nothing is half-removed", async () => {
    const { ctx, db } = setup({ mine: row({ status: "LIVE" }) });
    const host = fakeHost();
    host.remove = vi.fn().mockRejectedValue(new Error("down"));
    await expect(removeDomain(ctx, artist, host)).rejects.toThrow();
    expect(db.customDomain.delete).not.toHaveBeenCalled();
  });

  it("an admin's removal tells the artist why", async () => {
    const { ctx, db } = setup({ mine: row({ status: "LIVE" }) });
    await removeDomainAsAdmin(ctx, { id: "d1", reason: "  Not their domain  " }, fakeHost());
    expect(db.notificationEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "DOMAIN",
        entityId: "domain:REMOVED:coldplay.com:Not their domain",
        notifications: { create: { recipientId: "u1", isForArtist: true } },
      }),
    });
  });
});

describe("serving a domain", () => {
  it("shows only a live domain of an approved artist", async () => {
    const find = (found: unknown) =>
      ({ db: { customDomain: { findUnique: vi.fn().mockResolvedValue(found) } } }) as never;
    const live = {
      status: "LIVE",
      domain: "coldplay.com",
      artist: { slug: "luna", status: "APPROVED" },
    };
    expect(await liveDomainArtist(find(live), "WWW.coldplay.com:443")).toEqual({
      slug: "luna",
      domain: "coldplay.com",
    });
    expect(await liveDomainArtist(find({ ...live, status: "PENDING" }), "coldplay.com")).toBeNull();
    expect(
      await liveDomainArtist(
        find({ ...live, artist: { slug: "luna", status: "BANNED" } }),
        "coldplay.com",
      ),
    ).toBeNull();
    expect(await liveDomainArtist(find(null), "nobody.com")).toBeNull();
  });
});
