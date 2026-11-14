import { execFileSync } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import { probeDuration } from "./ffmpeg";
import { type MediaIo, transcodeItem } from "./transcode";

const hasFfmpeg = (() => {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

type Row = Record<string, unknown>;

function setup(media: Row | null, stems: Row[] = []) {
  const state = media ? { ...media } : null;
  const statuses: unknown[] = [];
  const db = {
    itemMedia: {
      findUnique: vi.fn(() => Promise.resolve(state)),
      update: vi.fn(({ data }: { data: Row }) => {
        if (data.status) statuses.push(data.status);
        Object.assign(state!, data);
        return Promise.resolve(state);
      }),
    },
    itemStem: {
      findMany: vi.fn(() => Promise.resolve(stems)),
      update: vi.fn(({ where, data }: { where: { id: string }; data: Row }) => {
        Object.assign(
          stems.find((stem) => stem.id === where.id)!,
          data,
        );
        return Promise.resolve({});
      }),
    },
  };
  return { db: db as unknown as Db, state, statuses, stems };
}

describe.skipIf(!hasFfmpeg)("transcodeItem (real ffmpeg)", () => {
  let dir = "";
  let tone = "";
  const lengths: Record<string, number> = {};
  const uploaded: Record<string, string> = {};
  const io: MediaIo = {
    download: (_url, dest) => copyFile(tone, dest),
    put: async (key, file, contentType) => {
      uploaded[key] = contentType;
      if (contentType === "audio/mp4") lengths[key] = await probeDuration(file);
      else lengths[key] = (JSON.parse(await readFile(file, "utf8")) as number[]).length;
    },
  };

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "transcode-test-"));
    tone = path.join(dir, "tone.wav");
    execFileSync("ffmpeg", [
      ...["-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=40", tone],
    ]);
  });
  afterAll(() => rm(dir, { recursive: true, force: true }));

  it("makes the stream, a 30 s preview, the waveform and the stems, then marks it ready", async () => {
    const { db, state, statuses, stems } = setup(
      {
        mediaType: "AUDIO",
        sourceUrl: "https://cdn/song.wav",
        previewStartSec: 25,
        status: "PENDING",
        item: { artistId: "a1" },
      },
      [
        { id: "s1", sourceUrl: "https://cdn/vocals.wav" },
        { id: "demo", sourceUrl: "/demo-stems/drums.mp3" },
      ],
    );
    const result = await transcodeItem(db, io, { itemId: "i1", part: "all", lastAttempt: false });

    expect(result).toMatchObject({ durationSec: 40, stems: 1 });
    expect(statuses).toEqual(["PROCESSING", "READY"]);
    const keys = state as Record<string, string>;
    expect(keys.streamKey).toMatch(/^testnet\/artists\/a1\/items\/i1\/media\/[0-9a-f]{32}\/full\.m4a$/);
    expect(lengths[keys.streamKey!]).toBeCloseTo(40, 0);
    // Pulled back from 25 s so the 30 s fit inside 40 s.
    expect(lengths[keys.previewKey!]).toBeCloseTo(30, 0);
    expect(lengths[keys.waveformKey!]).toBe(800);
    expect(uploaded[keys.waveformKey!]).toBe("application/json");
    expect(stems[0]?.streamKey).toMatch(/\/stems\/s1\.m4a$/);
    expect(stems[1]?.streamKey).toBeUndefined();
  }, 60_000);

  it("re-cuts only the preview, and only once the song is processed", async () => {
    const ready = setup({
      mediaType: "AUDIO",
      sourceUrl: "https://cdn/song.wav",
      previewStartSec: 0,
      status: "READY",
      streamKey: "stream/i1/old/full.m4a",
    });
    await transcodeItem(ready.db, io, { itemId: "i1", part: "preview", lastAttempt: false });
    expect(ready.state).toMatchObject({ status: "READY", streamKey: "stream/i1/old/full.m4a" });
    expect((ready.state as Row).previewKey).toMatch(/preview\.m4a$/);
    expect(ready.statuses).toEqual([]);

    const pending = setup({
      mediaType: "AUDIO",
      sourceUrl: "x",
      previewStartSec: 0,
      status: "PENDING",
    });
    await expect(
      transcodeItem(pending.db, io, { itemId: "i1", part: "preview", lastAttempt: false }),
    ).resolves.toMatchObject({ skipped: "PENDING" });
  }, 60_000);
});

describe("when processing fails", () => {
  const broken: MediaIo = {
    download: () => Promise.reject(new Error("404")),
    put: () => Promise.resolve(),
  };
  const song = {
    mediaType: "AUDIO",
    sourceUrl: "https://cdn/gone.mp3",
    previewStartSec: 0,
    status: "PENDING",
  };

  it("goes back to waiting while tries are left, and shows as failed after the last", async () => {
    const early = setup(song);
    await expect(
      transcodeItem(early.db, broken, { itemId: "i1", part: "all", lastAttempt: false }),
    ).rejects.toThrow("404");
    expect(early.statuses).toEqual(["PROCESSING", "PENDING"]);

    const last = setup(song);
    await expect(
      transcodeItem(last.db, broken, { itemId: "i1", part: "all", lastAttempt: true }),
    ).rejects.toThrow("404");
    expect(last.statuses).toEqual(["PROCESSING", "FAILED"]);
  });

  it("leaves anything that isn't audio alone", async () => {
    const video = setup({ ...song, mediaType: "VIDEO" });
    await expect(
      transcodeItem(video.db, broken, { itemId: "i1", part: "all", lastAttempt: true }),
    ).resolves.toMatchObject({ skipped: "no audio" });
    expect(video.statuses).toEqual([]);
  });
});
