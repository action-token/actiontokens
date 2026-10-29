import { describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import { COLLECTIBLE_COPIES, createPost, listComments, listPosts, removeComment, removePost, updatePost } from "../services/artist/posts";

vi.mock("@bandcoin/storage", () => ({ isOwnS3Url: (url: string) => url.startsWith("https://cdn.example/"), uploadBufferToS3: vi.fn() }));

type Row = Record<string, unknown>;
const artist = { id: "a1", userId: "u-artist" };
const file = (type: "IMAGE" | "VIDEO" | "AUDIO", name = "a.png") => ({ type, url: `https://cdn.example/${name}` });

function setup(over: { tier?: Row | null; post?: Row | null; collected?: number; followers?: Row[]; comment?: Row | null } = {}) {
  const created: Row[] = [];
  const db = {
    post: {
      create: vi.fn((args: { data: Row }) => {
        created.push(args.data);
        return Promise.resolve({ id: "p1" });
      }),
      findFirst: vi.fn().mockResolvedValue(over.post === undefined ? { id: "p1" } : over.post),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    postMedia: { deleteMany: vi.fn().mockResolvedValue({}) },
    postCollectible: { count: vi.fn().mockResolvedValue(over.collected ?? 0), groupBy: vi.fn().mockResolvedValue([]) },
    postComment: { findFirst: vi.fn().mockResolvedValue(over.comment === undefined ? { id: "c1", postId: "p1" } : over.comment), findMany: vi.fn().mockResolvedValue([]), delete: vi.fn().mockResolvedValue({}) },
    membershipTier: { findFirst: vi.fn().mockResolvedValue(over.tier === undefined ? { id: "t1" } : over.tier) },
    follow: { findMany: vi.fn().mockResolvedValue(over.followers ?? [{ userId: "f1" }, { userId: "f2" }]) },
    notificationEvent: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const activity = { set: vi.fn() };
  return { ctx: { db: db as unknown as Db, activity } as never, db, activity, created };
}

describe("createPost", () => {
  it("publishes with a trimmed title, its media in order and 100 collectible copies", async () => {
    const { ctx, created, activity } = setup();
    await expect(createPost(ctx, artist, { title: "  New drop ", body: " Hello ", media: [file("IMAGE", "1.png"), file("VIDEO", "2.mp4")] })).resolves.toEqual({ postId: "p1" });
    const data = created[0] as { title: string; body: string; artistId: string; tierId: null; media: { createMany: { data: Row[] } }; collectibles: { createMany: { data: Row[] } } };
    expect(data).toMatchObject({ title: "New drop", body: "Hello", artistId: "a1", tierId: null });
    expect(data.media.createMany.data.map((m) => m.sortOrder)).toEqual([0, 1]);
    expect(data.collectibles.createMany.data).toHaveLength(COLLECTIBLE_COPIES);
    expect(activity.set).toHaveBeenCalledWith({ targetType: "Post", targetId: "p1" });
  });

  it("allows a post with only a title", async () => {
    const { ctx, created } = setup();
    await createPost(ctx, artist, { title: "Just this" });
    expect(created[0]).toMatchObject({ body: "", media: undefined });
  });

  it("refuses an empty title, too many files, other file types and files not uploaded here", async () => {
    const { ctx } = setup();
    await expect(createPost(ctx, artist, { title: " " })).rejects.toThrow(/title/);
    await expect(createPost(ctx, artist, { title: "x", media: Array.from({ length: 11 }, () => file("IMAGE")) })).rejects.toThrow(/at most 10/);
    await expect(createPost(ctx, artist, { title: "x", media: [{ type: "DOCUMENT", url: "https://cdn.example/a.pdf" }] })).rejects.toThrow(/images, video and audio/);
    await expect(createPost(ctx, artist, { title: "x", media: [{ type: "IMAGE", url: "https://evil.example/a.png" }] })).rejects.toThrow(/Upload the files again/);
  });

  it("gates a post to one of the artist's active tiers", async () => {
    const ok = setup();
    await createPost(ok.ctx, artist, { title: "Members only", tierId: "t1" });
    expect(ok.created[0]).toMatchObject({ tierId: "t1" });
    expect(ok.db.membershipTier.findFirst).toHaveBeenCalledWith({ where: { id: "t1", artistId: "a1", isActive: true }, select: { id: true } });
    const bad = setup({ tier: null });
    await expect(createPost(bad.ctx, artist, { title: "x", tierId: "t9" })).rejects.toThrow(/active membership tiers/);
    expect(bad.db.post.create).not.toHaveBeenCalled();
  });

  it("tells every follower, and still publishes if that fails", async () => {
    const { ctx, db } = setup();
    await createPost(ctx, artist, { title: "x" });
    expect(db.notificationEvent.create).toHaveBeenCalledWith({ data: { type: "POST", actorId: "u-artist", entityId: "p1", notifications: { createMany: { data: [{ recipientId: "f1" }, { recipientId: "f2" }] } } } });

    const failing = setup();
    failing.db.notificationEvent.create.mockRejectedValue(new Error("down"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(createPost(failing.ctx, artist, { title: "x" })).resolves.toEqual({ postId: "p1" });
    quiet.mockRestore();
  });

  it("sends no notification when nobody follows", async () => {
    const { ctx, db } = setup({ followers: [] });
    await createPost(ctx, artist, { title: "x" });
    expect(db.notificationEvent.create).not.toHaveBeenCalled();
  });
});

describe("updatePost", () => {
  it("only edits the artist's own post", async () => {
    const { ctx, db } = setup({ post: null });
    await expect(updatePost(ctx, artist, { postId: "p9", title: "x" })).rejects.toThrow(/Post not found/);
    expect(db.post.findFirst).toHaveBeenCalledWith({ where: { id: "p9", artistId: "a1" }, select: { id: true } });
  });

  it("changes only what was sent, and can make a post public again", async () => {
    const { ctx, db } = setup();
    await updatePost(ctx, artist, { postId: "p1", title: " New ", tierId: null });
    expect(db.post.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { title: "New", tierId: null } });
    expect(db.postMedia.deleteMany).not.toHaveBeenCalled();
  });

  it("replaces the media list as a whole", async () => {
    const { ctx, db } = setup();
    await updatePost(ctx, artist, { postId: "p1", media: [file("AUDIO", "s.mp3")] });
    expect(db.postMedia.deleteMany).toHaveBeenCalledWith({ where: { postId: "p1" } });
    expect(db.post.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { media: { createMany: { data: [{ type: "AUDIO", url: "https://cdn.example/s.mp3", sortOrder: 0 }] } } } });
  });
});

describe("removePost", () => {
  it("deletes a post nobody collected", async () => {
    const { ctx, db } = setup();
    await removePost(ctx, artist, "p1");
    expect(db.post.delete).toHaveBeenCalledWith({ where: { id: "p1" } });
  });

  it("keeps a post fans have collected", async () => {
    const { ctx, db } = setup({ collected: 2 });
    await expect(removePost(ctx, artist, "p1")).rejects.toThrow(/2 fans have collected/);
    expect(db.post.delete).not.toHaveBeenCalled();
  });
});

describe("listPosts", () => {
  it("adds likes, comments, tier name and collected counts", async () => {
    const { ctx, db } = setup();
    db.post.findMany.mockResolvedValue([{ id: "p1", title: "A", body: "", tierId: "t1", createdAt: new Date(), updatedAt: new Date(), tier: { name: "Gold" }, media: [], _count: { likes: 3, comments: 1 } }]);
    db.postCollectible.groupBy.mockResolvedValue([{ postId: "p1", _count: { _all: 7 } }]);
    const [post] = await listPosts(ctx, artist);
    expect(post).toMatchObject({ tierName: "Gold", likes: 3, comments: 1, collected: 7 });
    expect(db.post.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { artistId: "a1", isImportOnly: false } }));
  });
});

describe("comments", () => {
  it("lists comments only for the artist's own post", async () => {
    const { ctx } = setup({ post: null });
    await expect(listComments(ctx, artist, "p9")).rejects.toThrow(/Post not found/);
  });

  it("removes a comment on the artist's own post, and nobody else's", async () => {
    const ok = setup();
    await removeComment(ok.ctx, artist, "c1");
    expect(ok.db.postComment.findFirst).toHaveBeenCalledWith({ where: { id: "c1", post: { artistId: "a1" } }, select: { id: true, postId: true } });
    expect(ok.db.postComment.delete).toHaveBeenCalledWith({ where: { id: "c1" } });
    const other = setup({ comment: null });
    await expect(removeComment(other.ctx, artist, "c2")).rejects.toThrow(/Comment not found/);
    expect(other.db.postComment.delete).not.toHaveBeenCalled();
  });
});
