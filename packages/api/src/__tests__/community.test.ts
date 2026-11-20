import { describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

import { createContext, type SessionUser } from "../context";
import { appRouter } from "../root-app";
import type { ChainGateway } from "../services/chain-gateway";
import { createCallerFactory } from "../trpc";

const ISSUER = "G".padEnd(56, "A");
const me: SessionUser = { id: "me", role: "FAN", walletAddress: "GME", walletType: "freighter" };

function caller(db: object, chain: Partial<ChainGateway> = {}, user: SessionUser | null = me) {
  const full = { ...db, activityLog: { create: vi.fn().mockResolvedValue({}) } } as unknown as Db;
  return createCallerFactory(appRouter)(
    createContext({
      db: full,
      chain: chain as ChainGateway,
      app: "app",
      session: user ? { user } : null,
    }),
  );
}

const holding = (balance: string) => ({
  balances: [{ asset_type: "credit_alphanum4", asset_code: "LUNA", asset_issuer: ISSUER, balance }],
});
const gated = {
  id: "c1",
  ownerId: "owner",
  isTokenGated: true,
  gateLogic: "AND",
  postPermission: "ALL_MEMBERS",
  requirements: [{ assetCode: "LUNA", assetIssuer: ISSUER, requiredBalance: "500" }],
};

function joinDb(community: object) {
  return {
    community: { findUnique: vi.fn().mockResolvedValue(community) },
    communityMember: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    communityActivity: { create: vi.fn().mockResolvedValue({}) },
  };
}

describe("community.join", () => {
  it("reads the balance from the chain and refuses a short holder", async () => {
    const db = joinDb(gated);
    const loadAccount = vi.fn().mockResolvedValue(holding("120"));
    await expect(caller(db, { loadAccount }).community.join({ communityId: "c1" })).rejects.toThrow(
      /required tokens/,
    );
    expect(loadAccount).toHaveBeenCalledWith("GME");
    expect(db.communityMember.create).not.toHaveBeenCalled();
  });

  it("lets a holder in and logs the join", async () => {
    const db = joinDb(gated);
    const loadAccount = vi.fn().mockResolvedValue(holding("500"));
    await caller(db, { loadAccount }).community.join({ communityId: "c1" });
    expect(db.communityMember.create).toHaveBeenCalledWith({
      data: { communityId: "c1", userId: "me" },
    });
    expect(db.communityActivity.create).toHaveBeenCalled();
  });

  it("doesn't touch the chain for an open community", async () => {
    const db = joinDb({ ...gated, isTokenGated: false, requirements: [] });
    const loadAccount = vi.fn();
    await caller(db, { loadAccount }).community.join({ communityId: "c1" });
    expect(loadAccount).not.toHaveBeenCalled();
    expect(db.communityMember.create).toHaveBeenCalled();
  });

  it("needs a signed-in user", async () => {
    await expect(caller({}, {}, null).community.join({ communityId: "c1" })).rejects.toThrow();
  });
});

describe("community rules", () => {
  it("refuses a gate with no requirements", async () => {
    await expect(
      caller({}).community.create({
        title: "T",
        description: "D",
        coverUrl: "https://x.test/c.png",
        profileUrl: "https://x.test/p.png",
        isTokenGated: true,
        requirements: [],
      }),
    ).rejects.toThrow(/token requirement/);
  });

  it("only the owner edits or deletes", async () => {
    const db = { community: { findUnique: vi.fn().mockResolvedValue(gated) } };
    await expect(caller(db).community.delete({ communityId: "c1" })).rejects.toThrow(/owner/);
    await expect(caller(db).community.update({ communityId: "c1", title: "New" })).rejects.toThrow(
      /owner/,
    );
  });

  it("the owner can't leave", async () => {
    const db = {
      communityMember: { findUnique: vi.fn().mockResolvedValue({ id: "m", role: "OWNER" }) },
    };
    await expect(caller(db).community.leave({ communityId: "c1" })).rejects.toThrow(/owner/i);
  });

  it("owner-only communities refuse other members' posts", async () => {
    const db = {
      community: {
        findUnique: vi.fn().mockResolvedValue({ ...gated, postPermission: "OWNER_ONLY" }),
      },
      communityMember: { findUnique: vi.fn().mockResolvedValue({ id: "m", role: "MEMBER" }) },
    };
    await expect(
      caller(db).community.post.create({ communityId: "c1", content: "hi" }),
    ).rejects.toThrow(/Only the owner/);
  });

  it("members-only lists hide the members from outsiders", async () => {
    const db = {
      community: {
        findUnique: vi.fn().mockResolvedValue({ ...gated, memberListVisibility: "MEMBERS_ONLY" }),
      },
      communityMember: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    await expect(caller(db).community.members({ communityId: "c1" })).rejects.toThrow(
      /Only members/,
    );
  });

  it("comments are refused when turned off", async () => {
    const db = {
      community: {
        findUnique: vi.fn().mockResolvedValue({ id: "c1", ownerId: "owner", hiddenAt: null }),
      },
      communityPost: {
        findUnique: vi
          .fn()
          .mockResolvedValue({ id: "p", communityId: "c1", authorId: "x", commentsEnabled: false }),
      },
      communityMember: { findUnique: vi.fn().mockResolvedValue({ id: "m", role: "MEMBER" }) },
    };
    await expect(
      caller(db).community.comment.create({ postId: "p", body: "hello" }),
    ).rejects.toThrow(/turned off/);
  });
});

describe("community notifications (central system)", () => {
  const notifyDb = (muted: string[] = []) => ({
    ...joinDb(gated),
    communityMember: {
      findUnique: vi
        .fn()
        .mockResolvedValue({ id: "m1", role: "MEMBER", communityId: "c1", userId: "me" }),
      findMany: vi.fn().mockResolvedValue([{ userId: "a" }, { userId: "b" }, { userId: "me" }]),
    },
    communityNotificationPreference: {
      findMany: vi.fn().mockResolvedValue(muted.map((userId) => ({ userId }))),
    },
    communityPost: { create: vi.fn().mockResolvedValue({ id: "p1" }) },
    notificationEvent: { create: vi.fn().mockResolvedValue({}) },
  });

  it("tells members about a new post, skipping the author and anyone who muted posts", async () => {
    const db = notifyDb(["b"]);
    await caller(db).community.post.create({ communityId: "c1", content: "hi" });
    const data = (
      db.notificationEvent.create.mock.calls[0]![0] as {
        data: {
          type: string;
          entityId: string;
          notifications: { createMany: { data: { recipientId: string }[] } };
        };
      }
    ).data;
    expect(data.type).toBe("COMMUNITY_POST");
    expect(data.entityId).toBe("c1");
    expect(data.notifications.createMany.data.map((n) => n.recipientId)).toEqual(["a"]);
    expect(db.communityNotificationPreference.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { communityId: "c1", newPosts: false } }),
    );
  });

  it("never fails the post when notifying breaks", async () => {
    const db = notifyDb();
    db.notificationEvent.create.mockRejectedValue(new Error("db down"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      caller(db).community.post.create({ communityId: "c1", content: "hi" }),
    ).resolves.toEqual({ id: "p1" });
  });
});

describe("community.invite", () => {
  const inviteDb = () => ({
    community: {
      findUnique: vi.fn().mockResolvedValue({ id: "c1", ownerId: "owner", hiddenAt: null }),
    },
    communityMember: {
      findUnique: vi.fn().mockResolvedValue({ id: "m1", role: "MEMBER" }),
      findMany: vi.fn().mockResolvedValue([{ userId: "in" }]),
    },
    notificationEvent: { create: vi.fn().mockResolvedValue({}) },
    communityActivity: { create: vi.fn().mockResolvedValue({}) },
  });

  it("notifies only people who aren't members yet, even if muted elsewhere", async () => {
    const db = inviteDb();
    const result = await caller(db).community.invite({
      communityId: "c1",
      userIds: ["in", "new1", "new1", "me"],
    });
    expect(result).toEqual({ invited: 1 });
    const call = db.notificationEvent.create.mock.calls[0]![0] as {
      data: { type: string; notifications: { createMany: { data: { recipientId: string }[] } } };
    };
    expect(call.data.type).toBe("COMMUNITY_INVITE");
    expect(call.data.notifications.createMany.data.map((n) => n.recipientId)).toEqual(["new1"]);
  });

  it("is for members only", async () => {
    const db = inviteDb();
    db.communityMember.findUnique.mockResolvedValue(null);
    await expect(
      caller(db).community.invite({ communityId: "c1", userIds: ["x"] }),
    ).rejects.toThrow(/Join the community/);
  });
});

describe("hidden communities", () => {
  const hidden = { ...gated, hiddenAt: new Date(), hiddenReason: "spam" };
  const db = () => ({
    community: { findUnique: vi.fn().mockResolvedValue(hidden) },
    communityMember: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
    communityPost: { findMany: vi.fn().mockResolvedValue([]) },
  });

  it("looks like it doesn't exist to everyone but its owner", async () => {
    await expect(caller(db()).community.byId({ communityId: "c1" })).rejects.toThrow(
      /doesn't exist/,
    );
    await expect(caller(db()).community.post.list({ communityId: "c1" })).rejects.toThrow(
      /doesn't exist/,
    );
    const owner = { ...me, id: "owner" };
    await expect(
      caller(db(), {}, owner).community.post.list({ communityId: "c1" }),
    ).resolves.toBeTruthy();
  });

  it("can't be joined", async () => {
    const d = db();
    await expect(caller(d).community.join({ communityId: "c1" })).rejects.toThrow(/hidden/);
    expect(d.communityMember.create).not.toHaveBeenCalled();
  });
});
