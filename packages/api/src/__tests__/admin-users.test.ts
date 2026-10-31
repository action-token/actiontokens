import { describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import { createContext, liveSession, type SessionUser } from "../context";
import { portalRouter } from "../root-portal";
import type { ChainGateway } from "../services/chain-gateway";
import {
  addAdmin,
  listUsers,
  setAdmin,
  suspendUser,
  unsuspendUser,
  USERS_PAGE,
} from "../services/admin/users";
import { createCallerFactory } from "../trpc";

const admin: SessionUser = {
  id: "admin1",
  role: "ADMIN",
  walletAddress: "GADMIN",
  walletType: "freighter",
};

type Row = Record<string, unknown>;

function setup(people: Row[] = []) {
  const users = new Map<string, Row>(
    people.map((person) => [
      person.id as string,
      {
        role: "FAN",
        suspendedAt: null,
        artist: null,
        _count: { pinClaims: 2, ownerships: 5 },
        ...person,
      },
    ]),
  );
  const db = {
    user: {
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(users.get(where.id) ?? null),
      ),
      findMany: vi.fn(() => Promise.resolve([...users.values()])),
      findFirst: vi.fn(({ where }: { where: Row }) =>
        Promise.resolve(
          [...users.values()].find((user) =>
            "walletAddress" in where
              ? user.walletAddress === where.walletAddress
              : user.email === (where.email as { equals: string }).equals,
          ) ?? null,
        ),
      ),
      update: vi.fn(({ where, data }: { where: { id: string }; data: Row }) => {
        Object.assign(users.get(where.id)!, data);
        return Promise.resolve(users.get(where.id));
      }),
    },
    activityLog: {
      groupBy: vi.fn(() =>
        Promise.resolve([{ actorId: "u1", _max: { createdAt: new Date("2026-10-29") } }]),
      ),
      create: vi.fn(() => Promise.resolve({})),
    },
  };
  const activity = { set: vi.fn(), facts: () => ({}) };
  return { ctx: { db: db as unknown as Db, activity }, db, users, activity };
}

describe("finding people", () => {
  it("lists a page with when each was last active, and a cursor when there's more", async () => {
    const many = Array.from({ length: USERS_PAGE + 1 }, (_, index) => ({
      id: index === 0 ? "u1" : `u${index + 1}`,
      username: `fan${index}`,
      createdAt: new Date(),
    }));
    const { ctx } = setup(many);
    const page = await listUsers(ctx, {});
    expect(page.users).toHaveLength(USERS_PAGE);
    expect(page.users[0]).toMatchObject({ id: "u1", suspended: false, collected: 2, owned: 5 });
    expect(page.users[0]?.lastActiveAt).toEqual(new Date("2026-10-29"));
    expect(page.nextCursor).toBe(page.users.at(-1)?.id);
  });

  it("searches by wallet, email, username or artist name", async () => {
    const { ctx, db } = setup();
    await listUsers(ctx, { search: "@luna", status: "suspended", role: "ARTIST" });
    expect(db.user.findMany.mock.calls[0]).toMatchObject([
      {
        where: {
          role: "ARTIST",
          suspendedAt: { not: null },
          OR: expect.arrayContaining([
            { username: { contains: "luna", mode: "insensitive" } },
            { walletAddress: { startsWith: "@LUNA" } },
          ]),
        },
      },
    ]);
  });
});

describe("suspending", () => {
  it("suspends with a reason and lifts it, logging the person as the target", async () => {
    const { ctx, users, activity } = setup([{ id: "u1" }]);
    await suspendUser(ctx, admin, { userId: "u1", reason: "  Spam claims " });
    expect(users.get("u1")).toMatchObject({ suspendedReason: "Spam claims" });
    expect(users.get("u1")?.suspendedAt).toBeInstanceOf(Date);
    expect(activity.set).toHaveBeenCalledWith({ targetType: "User", targetId: "u1" });
    await expect(suspendUser(ctx, admin, { userId: "u1", reason: "again" })).rejects.toThrow(
      /already suspended/,
    );

    await unsuspendUser(ctx, { userId: "u1" });
    expect(users.get("u1")).toMatchObject({ suspendedAt: null, suspendedReason: null });
  });

  it("never suspends yourself", async () => {
    const { ctx } = setup([{ id: "admin1", role: "ADMIN" }]);
    await expect(suspendUser(ctx, admin, { userId: "admin1", reason: "oops" })).rejects.toThrow(
      /can't suspend yourself/,
    );
  });

  it("marks the session suspended, and every signed-in call refuses it", async () => {
    const { db, users } = setup([{ id: "u1", suspendedAt: new Date() }]);
    const fan: SessionUser = { id: "u1", role: "FAN", walletAddress: "GFAN", walletType: "albedo" };
    const session = await liveSession(db as unknown as Db, { user: fan });
    expect(session?.user.suspended).toBe(true);
    users.get("u1")!.suspendedAt = null;
    expect((await liveSession(db as unknown as Db, { user: fan }))?.user.suspended).toBeUndefined();

    const caller = createCallerFactory(portalRouter)(
      createContext({
        db: db as unknown as Db,
        chain: {} as ChainGateway,
        app: "artist",
        session,
      }),
    );
    await expect(caller.profile.overview()).rejects.toMatchObject({
      message: expect.stringMatching(/suspended/),
    });
  });
});

describe("admins", () => {
  it("adds an admin by wallet or email, and says when there's no such account", async () => {
    const wallet = `G${"A".repeat(55)}`;
    const { ctx, users, db } = setup([
      { id: "u1", walletAddress: wallet },
      { id: "u2", email: "luna@example.com" },
    ]);
    await addAdmin(ctx, admin, { who: ` ${wallet.toLowerCase()} ` });
    expect(db.user.findFirst).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: { walletAddress: wallet } }),
    );
    expect(users.get("u1")).toMatchObject({ role: "ADMIN" });
    await addAdmin(ctx, admin, { who: "luna@example.com" });
    expect(users.get("u2")).toMatchObject({ role: "ADMIN" });
    await expect(addAdmin(ctx, admin, { who: "nobody@example.com" })).rejects.toThrow(
      /sign in once first/,
    );
  });

  it("makes an admin, and removing it puts an approved artist back to artist", async () => {
    const { ctx, users } = setup([{ id: "u1", artist: { status: "APPROVED" } }, { id: "u2" }]);
    await setAdmin(ctx, admin, { userId: "u1", admin: true });
    expect(users.get("u1")?.role).toBe("ADMIN");
    await setAdmin(ctx, admin, { userId: "u1", admin: false });
    expect(users.get("u1")?.role).toBe("ARTIST");

    await setAdmin(ctx, admin, { userId: "u2", admin: true });
    await setAdmin(ctx, admin, { userId: "u2", admin: false });
    expect(users.get("u2")?.role).toBe("FAN");
  });

  it("won't remove your own admin, or promote a suspended account", async () => {
    const { ctx } = setup([
      { id: "admin1", role: "ADMIN" },
      { id: "u3", suspendedAt: new Date() },
    ]);
    await expect(setAdmin(ctx, admin, { userId: "admin1", admin: false })).rejects.toThrow(
      /yourself/,
    );
    await expect(setAdmin(ctx, admin, { userId: "u3", admin: true })).rejects.toThrow(/Unsuspend/);
  });
});
