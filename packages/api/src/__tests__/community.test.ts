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
