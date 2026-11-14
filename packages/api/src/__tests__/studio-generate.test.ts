import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("OPENAI_API_KEY", "test-key");
});
afterEach(() => vi.unstubAllEnvs());

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
      findUniqueOrThrow: vi.fn().mockResolvedValue({ userId: "u1", artistId: null }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    job: { findFirst: vi.fn(), create: vi.fn().mockResolvedValue({ id: "j1" }) },
    $transaction: vi.fn((run: (client: unknown) => unknown) => run(tx)),
  };
  const ctx = { db, activity: { set: vi.fn() } } as never;
  return { ctx, db, tx, ledger };
}

const provider = (over: Partial<GenerateProvider> = {}): GenerateProvider => ({
  image: vi.fn(({ count }: { count: number }) =>
    Promise.resolve(
      Array.from({ length: count }, () => ({ bytes: Buffer.from("png"), mimeType: "image/png" })),
    ),
  ),
  video: vi.fn().mockResolvedValue({ bytes: Buffer.from("mp4"), mimeType: "video/mp4" }),
  write: vi.fn().mockResolvedValue({ text: "Hello fans", tokens: 42 }),
  ...over,
});
/** Google for everything unless a test says otherwise. */
const providers = (google = provider(), openai = provider()) => ({ google, openai });
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
    // Nano Banana 2.1 at 1K: $0.0336 + 30% → 5 coins
    expect(started).toEqual({ generationId: "g1", coins: 5 });
    expect(db.generation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "IMAGE", model: "gemini-nano-banana-2.1" }),
      }),
    );
    expect(ledger).toEqual([
      expect.objectContaining({ kind: "SPEND", status: "PENDING", amount: -5 }),
    ]);
    expect(db.job.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "studio.generate", maxAttempts: 1 }),
    });
  });

  it("refuses an option the model doesn't have before holding anything", async () => {
    const { ctx, db } = setup();
    await expect(
      startGeneration(
        ctx,
        user,
        generateInput.parse({
          tool: "IMAGE",
          prompt: "a red guitar",
          model: "gpt-image-2.6-flare",
          aspectRatio: "21:9",
        }),
      ),
    ).rejects.toThrow("GPT Image 2.6 Flare can't make 21:9.");
    expect(db.generation.create).not.toHaveBeenCalled();
  });

  it("won't start a run on a provider that isn't set up, and holds nothing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const { ctx, db } = setup();
    await expect(
      startGeneration(
        ctx,
        user,
        generateInput.parse({
          tool: "IMAGE",
          prompt: "a red guitar",
          model: "gpt-image-2.6-flare",
        }),
      ),
    ).rejects.toThrow("GPT Image 2.6 Flare isn't set up yet. Pick another model.");
    expect(db.generation.create).not.toHaveBeenCalled();
    expect(db.studioLedgerEntry.create).not.toHaveBeenCalled();
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
    const input = generateInput.parse({ tool: "IMAGE", prompt: "a red guitar", count: 2 });
    expect(await runGeneration(ctx, "g1", input, { providers: providers(), upload })).toEqual({
      generationId: "g1",
      outcome: "DONE",
    });
    const image = { type: "image", url: "https://bucket/out", mimeType: "image/png" };
    expect(db.generation.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: expect.objectContaining({ status: "SUCCEEDED", outputs: [image, image] }),
    });
    expect(tx.studioLedgerEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "CONFIRMED" }) }),
    );
  });

  it("asks the model's own provider, with the model and its options", async () => {
    const { ctx } = setup();
    const google = provider();
    const openai = provider();
    const input = generateInput.parse({
      tool: "IMAGE",
      prompt: "a red guitar",
      model: "gpt-image-2.6-flare",
      quality: "high",
    });
    await runGeneration(ctx, "g1", input, { providers: providers(google, openai), upload });
    expect(google.image).not.toHaveBeenCalled();
    expect(openai.image).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-image-2.6-flare", quality: "high", count: 1 }),
    );
  });

  it("keeps written text and the tokens used", async () => {
    const { ctx, db } = setup();
    const input = generateInput.parse({ tool: "SEO", topic: "indie folk" });
    await runGeneration(ctx, "g1", input, { providers: providers(), upload });
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
    const done = await runGeneration(ctx, "g1", input, { providers: providers(refused), upload });
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
    const done = await runGeneration(ctx, "g1", input, { providers: providers(broken), upload });
    expect(done).toMatchObject({ outcome: "FAILED" });
    expect((done as { reason: string }).reason).not.toMatch(/secret/);
  });

  it("skips a run another worker already took", async () => {
    const { ctx } = setup({ status: "RUNNING" });
    const input = generateInput.parse({ tool: "IMAGE", prompt: "a red guitar" });
    const p = provider();
    expect(
      await runGeneration(ctx, "g1", input, { providers: providers(p), upload }),
    ).toMatchObject({
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

describe("Google", () => {
  async function withGoogle(create: ReturnType<typeof vi.fn>) {
    vi.resetModules();
    vi.doMock("@google/genai", () => ({
      GoogleGenAI: class {
        interactions = { create };
      },
    }));
    const { googleProvider: fresh } = await import("../services/studio/google");
    return fresh("key");
  }

  it("makes each image with the model, ratio and size, one request per image", async () => {
    const create = vi.fn().mockResolvedValue({
      output_image: { data: Buffer.from("png").toString("base64"), mime_type: "image/png" },
    });
    const google = await withGoogle(create);
    const images = await google.image({
      model: "gemini-nano-banana-2.1",
      prompt: "a cover",
      aspectRatio: "16:9",
      size: "2K",
      count: 2,
    });
    expect(images).toHaveLength(2);
    expect(images[0]!.bytes.toString()).toBe("png");
    expect(create).toHaveBeenCalledWith({
      model: "gemini-nano-banana-2.1",
      input: "a cover",
      response_format: { type: "image", aspect_ratio: "16:9", image_size: "2K" },
    });
    vi.doUnmock("@google/genai");
  });

  it("makes a video with Omni and reads it from the answer", async () => {
    const create = vi.fn().mockResolvedValue({
      output_video: { data: Buffer.from("mp4").toString("base64"), mime_type: "video/mp4" },
    });
    const google = await withGoogle(create);
    const video = await google.video({
      model: "gemini-omni-1.1-flash",
      prompt: "a drive",
      aspectRatio: "9:16",
      resolution: "1080p",
    });
    expect(video).toMatchObject({ mimeType: "video/mp4" });
    expect(create).toHaveBeenCalledWith({
      model: "gemini-omni-1.1-flash",
      input: "a drive",
      response_format: { type: "video", aspect_ratio: "9:16", resolution: "1080p" },
    });
    vi.doUnmock("@google/genai");
  });

  it("says a safety filter stopped it when nothing comes back", async () => {
    const google = await withGoogle(vi.fn().mockResolvedValue({}));
    await expect(
      google.image({
        model: "gemini-nano-banana-2.1",
        prompt: "a cover",
        aspectRatio: "1:1",
        count: 1,
      }),
    ).rejects.toThrow(/safety filter/);
    vi.doUnmock("@google/genai");
  });

  it("says generating isn't set up when there's no key", async () => {
    await expect(
      googleProvider("").write({ model: "gemini-3.8-flash", prompt: "hi there" }),
    ).rejects.toThrow(/isn't set up/);
  });
});
