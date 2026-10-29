import { describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import { fillForm, generateImage, writeField } from "../services/ai/generate";
import type { AiModel } from "../services/ai/model";
import { AI_DAILY_LIMIT, aiRemaining, withAiQuota } from "../services/ai/quota";

vi.mock("@bandcoin/storage", () => ({
  uploadBufferToS3: vi.fn().mockResolvedValue("https://cdn.example/ai.png"),
}));
vi.mock("../services/ai/model", () => ({
  friendlyProviderError: () => "The AI couldn't finish that. Try again.",
}));

const artist = { id: "a1", name: "Luna Vale", bio: "Dream pop from Dhaka" };
const actor = { artist, unlimited: false };
const now = new Date("2026-11-01T10:00:00Z");

function setup(used: { text?: number; image?: number } | null = null) {
  const db = {
    aiUsage: {
      findUnique: vi.fn().mockResolvedValue(used ? { text: 0, image: 0, ...used } : null),
      upsert: vi.fn().mockResolvedValue({}),
    },
  };
  return { ctx: { db: db as unknown as Db }, db };
}

const fakeModel = (over: Partial<AiModel> = {}): AiModel => ({
  fill: vi.fn().mockResolvedValue({ title: "Album launch" }),
  write: vi.fn().mockResolvedValue("  A better line  "),
  image: vi.fn().mockResolvedValue(Buffer.from("png")),
  ...over,
});

describe("the daily allowance", () => {
  it("reports what is left today", async () => {
    const { ctx } = setup({ text: 8, image: 10 });
    await expect(aiRemaining(ctx, { artistId: "a1", unlimited: false }, now)).resolves.toEqual({
      text: 42,
      image: 0,
      limit: AI_DAILY_LIMIT,
      unlimited: false,
    });
  });

  it("counts a generation only after it worked", async () => {
    const { ctx, db } = setup();
    await withAiQuota(
      ctx,
      { artistId: "a1", unlimited: false },
      "text",
      () => Promise.resolve("ok"),
      now,
    );
    expect(db.aiUsage.upsert).toHaveBeenCalledWith({
      where: { artistId_day: { artistId: "a1", day: new Date("2026-11-01T00:00:00Z") } },
      create: { artistId: "a1", day: new Date("2026-11-01T00:00:00Z"), text: 1 },
      update: { text: { increment: 1 } },
    });
  });

  it("does not charge a failed generation, and says why", async () => {
    const { ctx, db } = setup();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(
      withAiQuota(
        ctx,
        { artistId: "a1", unlimited: false },
        "text",
        () => Promise.reject(new Error("boom")),
        now,
      ),
    ).rejects.toThrow(/couldn't finish/);
    expect(db.aiUsage.upsert).not.toHaveBeenCalled();
  });

  it("stops at the limit without calling the model", async () => {
    const { ctx } = setup({ image: AI_DAILY_LIMIT.image });
    const work = vi.fn();
    await expect(
      withAiQuota(ctx, { artistId: "a1", unlimited: false }, "image", work, now),
    ).rejects.toThrow(/used today's 10 AI images/);
    expect(work).not.toHaveBeenCalled();
  });

  it("never limits or counts an admin", async () => {
    const { ctx, db } = setup({ text: 999 });
    await expect(
      withAiQuota(
        ctx,
        { artistId: "a1", unlimited: true },
        "text",
        () => Promise.resolve("ok"),
        now,
      ),
    ).resolves.toBe("ok");
    expect(db.aiUsage.findUnique).not.toHaveBeenCalled();
    expect(db.aiUsage.upsert).not.toHaveBeenCalled();
  });
});

describe("generating", () => {
  it("fills a form with the artist, the date and the current fields in the brief", async () => {
    const { ctx } = setup();
    const model = fakeModel();
    await expect(
      fillForm(ctx, model, actor, {
        form: "event",
        prompt: "Launch party Friday",
        now: "2026-11-01T10:00",
        timeZone: "Asia/Dhaka",
        context: { title: "", venue: "The Hall" },
      }),
    ).resolves.toEqual({ title: "Album launch" });
    const call = vi.mocked(model.fill).mock.calls[0]![0];
    expect(call.system).toContain("Luna Vale");
    expect(call.system).toContain("Asia/Dhaka");
    expect(call.user).toContain("- venue: The Hall");
    expect(call.user).not.toContain("- title:");
    expect(call.user).toContain("Launch party Friday");
  });

  it("says so when the model returns no form", async () => {
    const { ctx, db } = setup();
    const model = fakeModel({ fill: vi.fn().mockResolvedValue(null) });
    await expect(
      fillForm(ctx, model, actor, {
        form: "event",
        prompt: "x y z",
        now: "",
        timeZone: "UTC",
        context: {},
      }),
    ).rejects.toThrow(/didn't return a form/);
    expect(db.aiUsage.upsert).not.toHaveBeenCalled();
  });

  it("cleans up and trims a written field", async () => {
    const { ctx } = setup();
    const model = fakeModel({
      write: vi.fn().mockResolvedValue('```\n"Out Friday, pre-save now"\n```'),
    });
    await expect(
      writeField(ctx, model, actor, {
        form: "announcement",
        field: "message",
        mode: "write",
        current: "",
        maxChars: 12,
        context: {},
      }),
    ).resolves.toEqual({ text: "Out Friday, " });
    expect(vi.mocked(model.write).mock.calls[0]![0].user).toContain("Write the message.");
  });

  it("passes the current text when rewriting", async () => {
    const { ctx } = setup();
    const model = fakeModel();
    await writeField(ctx, model, actor, {
      form: "song",
      field: "description",
      mode: "shorter",
      current: "A long text",
      context: {},
    });
    expect(vi.mocked(model.write).mock.calls[0]![0].user).toContain("A long text");
  });

  it("stores a generated image and returns its address", async () => {
    const { ctx } = setup();
    const model = fakeModel();
    await expect(
      generateImage(ctx, model, actor, { form: "item", prompt: "neon guitar", aspect: "wide" }),
    ).resolves.toEqual({ url: "https://cdn.example/ai.png" });
    expect(vi.mocked(model.image).mock.calls[0]![0]).toMatchObject({ size: "1536x1024" });
  });

  it("fails clearly when no image comes back", async () => {
    const { ctx, db } = setup();
    const model = fakeModel({ image: vi.fn().mockResolvedValue(null) });
    await expect(
      generateImage(ctx, model, actor, { form: "item", prompt: "neon guitar", aspect: "square" }),
    ).rejects.toThrow(/No image came back/);
    expect(db.aiUsage.upsert).not.toHaveBeenCalled();
  });
});
