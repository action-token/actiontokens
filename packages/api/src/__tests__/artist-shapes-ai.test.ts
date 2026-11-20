import { describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";
import { AppError, ErrorCodes } from "@actiontokens/errors";

import { createContext, type SessionUser } from "../context";
import { portalRouter } from "../root-portal";
import type { ChainGateway } from "../services/chain-gateway";
import { createCallerFactory } from "../trpc";

const png = Buffer.from("png");
vi.mock("../services/ai/model", () => ({
  friendlyProviderError: () => "The AI couldn't finish that. Try again.",
  openaiModel: {
    fill: vi.fn(),
    write: vi.fn(),
    image: vi.fn().mockResolvedValue(Buffer.from("png")),
    edit: vi.fn().mockResolvedValue(Buffer.from("png")),
  },
}));
vi.mock("@actiontokens/storage", () => ({
  renderOutlinePng: vi.fn().mockResolvedValue(Buffer.from("outline")),
  fetchPublicFile: vi.fn((url: string) =>
    url.includes("10.0.0.1")
      ? Promise.reject(
          new AppError(ErrorCodes.VALIDATION_FAILED, { message: "That address isn't public." }),
        )
      : Promise.resolve({ bytes: Buffer.from("png"), contentType: "image/png" }),
  ),
}));

const user: SessionUser = {
  id: "u1",
  role: "ARTIST",
  walletAddress: "GX",
  walletType: "freighter",
};

function setup() {
  const db = {
    artist: { findUnique: vi.fn().mockResolvedValue({ id: "a1", status: "APPROVED" }) },
    aiUsage: { findUnique: vi.fn().mockResolvedValue(null), upsert: vi.fn().mockResolvedValue({}) },
    user: { findUnique: vi.fn().mockResolvedValue({ suspendedAt: null }) },
    activityLog: { create: vi.fn() },
  };
  const caller = createCallerFactory(portalRouter)(
    createContext({
      db: db as unknown as Db,
      chain: {} as ChainGateway,
      app: "org",
      session: { user },
    }),
  );
  return { caller, db };
}

describe("Pin Studio's AI", () => {
  it("makes a silhouette and counts one image", async () => {
    const { caller, db } = setup();
    const { image } = await caller.shapes.ai({ description: "a friendly troll" });
    expect(image).toBe(`data:image/png;base64,${png.toString("base64")}`);
    expect(db.aiUsage.upsert).toHaveBeenCalledTimes(1);
  });

  it("wants the rights tick before it uses a reference", async () => {
    const { caller, db } = setup();
    await expect(
      caller.shapes.ai({ description: "a troll", referenceUrl: "https://example.com/a.png" }),
    ).rejects.toThrow(/Confirm you can use the reference/);
    expect(db.aiUsage.upsert).not.toHaveBeenCalled();
    await expect(
      caller.shapes.ai({
        description: "a troll",
        referenceUrl: "https://example.com/a.png",
        rights: true,
      }),
    ).resolves.toBeDefined();
  });

  it("refuses a private link without using up a generation", async () => {
    const { caller, db } = setup();
    await expect(
      caller.shapes.ai({
        description: "a troll",
        referenceUrl: "http://10.0.0.1/a.png",
        rights: true,
      }),
    ).rejects.toThrow(/isn't public/);
    expect(db.aiUsage.upsert).not.toHaveBeenCalled();
  });

  it("stops when today's images are used up", async () => {
    const { caller, db } = setup();
    db.aiUsage.findUnique.mockResolvedValue({ text: 0, image: 10 });
    await expect(caller.shapes.ai({ description: "a troll" })).rejects.toThrow(
      /today's 10 AI images/,
    );
  });

  it("enhances an outline, and refuses one that isn't a plain path", async () => {
    const { caller, db } = setup();
    await caller.shapes.enhance({ path: "M10 10 L90 10 L50 90 Z", instruction: "smoother" });
    expect(db.aiUsage.upsert).toHaveBeenCalledTimes(1);
    await expect(caller.shapes.enhance({ path: 'M0 0"/><script>' })).rejects.toThrow();
  });
});
