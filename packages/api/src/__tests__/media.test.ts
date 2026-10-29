import { describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

vi.mock("@bandcoin/storage", () => ({
  signedMediaUrl: (key: string) => Promise.resolve(`https://signed/${key}`),
}));

import { playbackFor, previewByteRange } from "../services/media/playback";

const legacy = {
  mediaType: "AUDIO",
  sourceUrl: "https://cdn/full.mp3",
  demoUrl: null,
  status: "LEGACY",
  streamKey: null,
  previewKey: null,
  durationSec: 200,
};

function dbWith(media: object | null, owned: number | null = null) {
  return {
    item: {
      findFirst: vi
        .fn()
        .mockResolvedValue({ createdById: "creator", artist: { userId: "artist-user" }, media }),
    },
    ownership: {
      findUnique: vi.fn().mockResolvedValue(owned === null ? null : { quantity: owned }),
    },
  } as unknown as Db;
}

describe("playbackFor", () => {
  it("never gives a non-owner the full file", async () => {
    const guest = await playbackFor(dbWith(legacy), null, "item-1");
    expect(guest).toEqual({ url: "/api/media/preview/item-1", full: false, durationSec: 30 });
    const fan = await playbackFor(dbWith(legacy, 0), "fan", "item-1");
    expect(fan.full).toBe(false);
    expect(fan.url).not.toContain("full.mp3");
  });

  it("gives owners, the creator and the artist the full track", async () => {
    expect(await playbackFor(dbWith(legacy, 1), "fan", "item-1")).toMatchObject({
      url: "https://cdn/full.mp3",
      full: true,
    });
    expect((await playbackFor(dbWith(legacy), "creator", "item-1")).full).toBe(true);
    expect((await playbackFor(dbWith(legacy), "artist-user", "item-1")).full).toBe(true);
  });

  it("uses signed URLs once media is transcoded", async () => {
    const ready = {
      ...legacy,
      status: "READY",
      streamKey: "stream/a.m4a",
      previewKey: "preview/a.m4a",
    };
    expect(await playbackFor(dbWith(ready, 2), "fan", "item-1")).toMatchObject({
      url: "https://signed/stream/a.m4a",
      full: true,
    });
    expect(await playbackFor(dbWith(ready), null, "item-1")).toMatchObject({
      url: "https://signed/preview/a.m4a",
      full: false,
    });
  });

  it("refuses items with nothing to play", async () => {
    await expect(playbackFor(dbWith(null), null, "item-1")).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
    });
  });
});

describe("previewByteRange", () => {
  it("cuts 30 s from the artist's start point", () => {
    // 200 s at 16 000 bytes/s
    expect(previewByteRange({ contentLength: 3_200_000, durationSec: 200, startSec: 30 })).toEqual({
      start: 480_000,
      end: 959_999,
    });
  });

  it("stays inside the file when the start is late or the track is short", () => {
    expect(previewByteRange({ contentLength: 3_200_000, durationSec: 200, startSec: 190 })).toEqual(
      { start: 2_720_000, end: 3_199_999 },
    );
    expect(previewByteRange({ contentLength: 400_000, durationSec: 20, startSec: 5 })).toEqual({
      start: 0,
      end: 399_999,
    });
  });
});
