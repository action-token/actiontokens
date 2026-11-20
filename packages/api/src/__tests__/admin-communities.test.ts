import { describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

import { createContext, type SessionUser } from "../context";
import { portalRouter } from "../root-portal";
import type { ChainGateway } from "../services/chain-gateway";
import { createCallerFactory } from "../trpc";

const admin: SessionUser = {
  id: "a1",
  role: "ADMIN",
  walletAddress: "GA",
  walletType: "freighter",
};
const fan: SessionUser = { id: "f1", role: "FAN", walletAddress: "GF", walletType: "freighter" };

function caller(db: object, user: SessionUser = admin) {
  const full = { ...db, activityLog: { create: vi.fn().mockResolvedValue({}) } } as unknown as Db;
  return createCallerFactory(portalRouter)(
    createContext({ db: full, chain: {} as ChainGateway, app: "org", session: { user } }),
  );
}

describe("admin.communities", () => {
  it("hides with a reason the owner can read, and shows again", async () => {
    const update = vi.fn().mockResolvedValue({});
    const db = { community: { findUnique: vi.fn().mockResolvedValue({ id: "c1" }), update } };
    await caller(db).admin.communities.setHidden({
      communityId: "c1",
      hidden: true,
      reason: "Spam links",
    });
    expect(update.mock.calls[0]![0].data).toMatchObject({ hiddenReason: "Spam links" });
    expect(update.mock.calls[0]![0].data.hiddenAt).toBeInstanceOf(Date);
    await caller(db).admin.communities.setHidden({ communityId: "c1", hidden: false });
    expect(update.mock.calls[1]![0].data).toEqual({ hiddenAt: null, hiddenReason: null });
  });

  it("needs a reason to hide", async () => {
    const db = { community: { findUnique: vi.fn(), update: vi.fn() } };
    await expect(
      caller(db).admin.communities.setHidden({ communityId: "c1", hidden: true } as never),
    ).rejects.toThrow();
  });

  it("takes down a post and a comment, and says when they're gone", async () => {
    const db = {
      communityPost: { findUnique: vi.fn().mockResolvedValue(null), delete: vi.fn() },
      communityComment: {
        findUnique: vi.fn().mockResolvedValue({ id: "k" }),
        delete: vi.fn().mockResolvedValue({}),
      },
    };
    await expect(caller(db).admin.communities.takeDownPost({ postId: "p" })).rejects.toThrow(
      /doesn't exist/,
    );
    await caller(db).admin.communities.takeDownComment({ commentId: "k" });
    expect(db.communityComment.delete).toHaveBeenCalledWith({ where: { id: "k" } });
  });

  it("removes a member but never the owner", async () => {
    const db = {
      community: { findUnique: vi.fn().mockResolvedValue({ ownerId: "o" }) },
      communityMember: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    expect(
      await caller(db).admin.communities.removeMember({ communityId: "c1", userId: "u" }),
    ).toEqual({ removed: 1 });
    await expect(
      caller(db).admin.communities.removeMember({ communityId: "c1", userId: "o" }),
    ).rejects.toThrow(/owner/);
  });

  it("is for admins only", async () => {
    await expect(caller({}, fan).admin.communities.list({})).rejects.toThrow();
  });
});
