import { describe, expect, it, vi } from "vitest";

import { AppError, ErrorCodes } from "@bandcoin/errors";

import type { SessionUser } from "../context";
import {
  library,
  providerPrompt,
  removeGeneration,
  runGeneration,
  startGeneration,
} from "../services/studio/generate";
import { generateInput } from "../services/studio/generate-input";
import { googleProvider, type GenerateProvider } from "../services/studio/google";

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
        .mockResolvedValue({ userId: "u1", amount: -6, generationId: "g1" }),
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
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: over.status === "RUNNING" ? 0 : 1 }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    job: { findFirst: vi.fn(), create: vi.fn().mockResolvedValue({ id: "j1" }) },
    $transaction: vi.fn((run: (client: unknown) => unknown) => run(tx)),
  };
  const ctx = { db, activity: { set: vi.fn() } } as never;
  return { ctx, db, tx, ledger };
}

const provider = (over: Partial<GenerateProvider> = {}): GenerateProvider => ({
  image: vi.fn().mockResolvedValue({ bytes: Buffer.from("png"), mimeType: "image/png" }),
  video: vi.fn().mockResolvedValue({ bytes: Buffer.from("mp4"), mimeType: "video/mp4" }),
  write: vi.fn().mockResolvedValue({ text: "Hello fans", tokens: 42 }),
  ...over,
});
const upload = vi.fn().mockResolvedValue("https://bucket/out");

describe("what each tool accepts", () => {
  it("fills in sensible defaults", () => {
    expect(generateInput.parse({ tool: "IMAGE", prompt: "a red guitar" })).toMatchObject({
      aspectRatio: "1:1",
      style: "",
    });
    expect(generateInput.parse({ tool: "SOCIAL", topic: "new single" })).toMatchObject({
      platform: "Instagram",
      numberOfVariations: 3,
    });
  });

  it("turns away odd values", () => {
    expect(() =>
      generateInput.parse({ tool: "VIDEO", prompt: "ok", aspectRatio: "1:1" }),
    ).toThrow();
    expect(() => generateInput.parse({ tool: "TEXT", prompt: "x" })).toThrow();
    expect(() => generateInput.parse({ tool: "SEO", topic: "hello", wordCount: 99_999 })).toThrow();
  });

  it("folds a style into the image prompt and builds the writing briefs", () => {
    expect(
      providerPrompt(generateInput.parse({ tool: "IMAGE", prompt: "a guitar", style: "Anime" })),
    ).toBe("a guitar, Anime style");
    const seo = providerPrompt(generateInput.parse({ tool: "SEO", topic: "indie folk" }));
    expect(seo).toContain('about "indie folk"');
    expect(seo).toContain("SEO Meta Title");
    const post = providerPrompt(
      generateInput.parse({ tool: "SOCIAL", topic: "tour", platform: "X", includeHashtags: false }),
    );
    expect(post).toContain("max 280 characters");
    expect(post).toContain("No hashtags");
  });
});

describe("starting a run", () => {
  it("holds the price and queues the worker's job", async () => {
    const { ctx, db, ledger } = setup();
    const started = await startGeneration(
      ctx,
      user,
      generateInput.parse({ tool: "IMAGE", prompt: "a red guitar" }),
    );
    expect(started).toEqual({ generationId: "g1", coins: 9 });
    expect(db.generation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "IMAGE", model: "gemini-3.1-flash-image" }),
      }),
    );
    expect(ledger).toEqual([
      expect.objectContaining({ kind: "SPEND", status: "PENDING", amount: -9 }),
    ]);
    expect(db.job.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "studio.generate", maxAttempts: 1 }),
    });
  });

  it("never starts when the coins aren't there", async () => {
    const { ctx, db } = setup({ canPay: false });
    await expect(
      startGeneration(ctx, user, generateInput.parse({ tool: "TEXT", prompt: "write a bio" })),
    ).rejects.toThrow(/needs \d+ coins/);
    expect(db.generation.delete).toHaveBeenCalledWith({ where: { id: "g1" } });
    expect(db.job.create).not.toHaveBeenCalled();
  });
});

describe("running one", () => {
  it("saves an image and keeps the coins", async () => {
    const { ctx, db, tx } = setup();
    const input = generateInput.parse({ tool: "IMAGE", prompt: "a red guitar" });
    expect(await runGeneration(ctx, "g1", input, { provider: provider(), upload })).toEqual({
      generationId: "g1",
      outcome: "DONE",
    });
    expect(db.generation.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: expect.objectContaining({
        status: "SUCCEEDED",
        outputs: [{ type: "image", url: "https://bucket/out", mimeType: "image/png" }],
      }),
    });
    expect(tx.studioLedgerEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "CONFIRMED" }) }),
    );
  });

  it("keeps written text and the tokens used", async () => {
    const { ctx, db } = setup();
    const input = generateInput.parse({ tool: "SEO", topic: "indie folk" });
    await runGeneration(ctx, "g1", input, { provider: provider(), upload });
    expect(db.generation.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: expect.objectContaining({
        outputs: [{ type: "text", text: "Hello fans" }],
        tokensUsed: 42,
      }),
    });
  });

  it("gives the coins back when Google refuses", async () => {
    const { ctx, db, ledger } = setup();
    const refused = provider({
      video: vi
        .fn()
        .mockRejectedValue(
          new AppError(ErrorCodes.VALIDATION_FAILED, { message: "A safety filter stopped it" }),
        ),
    });
    const input = generateInput.parse({ tool: "VIDEO", prompt: "a long drive" });
    const done = await runGeneration(ctx, "g1", input, { provider: refused, upload });
    expect(done).toMatchObject({ outcome: "FAILED", reason: "A safety filter stopped it" });
    expect(db.generation.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: expect.objectContaining({ status: "FAILED" }),
    });
    expect(ledger).toEqual([expect.objectContaining({ kind: "REFUND" })]);
  });

  it("hides provider errors behind a plain message", async () => {
    const { ctx } = setup();
    const broken = provider({ image: vi.fn().mockRejectedValue(new Error("503 secret detail")) });
    const input = generateInput.parse({ tool: "IMAGE", prompt: "a red guitar" });
    const done = await runGeneration(ctx, "g1", input, { provider: broken, upload });
    expect(done).toMatchObject({ outcome: "FAILED" });
    expect((done as { reason: string }).reason).not.toMatch(/secret/);
  });

  it("skips a run another worker already took", async () => {
    const { ctx } = setup({ status: "RUNNING" });
    const input = generateInput.parse({ tool: "IMAGE", prompt: "a red guitar" });
    const p = provider();
    expect(await runGeneration(ctx, "g1", input, { provider: p, upload })).toMatchObject({
      outcome: "SKIPPED",
    });
    expect(p.image).not.toHaveBeenCalled();
  });
});

describe("the library", () => {
  it("pages by cursor and filters by kind", async () => {
    const { ctx, db } = setup();
    const rows = Array.from({ length: 31 }, (_, i) => ({
      id: `g${i}`,
      cost: { toString: () => "6" },
      outputs: null,
    }));
    db.generation.findMany.mockResolvedValue(rows);
    const page = await library(ctx, user, { type: "IMAGE", cursor: "g99" });
    expect(db.generation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1", type: "IMAGE" },
        cursor: { id: "g99" },
        skip: 1,
        take: 31,
      }),
    );
    expect(page.items).toHaveLength(30);
    expect(page.nextCursor).toBe("g29");
    expect(page.items[0]).toMatchObject({ cost: 6, outputs: [] });
  });

  it("removes only your finished runs", async () => {
    const { ctx, db } = setup();
    await removeGeneration(ctx, user, "g1");
    expect(db.generation.deleteMany).toHaveBeenCalledWith({
      where: { id: "g1", userId: "u1", status: { in: ["SUCCEEDED", "FAILED"] } },
    });
    db.generation.deleteMany.mockResolvedValue({ count: 0 });
    await expect(removeGeneration(ctx, user, "g2")).rejects.toThrow(/not found/);
  });
});

describe("Google's video", () => {
  it("is fetched with the key once it's done, after polling", async () => {
    vi.resetModules();
    const generateVideos = vi.fn().mockResolvedValue({ done: false });
    const getVideosOperation = vi.fn().mockResolvedValue({
      done: true,
      response: { generatedVideos: [{ video: { uri: "https://g/v.mp4", mimeType: "video/mp4" } }] },
    });
    vi.doMock("@google/genai", () => ({
      GoogleGenAI: class {
        models = { generateVideos };
        operations = { getVideosOperation };
      },
    }));
    const { googleProvider: fresh } = await import("../services/studio/google");
    const get = vi
      .fn()
      .mockResolvedValue({ ok: true, arrayBuffer: () => Promise.resolve(Buffer.from("mp4")) });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const media = await fresh("key", { sleep, fetch: get as never }).video({
      prompt: "a drive",
      aspectRatio: "16:9",
    });
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith("https://g/v.mp4", { headers: { "x-goog-api-key": "key" } });
    expect(media.bytes.toString()).toBe("mp4");
    vi.doUnmock("@google/genai");
  });

  it("says generating isn't set up when there's no key", async () => {
    await expect(googleProvider("").write({ prompt: "hi there" })).rejects.toThrow(/isn't set up/);
  });
});
