import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { connectPage, disconnectFacebook, setAutoPublish } from "../services/facebook/connect";
import {
  attachmentsOf,
  firstLine,
  GraphApiError,
  makeState,
  openToken,
  readState,
  sealToken,
  verifyWebhookSignature,
} from "../services/facebook/graph";
import { importFacebookPost, receiveWebhook } from "../services/facebook/import";

vi.mock("@bandcoin/storage", () => ({ fetchPublicFile: vi.fn(), uploadBufferToS3: vi.fn() }));

const KEY = "ab".repeat(32);
beforeEach(() => {
  vi.stubEnv("SOCIAL_TOKEN_ENC_KEY", KEY);
  vi.stubEnv("FACEBOOK_APP_SECRET", "app-secret");
});
afterEach(() => vi.unstubAllEnvs());

const sign = (body: string) =>
  `sha256=${createHmac("sha256", "app-secret").update(body).digest("hex")}`;

describe("sealing and signing", () => {
  it("seals a token so only our key opens it", () => {
    const sealed = sealToken("page-token");
    expect(sealed).not.toContain("page-token");
    expect(openToken(sealed)).toBe("page-token");
    vi.stubEnv("SOCIAL_TOKEN_ENC_KEY", "cd".repeat(32));
    expect(() => openToken(sealed)).toThrow();
  });

  it("needs a real key", () => {
    vi.stubEnv("SOCIAL_TOKEN_ENC_KEY", "short");
    expect(() => sealToken("x")).toThrow(/64 hex/);
  });

  it("carries the artist and where to return, and refuses forged or old state", () => {
    const state = makeState({ artistId: "a1", redirect: "/settings" }, 1_000);
    expect(readState(state, 2_000)).toEqual({ artistId: "a1", redirect: "/settings" });
    expect(readState(state, 1_000 + 11 * 60_000)).toBeNull();
    const [payload] = state.split(".");
    const forged = Buffer.from(JSON.stringify({ a: "a2", r: "/x", n: "n", t: 1_000 })).toString(
      "base64url",
    );
    expect(readState(`${forged}.${state.split(".")[1]}`, 2_000)).toBeNull();
    expect(readState(`${payload}.bad`, 2_000)).toBeNull();
    expect(readState(null)).toBeNull();
  });

  it("checks Meta's webhook signature", () => {
    const body = '{"object":"page"}';
    expect(verifyWebhookSignature(body, sign(body))).toBe(true);
    expect(verifyWebhookSignature(body + " ", sign(body))).toBe(false);
    expect(verifyWebhookSignature(body, null)).toBe(false);
    expect(verifyWebhookSignature(body, "sha256=abc")).toBe(false);
    vi.stubEnv("FACEBOOK_APP_SECRET", "");
    expect(verifyWebhookSignature(body, sign(body))).toBe(false);
  });

  it("reads a post's pictures, album pictures one by one", () => {
    expect(
      attachmentsOf({
        id: "1",
        attachments: {
          data: [{ subattachments: { data: [{ url: "a" }, { url: "b" }] } }, { url: "c" }],
        },
      }).map((a) => a.url),
    ).toEqual(["a", "b", "c"]);
    expect(attachmentsOf({ id: "1", full_picture: "https://x/p.jpg" })[0]?.media?.image?.src).toBe(
      "https://x/p.jpg",
    );
    expect(firstLine("  Hello world\nmore")).toBe("Hello world");
  });
});

function setup(over: { connection?: unknown; post?: unknown; artist?: unknown } = {}) {
  const db = {
    facebookConnection: {
      findFirst: vi.fn().mockResolvedValue(over.connection ?? null),
      findUnique: vi.fn().mockResolvedValue(over.connection ?? null),
      upsert: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      delete: vi.fn().mockResolvedValue({}),
    },
    post: {
      findUnique: vi.fn().mockResolvedValue(over.post ?? null),
      create: vi.fn().mockResolvedValue({ id: "p1" }),
    },
    artist: {
      findUnique: vi
        .fn()
        .mockResolvedValue(
          over.artist === undefined
            ? { id: "a1", userId: "u1", facebook: { pageTokenEncrypted: sealToken("page-token") } }
            : over.artist,
        ),
    },
    job: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "j1" }),
    },
    follow: { findMany: vi.fn().mockResolvedValue([]) },
    notificationEvent: { create: vi.fn().mockResolvedValue({ id: "e1" }), findFirst: vi.fn() },
    notification: { createMany: vi.fn().mockResolvedValue({}) },
  };
  return { ctx: { db, activity: { set: vi.fn() } } as never, db };
}

const page = { id: "pg1", name: "Nova Music", access_token: "tok" };
const input = () => ({ sealedUserToken: sealToken("user-token"), pageId: "pg1" });

describe("connecting a page", () => {
  it("stores the page sealed, after listening to it", async () => {
    const { ctx, db } = setup();
    const subscribe = vi.fn().mockResolvedValue({});
    await connectPage(ctx, { id: "a1" }, input(), {
      pages: () => Promise.resolve([page]),
      subscribe,
    });
    expect(subscribe).toHaveBeenCalledWith("pg1", "tok");
    const data = db.facebookConnection.upsert.mock.calls[0]![0].create as {
      pageTokenEncrypted: string;
    };
    expect(data.pageTokenEncrypted).not.toContain("tok");
    expect(openToken(data.pageTokenEncrypted)).toBe("tok");
  });

  it("only lets you connect a page you manage, and a page nobody else has", async () => {
    const { ctx } = setup();
    await expect(
      connectPage(
        ctx,
        { id: "a1" },
        { ...input(), pageId: "other" },
        { pages: () => Promise.resolve([page]) },
      ),
    ).rejects.toThrow(/isn't one you manage/);
    const taken = setup({ connection: { artistId: "a2" } });
    await expect(
      connectPage(taken.ctx, { id: "a1" }, input(), { pages: () => Promise.resolve([page]) }),
    ).rejects.toThrow(/already connected to another artist/);
    expect(taken.db.facebookConnection.upsert).not.toHaveBeenCalled();
  });

  it("says plainly when Facebook won't let us listen, and stores nothing", async () => {
    const { ctx, db } = setup();
    await expect(
      connectPage(ctx, { id: "a1" }, input(), {
        pages: () => Promise.resolve([page]),
        subscribe: () => Promise.reject(new Error("(#200) permission")),
      }),
    ).rejects.toThrow(/Check the permissions/);
    expect(db.facebookConnection.upsert).not.toHaveBeenCalled();
  });

  it("asks to connect again when the sign-in cookie is no good", async () => {
    await expect(
      connectPage(setup().ctx, { id: "a1" }, { ...input(), sealedUserToken: "junk" }),
    ).rejects.toThrow(/sign-in expired/);
  });

  it("keeps the auto-publish setting only for a connected artist, and disconnects cleanly", async () => {
    const { ctx, db } = setup();
    await expect(setAutoPublish(ctx, { id: "a1" }, true)).resolves.toEqual({ autoPublish: true });
    db.facebookConnection.updateMany.mockResolvedValue({ count: 0 });
    await expect(setAutoPublish(ctx, { id: "a1" }, true)).rejects.toThrow(
      /Connect a Facebook page first/,
    );
    const connected = setup({
      connection: { pageId: "pg1", pageTokenEncrypted: sealToken("tok") },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    await disconnectFacebook(connected.ctx, { id: "a1" });
    expect(connected.db.facebookConnection.delete).toHaveBeenCalledWith({
      where: { artistId: "a1" },
    });
    vi.unstubAllGlobals();
  });
});

describe("the webhook", () => {
  const body = (changes: unknown[]) =>
    JSON.stringify({ object: "page", entry: [{ id: "pg1", changes }] });
  const added = {
    field: "feed",
    value: { item: "status", verb: "add", post_id: "pg1_9", message: "Hi" },
  };

  it("refuses a request that isn't from Meta", async () => {
    const { ctx, db } = setup({ connection: { artistId: "a1" } });
    expect(await receiveWebhook(ctx, body([added]), "sha256=" + "0".repeat(64))).toEqual({
      ok: false,
      status: 401,
    });
    expect(await receiveWebhook(ctx, "not json", sign("not json"))).toEqual({
      ok: false,
      status: 400,
    });
    expect(db.job.create).not.toHaveBeenCalled();
  });

  it("queues one import for a new post on a connected page", async () => {
    const { ctx, db } = setup({ connection: { artistId: "a1" } });
    const raw = body([added]);
    expect(await receiveWebhook(ctx, raw, sign(raw))).toEqual({ ok: true, status: 200, queued: 1 });
    expect(db.job.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "facebook.import",
        payload: expect.objectContaining({ artistId: "a1", fbPostId: "pg1_9" }),
      }),
    });
  });

  it("ignores edits, other kinds, unknown pages and pages nobody connected", async () => {
    const { ctx, db } = setup({ connection: { artistId: "a1" } });
    const raw = body([
      { field: "feed", value: { item: "status", verb: "edited", post_id: "1" } },
      { field: "feed", value: { item: "comment", verb: "add", post_id: "2" } },
      { field: "mention", value: { verb: "add", post_id: "3" } },
      { field: "feed", value: { item: "status", verb: "add" } },
    ]);
    expect(await receiveWebhook(ctx, raw, sign(raw))).toMatchObject({ queued: 0 });
    const none = setup({ connection: null });
    const one = body([added]);
    expect(await receiveWebhook(none.ctx, one, sign(one))).toMatchObject({ queued: 0 });
    expect(db.job.create).not.toHaveBeenCalled();
  });
});

describe("copying a post in", () => {
  const post = {
    id: "pg1_9",
    message: "New single out now!\nListen here",
    created_time: "2026-11-01T10:00:00+0000",
    permalink_url: "https://fb.com/p/9",
    attachments: {
      data: [{ media_type: "photo", media: { image: { src: "https://cdn/a.jpg" } } }],
    },
  };
  const deps = (over: Record<string, unknown> = {}) => ({
    getPost: vi.fn().mockResolvedValue(post),
    download: vi.fn().mockResolvedValue({ bytes: Buffer.from("img"), contentType: "image/jpeg" }),
    upload: vi.fn().mockResolvedValue("https://bucket/a.jpg"),
    ...over,
  });

  it("makes a visible post with its pictures re-hosted and no collectible copies", async () => {
    const { ctx, db } = setup();
    const out = await importFacebookPost(ctx, "a1", { fbPostId: "pg1_9" }, deps() as never);
    expect(out).toEqual({ outcome: "IMPORTED", postId: "p1", media: 1 });
    const data = db.post.create.mock.calls[0]![0].data as Record<string, unknown>;
    expect(data).toMatchObject({
      artistId: "a1",
      title: "New single out now!",
      facebookPostId: "pg1_9",
      body: "New single out now!\nListen here\n\nhttps://fb.com/p/9",
    });
    expect(data).not.toHaveProperty("collectibles");
    expect(data.media).toEqual({
      createMany: { data: [{ type: "IMAGE", url: "https://bucket/a.jpg", sortOrder: 0 }] },
    });
  });

  it("copies a post once", async () => {
    const { ctx, db } = setup({ post: { id: "old" } });
    expect(await importFacebookPost(ctx, "a1", { fbPostId: "pg1_9" }, deps() as never)).toEqual({
      outcome: "DUPLICATE",
    });
    expect(db.post.create).not.toHaveBeenCalled();
  });

  it("does nothing for an artist who disconnected", async () => {
    const { ctx } = setup({ artist: { id: "a1", userId: "u1", facebook: null } });
    expect(await importFacebookPost(ctx, "a1", { fbPostId: "x" }, deps() as never)).toEqual({
      outcome: "DISCONNECTED",
    });
  });

  it("drops the connection when Facebook says the access was taken away", async () => {
    const { ctx, db } = setup();
    const revoked = new GraphApiError(401, {
      error: { code: 190, message: "Error validating access token" },
    });
    const out = await importFacebookPost(
      ctx,
      "a1",
      { fbPostId: "x" },
      deps({ getPost: vi.fn().mockRejectedValue(revoked) }) as never,
    );
    expect(out).toEqual({ outcome: "TOKEN_REVOKED" });
    expect(db.facebookConnection.delete).toHaveBeenCalledWith({ where: { artistId: "a1" } });
    expect(db.post.create).not.toHaveBeenCalled();
  });

  it("uses what the webhook carried when Facebook won't give the post back", async () => {
    const { ctx, db } = setup();
    const out = await importFacebookPost(
      ctx,
      "a1",
      {
        fbPostId: "x",
        fallback: {
          message: "From the webhook",
          photos: ["https://cdn/p.jpg"],
          createdTime: 1_800_000_000,
        },
      },
      deps({ getPost: vi.fn().mockRejectedValue(new Error("network")) }) as never,
    );
    expect(out).toMatchObject({ outcome: "IMPORTED", media: 1 });
    const data = db.post.create.mock.calls[0]![0].data as { title: string; createdAt: Date };
    expect(data.title).toBe("From the webhook");
    expect(data.createdAt.getTime()).toBe(1_800_000_000_000);
  });

  it("keeps the post when one picture won't copy, and skips a post with nothing in it", async () => {
    const { ctx } = setup();
    const out = await importFacebookPost(
      ctx,
      "a1",
      { fbPostId: "x" },
      deps({ download: vi.fn().mockRejectedValue(new Error("403")) }) as never,
    );
    expect(out).toMatchObject({ outcome: "IMPORTED", media: 0 });
    const empty = await importFacebookPost(
      ctx,
      "a1",
      { fbPostId: "y" },
      deps({ getPost: vi.fn().mockResolvedValue({ id: "y" }) }) as never,
    );
    expect(empty).toEqual({ outcome: "EMPTY" });
  });
});
