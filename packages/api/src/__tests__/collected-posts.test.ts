import { describe, expect, it, vi } from "vitest";

import type { SessionUser } from "../context";
import { collectedPost, collectedPosts, postCover } from "../services/feed/collected";

const fan: SessionUser = { id: "fan", role: "FAN", walletAddress: "GFAN", walletType: "email" };
const at = new Date("2026-11-02T10:00:00Z");

const post = (media: { type: string; url: string; thumbnailUrl: string | null }[]) => ({
  id: "p1",
  title: "Tour diary",
  body: "Day 3",
  createdAt: at,
  artist: { name: "DJ Tamsin", slug: "dj-tamsin", avatarUrl: "https://x/avatar.jpg" },
  media: media.map((file, i) => ({ id: `m${i}`, title: null, ...file })),
});

describe("postCover", () => {
  it("uses the first photo, then a video still, then the artist", () => {
    const video = { type: "VIDEO", url: "https://x/v.mp4", thumbnailUrl: "https://x/still.jpg" };
    const photo = { type: "IMAGE", url: "https://x/p.jpg", thumbnailUrl: null };
    expect(postCover(post([video, photo]))).toBe("https://x/p.jpg");
    expect(postCover(post([video]))).toBe("https://x/still.jpg");
    expect(postCover(post([]))).toBe("https://x/avatar.jpg");
  });
});

describe("collected posts", () => {
  it("lists the fan's posts newest first with a cover and what's inside", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "k1",
        collectedAt: at,
        post: post([
          { type: "AUDIO", url: "https://x/a.mp3", thumbnailUrl: null },
          { type: "IMAGE", url: "https://x/p.jpg", thumbnailUrl: null },
        ]),
      },
    ]);
    const ctx = { db: { postCollectible: { findMany, count: vi.fn().mockResolvedValue(1) } } };
    const page = await collectedPosts(ctx as never, fan, null);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { collectorId: "fan", post: { isImportOnly: false } } }),
    );
    expect(page).toEqual({
      total: 1,
      next: null,
      items: [
        {
          postId: "p1",
          title: "Tour diary",
          artist: expect.objectContaining({ slug: "dj-tamsin" }),
          cover: "https://x/p.jpg",
          kinds: ["AUDIO", "IMAGE"],
          collectedAt: at,
        },
      ],
    });
  });

  it("says which copy the fan holds", async () => {
    const count = vi.fn().mockResolvedValueOnce(100).mockResolvedValueOnce(3);
    const ctx = {
      db: {
        postCollectible: {
          findFirst: vi.fn().mockResolvedValue({ collectedAt: at, post: post([]) }),
          count,
        },
      },
    };
    expect(await collectedPost(ctx as never, fan, "p1")).toMatchObject({
      title: "Tour diary",
      copy: { number: 3, total: 100 },
    });
  });

  it("refuses a post the fan hasn't collected", async () => {
    const ctx = { db: { postCollectible: { findFirst: vi.fn().mockResolvedValue(null) } } };
    await expect(collectedPost(ctx as never, fan, "p1")).rejects.toMatchObject({
      message: "This post isn't in your collection.",
    });
  });
});
