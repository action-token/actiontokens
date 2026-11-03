import { describe, expect, it, vi } from "vitest";

import type { SessionUser } from "../context";
import { addPostComment, collectPost, setPostLike } from "../services/feed/actions";
import { feedPage } from "../services/feed/feed";

const fan: SessionUser = { id: "fan", role: "FAN", walletAddress: "GFAN", walletType: "email" };
const ARTIST_USER = "artist-user";

type Access = "VIEWERS" | "FOLLOWERS" | "MEMBERS" | "NOBODY";

function postRow(
  over: {
    tier?: boolean;
    id?: string;
    commentAccess?: Access;
    collectAccess?: Access;
    textOnly?: boolean;
  } = {},
) {
  return {
    id: over.id ?? "p1",
    title: "Studio day",
    body: "New song soon",
    createdAt: new Date("2026-11-01T10:00:00Z"),
    audience: over.tier ? "MEMBERS" : "EVERYONE",
    commentAccess: over.commentAccess ?? "VIEWERS",
    collectAccess: over.collectAccess ?? "VIEWERS",
    commentTier: null,
    collectTier: null,
    artist: {
      id: "a0",
      name: "DJ Tamsin",
      slug: "dj-tamsin",
      avatarUrl: null,
      userId: ARTIST_USER,
      fanTokenItem: { classicToken: { code: "TAMSIN", issuer: "GISSUER" } },
    },
    tier: over.tier ? { name: "Insider", requiredTokens: { toString: () => "50" } } : null,
    media: over.textOnly
      ? []
      : [{ id: "m1", type: "IMAGE", url: "https://x/1.jpg", title: null, thumbnailUrl: null }],
    _count: { likes: 2, comments: 1 },
    likes: [],
    collectibles: [],
    comments: [
      {
        id: "c9",
        parentId: null,
        body: "Love it",
        createdAt: new Date("2026-11-01T11:00:00Z"),
        author: {
          id: "ana",
          username: "ana",
          displayName: "Ana",
          avatarUrl: null,
          artist: null,
        },
      },
    ],
  };
}

function setup(
  opts: {
    tier?: boolean;
    held?: string;
    follows?: number;
    parent?: object;
    ownArtist?: string;
    row?: Parameters<typeof postRow>[0];
  } = {},
) {
  const events: { type: string; recipients: { recipientId: string; isForArtist: boolean }[] }[] =
    [];
  const db = {
    artist: {
      findFirst: vi.fn().mockResolvedValue(opts.ownArtist ? { id: opts.ownArtist } : null),
    },
    follow: {
      findMany: vi
        .fn()
        .mockResolvedValue(
          Array.from({ length: opts.follows ?? 1 }, (_, i) => ({ artistId: `a${i}` })),
        ),
    },
    post: {
      findFirst: vi.fn().mockResolvedValue(postRow({ tier: opts.tier, ...opts.row })),
      findMany: vi.fn(),
    },
    postCollectible: {
      groupBy: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    postLike: { createMany: vi.fn(), deleteMany: vi.fn() },
    postComment: {
      findFirst: vi.fn().mockResolvedValue(opts.parent ?? null),
      create: vi.fn().mockResolvedValue({ id: "c-new" }),
    },
    notificationEvent: {
      create: vi.fn(
        ({
          data,
        }: {
          data: {
            type: string;
            notifications: {
              createMany: { data: { recipientId: string; isForArtist: boolean }[] };
            };
          };
        }) => {
          events.push({ type: data.type, recipients: data.notifications.createMany.data });
          return Promise.resolve({});
        },
      ),
    },
  };
  const chain = {
    loadAccount: vi.fn().mockResolvedValue({
      balances: [{ asset_code: "TAMSIN", asset_issuer: "GISSUER", balance: opts.held ?? "0" }],
    }),
  };
  const ctx = { db, chain, activity: { set: vi.fn(), facts: vi.fn() } } as never;
  return { ctx, db, chain, events };
}

describe("feed", () => {
  it("says the fan follows nobody instead of reading posts", async () => {
    const { ctx, db } = setup({ follows: 0 });
    expect(await feedPage(ctx, fan, null)).toEqual({ posts: [], next: null, following: 0 });
    expect(db.post.findMany).not.toHaveBeenCalled();
  });

  it("shows an artist their own posts, even before they follow anyone", async () => {
    const { ctx, db } = setup({ follows: 1, ownArtist: "mine" });
    db.post.findMany.mockResolvedValue([postRow()]);
    const page = await feedPage(ctx, fan, null);
    expect(db.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { artistId: { in: ["a0", "mine"] }, isImportOnly: false },
      }),
    );
    expect(page).toMatchObject({ following: 1 });

    const alone = setup({ follows: 0, ownArtist: "mine" });
    alone.db.post.findMany.mockResolvedValue([postRow()]);
    expect(await feedPage(alone.ctx, fan, null)).toMatchObject({ following: 0 });
    expect(alone.db.post.findMany).toHaveBeenCalled();
  });

  it("pages newest first and hands back where the next page starts", async () => {
    const { ctx, db } = setup();
    db.post.findMany.mockResolvedValue(
      Array.from({ length: 11 }, (_, i) => postRow({ id: `p${i}` })),
    );
    const page = await feedPage(ctx, fan, null);
    expect(page.posts).toHaveLength(10);
    expect(page.next).toBe("p9");
    expect(page.posts[0]).toMatchObject({ body: "New song soon", likes: 2, lock: null });
    expect(page.posts[0]!.latestComment).toMatchObject({
      body: "Love it",
      author: { name: "Ana", href: "/u/ana" },
    });
  });

  it("hides a tier post's text and media from fans holding too few tokens", async () => {
    const { ctx, db } = setup({ held: "10" });
    db.post.findMany.mockResolvedValue([postRow({ tier: true })]);
    const [post] = (await feedPage(ctx, fan, null)).posts;
    expect(post).toMatchObject({
      body: null,
      media: [],
      latestComment: null,
      lock: { needed: "50", have: "10" },
    });
  });
});

describe("post actions", () => {
  it("tells the artist about a new like, once", async () => {
    const { ctx, db, events } = setup();
    db.postLike.createMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    await setPostLike(ctx, fan, { postId: "p1", on: true });
    await setPostLike(ctx, fan, { postId: "p1", on: true });
    expect(events).toEqual([
      { type: "LIKE", recipients: [{ recipientId: ARTIST_USER, isForArtist: true }] },
    ]);
  });

  it("refuses comments on a post locked to the fan", async () => {
    const { ctx } = setup({ tier: true, held: "0" });
    await expect(addPostComment(ctx, fan, { postId: "p1", body: "Hi" })).rejects.toMatchObject({
      message: "Open this post first to comment.",
    });
  });

  it("refuses comments when the artist turned them off", async () => {
    const { ctx } = setup({ row: { commentAccess: "NOBODY" } });
    await expect(addPostComment(ctx, fan, { postId: "p1", body: "Hi" })).rejects.toMatchObject({
      message: "Comments are off for this post.",
    });
  });

  it("never lets fans collect a text-only post", async () => {
    const { ctx, db } = setup({ row: { textOnly: true } });
    await expect(collectPost(ctx, fan, "p1")).rejects.toMatchObject({
      message: "This post can't be collected.",
    });
    expect(db.postCollectible.updateMany).not.toHaveBeenCalled();
  });

  it("lets only followers collect a followers-only post", async () => {
    const stranger = setup({ follows: 0, row: { collectAccess: "FOLLOWERS" } });
    await expect(collectPost(stranger.ctx, fan, "p1")).rejects.toMatchObject({
      message: "Follow DJ Tamsin to collect this post.",
    });

    const follower = setup({ follows: 1, row: { collectAccess: "FOLLOWERS" } });
    follower.db.postCollectible.findFirst.mockResolvedValue({ id: "k1" });
    follower.db.postCollectible.updateMany.mockResolvedValue({ count: 1 });
    expect(await collectPost(follower.ctx, fan, "p1")).toEqual({ collected: true, already: false });
  });

  it("puts a reply to a reply in the same thread, and tells both the artist and the fan replied to", async () => {
    const { ctx, db, events } = setup({
      parent: { id: "c2", parentId: "c1", authorId: "ana" },
    });
    await addPostComment(ctx, fan, { postId: "p1", body: "  Same!  ", parentId: "c2" });
    expect(db.postComment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { postId: "p1", authorId: "fan", parentId: "c1", body: "Same!" },
      }),
    );
    expect(events.map((event) => [event.type, event.recipients])).toEqual([
      ["COMMENT", [{ recipientId: ARTIST_USER, isForArtist: true }]],
      ["REPLY", [{ recipientId: "ana", isForArtist: false }]],
    ]);
  });

  it("collects a copy even when another fan takes the first one at the same moment", async () => {
    const { ctx, db } = setup();
    db.postCollectible.findFirst
      .mockResolvedValueOnce({ id: "k1" })
      .mockResolvedValueOnce({ id: "k2" });
    db.postCollectible.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({
      count: 1,
    });
    expect(await collectPost(ctx, fan, "p1")).toEqual({ collected: true, already: false });
    expect(db.postCollectible.updateMany).toHaveBeenLastCalledWith({
      where: { id: "k2", collectorId: null },
      data: { collectorId: "fan", collectedAt: expect.any(Date) },
    });
  });

  it("says when every copy is gone", async () => {
    const { ctx, db } = setup();
    db.postCollectible.findFirst.mockResolvedValue(null);
    await expect(collectPost(ctx, fan, "p1")).rejects.toMatchObject({
      message: "Every copy of this post has been collected.",
    });
  });
});
