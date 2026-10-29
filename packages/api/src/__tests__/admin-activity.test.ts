import { describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import { listActivity } from "../services/admin/activity";

const row = (id: number, extra: Record<string, unknown> = {}) => ({
  id: BigInt(id),
  action: "admin.artists.approve",
  actorRole: "ADMIN",
  status: "SUCCESS",
  errorCode: null,
  targetType: "Artist",
  targetId: "a1",
  txHash: null,
  amount: null,
  currency: null,
  app: "artist",
  createdAt: new Date("2026-10-29T10:00:00Z"),
  actor: { username: "root", displayName: null },
  ...extra,
});

function setup(rows: unknown[]) {
  const findMany = vi.fn().mockResolvedValue(rows);
  return { ctx: { db: { activityLog: { findMany } } as unknown as Db }, findMany };
}

describe("listActivity", () => {
  it("returns newest first with who did it, and a cursor when there is more", async () => {
    const { ctx, findMany } = setup([row(30), row(29), row(28)]);
    const page = await listActivity(ctx, { limit: 2 });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { id: "desc" }, take: 3 }));
    expect(page.items.map((item) => item.id)).toEqual(["30", "29"]);
    expect(page.items[0]).toMatchObject({ actor: "root", action: "admin.artists.approve", target: "Artist a1" });
    expect(page.nextCursor).toBe("29");
  });

  it("has no cursor on the last page, and continues after the one it was given", async () => {
    const { ctx, findMany } = setup([row(5)]);
    const page = await listActivity(ctx, { limit: 2, cursor: "10" });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { lt: 10n } } }));
    expect(page.nextCursor).toBeNull();
  });

  it("can show only failures, and names a signed-out actor", async () => {
    const { ctx, findMany } = setup([row(7, { actor: null, actorRole: "GUEST", status: "FAILED", errorCode: "AUTH_REQUIRED" })]);
    const page = await listActivity(ctx, { limit: 10, failedOnly: true });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: "FAILED" } }));
    expect(page.items[0]).toMatchObject({ actor: "Guest", status: "FAILED", errorCode: "AUTH_REQUIRED" });
  });
});
