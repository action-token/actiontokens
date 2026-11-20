import { describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

import {
  COLLECTIBLE_COPIES,
  createPost,
  listComments,
  listPosts,
  removeComment,
  removePost,
  updatePost,
} from "../services/artist/posts";

vi.mock("@actiontokens/storage", () => ({
  isOwnS3Url: (url: string) => url.startsWith("https://cdn.example/"),
  uploadBufferToS3: vi.fn(),
}));

type Row = Record<string, unknown>;
const artist = { id: "a1", userId: "u-artist" };
const file = (type: "IMAGE" | "VIDEO" | "AUDIO", name = "a.png") => ({
  type,
  url: `https://cdn.example/${name}`,
});

function setup(
  over: {
    tier?: Row | null;
    post?: Row | null;
    collected?: number;
    followers?: Row[];
    comment?: Row | null;
  } = {},
) {
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
    postCollectible: {
      count: vi.fn().mockResolvedValue(over.collected ?? 0),
      groupBy: vi.fn().mockResolvedValue([]),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    postComment: {
      findFirst: vi
        .fn()
        .mockResolvedValue(over.comment === undefined ? { id: "c1", postId: "p1" } : over.comment),
      findMany: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue({}),
    },
    membershipTier: {
      findFirst: vi.fn().mockResolvedValue(over.tier === undefined ? { id: "t1" } : over.tier),
    },
    follow: {
      findMany: vi.fn().mockResolvedValue(over.followers ?? [{ userId: "f1" }, { userId: "f2" }]),
    },
    notificationEvent: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const activity = { set: vi.fn() };
  return { ctx: { db: db as unknown as Db, activity } as never, db, activity, created };
}

describe("createPost", () => {
  it("publishes with a trimmed title, its media in order and 100 collectible copies", async () => {
    const { ctx, created, activity } = setup();
    await expect(
      createPost(ctx, artist, {
        title: "  New drop ",
        body: " Hello ",
        media: [file("IMAGE", "1.png"), file("VIDEO", "2.mp4")],
      }),
    ).resolves.toEqual({ postId: "p1" });
    const data = created[0] as {
      title: string;
      body: string;
      organizationId: string;
      tierId: null;
      media: { createMany: { data: Row[] } };
      collectibles: { createMany: { data: Row[] } };
    };
    expect(data).toMatchObject({ title: "New drop", body: "Hello", organizationId: "a1" });
    expect(data).not.toHaveProperty("tierId");
    expect(data.media.createMany.data.map((m) => m.sortOrder)).toEqual([0, 1]);
    expect(data.collectibles.createMany.data).toHaveLength(COLLECTIBLE_COPIES);
    expect(activity.set).toHaveBeenCalledWith({ targetType: "Post", targetId: "p1" });
  });

  it("saves who can see, comment and collect, with each members rule's tier, and the copies", async () => {
    const { ctx, created } = setup();
    await createPost(ctx, artist, {
      title: "Settings",
      audience: "FOLLOWERS",
      tierId: "t9",
      commentAccess: "MEMBERS",
      commentTierId: "t1",
      collectAccess: "NOBODY",
      collectTierId: "t1",
      copies: 25,
    });
    expect(created[0]).toMatchObject({
      audience: "FOLLOWERS",
      tierId: null,
      commentAccess: "MEMBERS",
      commentTierId: "t1",
      collectAccess: "NOBODY",
      collectTierId: null,
    });
    expect(
      (created[0] as { collectibles: { createMany: { data: Row[] } } }).collectibles.createMany
        .data,
    ).toHaveLength(25);
  });

  it("asks for a tier when a rule is members only, and keeps copies in range", async () => {
    const { ctx } = setup({ tier: null });
    await expect(
      createPost(ctx, artist, { title: "X", commentAccess: "MEMBERS", commentTierId: null }),
    ).rejects.toMatchObject({ message: "Pick one of your active membership tiers." });
    await expect(createPost(ctx, artist, { title: "X", copies: 0 })).rejects.toMatchObject({
      message: "Pick between 1 and 10,000 copies.",
    });
  });

  it("keeps a mix of images, video and songs in order, with each song's name", async () => {
    const { ctx, created } = setup();
    await createPost(ctx, artist, {
      title: "Mixed",
      media: [
        file("AUDIO", "a.mp3"),
        file("IMAGE", "b.png"),
        { ...file("AUDIO", "c.mp3"), title: "  Night Drive (demo) " },
        file("VIDEO", "d.mp4"),
      ],
    });
    const rows = (created[0] as { media: { createMany: { data: Row[] } } }).media.createMany.data;
    expect(rows.map((row) => [row.type, row.title, row.sortOrder])).toEqual([
      ["AUDIO", null, 0],
      ["IMAGE", null, 1],
      ["AUDIO", "Night Drive (demo)", 2],
      ["VIDEO", null, 3],
    ]);
  });

  it("allows a post with only a title", async () => {
    const { ctx, created } = setup();
    await createPost(ctx, artist, { title: "Just this" });
    expect(created[0]).toMatchObject({ body: "", media: undefined });
  });

  it("refuses an empty title, too many files, other file types and files not uploaded here", async () => {
    const { ctx } = setup();
    await expect(createPost(ctx, artist, { title: " " })).rejects.toThrow(/title/);
    await expect(
      createPost(ctx, artist, {
        title: "x",
        media: Array.from({ length: 11 }, () => file("IMAGE")),
      }),
    ).rejects.toThrow(/at most 10/);
    await expect(
      createPost(ctx, artist, {
        title: "x",
        media: [{ type: "DOCUMENT", url: "https://cdn.example/a.pdf" }],
      }),
    ).rejects.toThrow(/images, video and audio/);
    await expect(
      createPost(ctx, artist, {
        title: "x",
        media: [{ type: "IMAGE", url: "https://evil.example/a.png" }],
      }),
    ).rejects.toThrow(/Upload the files again/);
  });

  it("gates a post to one of the artist's active tiers", async () => {
    const ok = setup();
    await createPost(ok.ctx, artist, { title: "Members only", tierId: "t1" });
    expect(ok.created[0]).toMatchObject({ tierId: "t1" });
    expect(ok.db.membershipTier.findFirst).toHaveBeenCalledWith({
      where: { id: "t1", organizationId: "a1", isActive: true },
      select: { id: true },
    });
    const bad = setup({ tier: null });
    await expect(createPost(bad.ctx, artist, { title: "x", tierId: "t9" })).rejects.toThrow(
      /active membership tiers/,
    );
    expect(bad.db.post.create).not.toHaveBeenCalled();
  });

  it("tells every follower, and still publishes if that fails", async () => {
    const { ctx, db } = setup();
    await createPost(ctx, artist, { title: "x" });
    expect(db.notificationEvent.create).toHaveBeenCalledWith({
      data: {
        type: "POST",
        actorId: "u-artist",
        entityId: "p1",
        notifications: {
          createMany: {
            data: [
              { recipientId: "f1", isForArtist: false },
              { recipientId: "f2", isForArtist: false },
            ],
          },
        },
      },
    });

    const failing = setup();
    failing.db.notificationEvent.create.mockRejectedValue(new Error("down"));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(createPost(failing.ctx, artist, { title: "x" })).resolves.toEqual({
      postId: "p1",
    });
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
    await expect(updatePost(ctx, artist, { postId: "p9", title: "x" })).rejects.toThrow(
      /Post not found/,
    );
    expect(db.post.findFirst).toHaveBeenCalledWith({
      where: { id: "p9", organizationId: "a1" },
      select: { id: true },
    });
  });

  it("changes only what was sent, and can make a post public again", async () => {
    const { ctx, db } = setup();
    await updatePost(ctx, artist, { postId: "p1", title: " New ", tierId: null });
    expect(db.post.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { title: "New", audience: "EVERYONE", tierId: null },
    });
    expect(db.postMedia.deleteMany).not.toHaveBeenCalled();
  });

  it("adds copies any time, but removes them only while nobody has collected one", async () => {
    const more = setup();
    more.db.postCollectible.count.mockResolvedValueOnce(100).mockResolvedValueOnce(4);
    await updatePost(more.ctx, artist, { postId: "p1", copies: 150 });
    expect(more.db.postCollectible.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([{ postId: "p1" }]),
    });
    expect(
      (more.db.postCollectible.createMany.mock.calls[0]![0] as { data: Row[] }).data,
    ).toHaveLength(50);

    const fewer = setup();
    fewer.db.postCollectible.count.mockResolvedValueOnce(100).mockResolvedValueOnce(4);
    await expect(updatePost(fewer.ctx, artist, { postId: "p1", copies: 50 })).rejects.toMatchObject(
      { message: "Fans have collected 4 copies already, so the number can only go up." },
    );

    const untouched = setup();
    untouched.db.postCollectible.count.mockResolvedValueOnce(100).mockResolvedValueOnce(0);
    untouched.db.postCollectible.findMany.mockResolvedValue([{ id: "k1" }, { id: "k2" }]);
    await updatePost(untouched.ctx, artist, { postId: "p1", copies: 98 });
    expect(untouched.db.postCollectible.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { postId: "p1", collectorId: null }, take: 2 }),
    );
    expect(untouched.db.postCollectible.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["k1", "k2"] } },
    });
  });

  it("replaces the media list as a whole", async () => {
    const { ctx, db } = setup();
    await updatePost(ctx, artist, { postId: "p1", media: [file("AUDIO", "s.mp3")] });
    expect(db.postMedia.deleteMany).toHaveBeenCalledWith({ where: { postId: "p1" } });
    expect(db.post.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: {
        media: {
          createMany: {
            data: [{ type: "AUDIO", url: "https://cdn.example/s.mp3", title: null, sortOrder: 0 }],
          },
        },
      },
    });
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
    db.post.findMany.mockResolvedValue([
      {
        id: "p1",
        title: "A",
        body: "",
        tierId: "t1",
        createdAt: new Date(),
        updatedAt: new Date(),
        tier: { name: "Gold" },
        media: [],
        _count: { likes: 3, comments: 1 },
      },
    ]);
    db.postCollectible.groupBy.mockResolvedValue([{ postId: "p1", _count: { _all: 7 } }]);
    const [post] = await listPosts(ctx, artist);
    expect(post).toMatchObject({ tierName: "Gold", likes: 3, comments: 1, collected: 7 });
    expect(db.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "a1", isImportOnly: false } }),
    );
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
    expect(ok.db.postComment.findFirst).toHaveBeenCalledWith({
      where: { id: "c1", post: { organizationId: "a1" } },
      select: { id: true, postId: true },
    });
    expect(ok.db.postComment.delete).toHaveBeenCalledWith({ where: { id: "c1" } });
    const other = setup({ comment: null });
    await expect(removeComment(other.ctx, artist, "c2")).rejects.toThrow(/Comment not found/);
    expect(other.db.postComment.delete).not.toHaveBeenCalled();
  });
});
