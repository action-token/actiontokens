import { describe, expect, it, vi } from "vitest";

import { AppError, ErrorCodes } from "@bandcoin/errors";

import type { SessionUser } from "../context";
import { blockedReason, lyricsOf } from "../services/studio/lyria";
import { runMusic, startMusic, sweepStuckRuns } from "../services/studio/music";

const user: SessionUser = { id: "u1", role: "FAN", walletAddress: "G1", walletType: "email" };

function setup(over: { canPay?: boolean; status?: string } = {}) {
  const ledger: Record<string, unknown>[] = [];
  const tx = {
    studioBalance: {
      updateMany: vi.fn().mockResolvedValue({ count: over.canPay === false ? 0 : 1 }),
      update: vi.fn().mockResolvedValue({}),
    },
    studioLedgerEntry: {
      create: vi.fn((args: { data: Record<string, unknown> }) => {
        ledger.push(args.data);
        return Promise.resolve({ id: "hold1" });
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({ userId: "u1", amount: -11, generationId: "g1" }),
    },
  };
  const db = {
    ...tx,
    studioLedgerEntry: {
      ...tx.studioLedgerEntry,
      findFirst: vi.fn().mockResolvedValue({ id: "hold1" }),
    },
    appSetting: { findUnique: vi.fn().mockResolvedValue(null) },
    artist: { findUnique: vi.fn().mockResolvedValue(null) },
    generation: {
      create: vi.fn().mockResolvedValue({ id: "g1" }),
      delete: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: over.status === "RUNNING" ? 0 : 1 }),
      findUniqueOrThrow: vi
        .fn()
        .mockResolvedValue({ prompt: "lo-fi beat", model: "lyria-3-pro-preview" }),
      findMany: vi.fn().mockResolvedValue([{ id: "g1" }]),
    },
    job: { findFirst: vi.fn(), create: vi.fn().mockResolvedValue({ id: "j1" }) },
    $transaction: vi.fn((run: (client: unknown) => unknown) => run(tx)),
  };
  const ctx = { db, activity: { set: vi.fn() } } as never;
  return { ctx, db, tx, ledger };
}

const provider = (result: "ok" | "blocked") => ({
  generate: vi.fn(() =>
    result === "ok"
      ? Promise.resolve({ audio: Buffer.from("mp3"), mimeType: "audio/mpeg", lyrics: null })
      : Promise.reject(
          new AppError(ErrorCodes.VALIDATION_FAILED, { message: blockedReason("OTHER") }),
        ),
  ),
});

describe("starting a music run", () => {
  it("prices a full song, holds the coins and queues it once", async () => {
    const { ctx, db, ledger } = setup();
    expect(await startMusic(ctx, user, { kind: "SONG", prompt: " lo-fi beat " })).toEqual({
      generationId: "g1",
      coins: 11,
    });
    expect(db.generation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          prompt: "lo-fi beat",
          model: "lyria-3-pro-preview",
          cost: 11,
        }),
      }),
    );
    expect(ledger).toEqual([
      expect.objectContaining({ kind: "SPEND", status: "PENDING", amount: -11 }),
    ]);
    expect(db.job.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "studio.music", maxAttempts: 1 }),
    });
  });

  it("starts nothing without enough coins, and leaves no run behind", async () => {
    const { ctx, db } = setup({ canPay: false });
    await expect(startMusic(ctx, user, { kind: "CLIP", prompt: "lo-fi beat" })).rejects.toThrow(
      /needs 6 coins/,
    );
    expect(db.generation.delete).toHaveBeenCalledWith({ where: { id: "g1" } });
    expect(db.job.create).not.toHaveBeenCalled();
  });

  it("asks for a real description", async () => {
    const { ctx } = setup();
    await expect(startMusic(ctx, user, { kind: "CLIP", prompt: "  " })).rejects.toThrow(
      /3 to 2,000 characters/,
    );
  });
});

describe("lyrics", () => {
  it("treats Lyria's instrumental marker as no words", () => {
    expect(lyricsOf("<instrumental>")).toBeNull();
    expect(lyricsOf("  ")).toBeNull();
    expect(lyricsOf("[Verse]\nCity lights")).toBe("[Verse]\nCity lights");
  });
});

describe("running it", () => {
  it("saves the audio and keeps the coins", async () => {
    const { ctx, db, tx } = setup();
    const upload = vi.fn().mockResolvedValue("https://bucket/studio-music-1");
    const done = await runMusic(ctx, "g1", { provider: provider("ok"), upload });
    expect(done).toMatchObject({ outcome: "DONE", url: "https://bucket/studio-music-1" });
    expect(upload).toHaveBeenCalledWith(Buffer.from("mp3"), "audio/mpeg", {
      keyPrefix: "studio-music-",
    });
    expect(db.generation.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: expect.objectContaining({ status: "SUCCEEDED", progress: 100 }),
    });
    expect(tx.studioBalance.update).not.toHaveBeenCalled();
  });

  it("gives the coins back with Lyria's reason when it won't make the music", async () => {
    const { ctx, db, ledger, tx } = setup();
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const done = await runMusic(ctx, "g1", { provider: provider("blocked"), upload: vi.fn() });
    quiet.mockRestore();
    expect(done).toMatchObject({
      outcome: "FAILED",
      reason: expect.stringMatching(/Lyria didn't make/),
    });
    expect(db.generation.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: expect.objectContaining({ status: "FAILED" }),
    });
    expect(ledger).toEqual([expect.objectContaining({ kind: "REFUND", amount: 11 })]);
    expect(tx.studioBalance.update).toHaveBeenCalledWith({
      where: { userId: "u1" },
      data: { balance: { increment: 11 } },
    });
  });

  it("never runs the same run twice", async () => {
    const { ctx } = setup({ status: "RUNNING" });
    const music = provider("ok");
    expect(await runMusic(ctx, "g1", { provider: music })).toMatchObject({ outcome: "SKIPPED" });
    expect(music.generate).not.toHaveBeenCalled();
  });

  it("refunds runs a stopped worker left behind", async () => {
    const { ctx, ledger } = setup();
    expect(await sweepStuckRuns(ctx)).toEqual({ refunded: 1 });
    expect(ledger).toEqual([expect.objectContaining({ kind: "REFUND" })]);
  });

  it("gives a paused live jam hours before it counts as left behind", async () => {
    const { ctx, db } = setup();
    const now = new Date("2026-01-01T12:00:00Z");
    await sweepStuckRuns(ctx, now);
    const where = db.generation.findMany.mock.calls[0]![0].where.OR as {
      model: unknown;
      updatedAt: { lt: Date };
    }[];
    const live = where.find((clause) => clause.model === "lyria-realtime-exp")!;
    const rest = where.find((clause) => clause.model !== "lyria-realtime-exp")!;
    expect(now.getTime() - live.updatedAt.lt.getTime()).toBe(3 * 60 * 60_000);
    expect(now.getTime() - rest.updatedAt.lt.getTime()).toBe(20 * 60_000);
  });
});
