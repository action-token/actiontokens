import { describe, expect, it, vi } from "vitest";

import { type Db, Prisma } from "@actiontokens/db";

import { createContext, type SessionUser } from "../context";
import { appRouter } from "../root-app";
import type { ChainGateway } from "../services/chain-gateway";
import {
  normalizeUsername,
  usernameChangeOpensAt,
  validateUsername,
} from "../services/account/username";
import { createCallerFactory } from "../trpc";

vi.mock("@actiontokens/storage", () => ({
  signImageUpload: (file: { fileName: string }) =>
    Promise.resolve({
      uploadUrl: "https://s3/up",
      fileUrl: `https://cdn.example/${file.fileName}`,
      fileName: file.fileName,
    }),
  isOwnS3Url: (url: string) => url.startsWith("https://cdn.example/"),
}));

const me: SessionUser = { id: "me", role: "FAN", walletAddress: "GME", walletType: "freighter" };
const DAY = 86_400_000;

function setup(row: Record<string, unknown> = {}, user: SessionUser | null = me) {
  const state = { username: null as string | null, usernameChangedAt: null as Date | null, ...row };
  const db = {
    user: {
      findUnique: vi.fn(() =>
        Promise.resolve({
          ...state,
          id: "me",
          email: null,
          displayName: "Fyron",
          bio: null,
          avatarUrl: null,
          coverUrl: null,
          showCollection: true,
          signUpMethod: "wallet",
          lastFmAccount: null,
        }),
      ),
      update: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        Object.assign(state, data);
        return Promise.resolve(state);
      }),
    },
    activityLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const caller = createCallerFactory(appRouter)(
    createContext({
      db: db as unknown as Db,
      chain: {} as ChainGateway,
      app: "app",
      session: user ? { user } : null,
    }),
  );
  return { db, caller };
}

describe("usernames", () => {
  it("lowercases and drops the @", () => {
    expect(normalizeUsername("  @Luna_Vale ")).toBe("luna_vale");
  });

  it("explains what's wrong in plain words", () => {
    expect(validateUsername("ab")).toBe("Use at least 3 characters");
    expect(validateUsername("a".repeat(21))).toBe("Use at most 20 characters");
    expect(validateUsername("no spaces")).toBe(
      "Use only lowercase letters, numbers and underscores",
    );
    expect(validateUsername("_hidden")).toBe("Start with a letter or number");
    expect(validateUsername("wallet")).toBe("That name is reserved");
    expect(validateUsername("luna_vale")).toBeNull();
  });

  it("opens the next change 30 days after the last, and never blocks the first", () => {
    expect(usernameChangeOpensAt(null)).toBeNull();
    expect(usernameChangeOpensAt(new Date(0))).toEqual(new Date(30 * DAY));
  });
});

describe("account.settings", () => {
  it("returns the fan's profile and when the username can change again", async () => {
    const { caller } = setup({
      username: "fyron",
      usernameChangedAt: new Date(Date.now() - 10 * DAY),
    });
    const settings = await caller.account.settings();
    expect(settings).toMatchObject({
      username: "fyron",
      displayName: "Fyron",
      showCollection: true,
      lastFm: null,
    });
    expect(settings.usernameChangeOpensAt!.getTime()).toBeGreaterThan(Date.now() + 19 * DAY);
  });

  it("needs a signed-in fan", async () => {
    await expect(setup({}, null).caller.account.settings()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("account.updateProfile", () => {
  it("trims and saves the name, bio and collection privacy", async () => {
    const { caller, db } = setup();
    await caller.account.updateProfile({
      displayName: "  Fyron A  ",
      bio: " Hello ",
      showCollection: false,
    });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "me" },
      data: { displayName: "Fyron A", bio: "Hello", showCollection: false },
    });
  });

  it("turns an empty bio into none and refuses an empty name or a very long bio", async () => {
    const { caller, db } = setup();
    await caller.account.updateProfile({ bio: "   " });
    expect(db.user.update.mock.calls[0]?.[0]).toMatchObject({ data: { bio: null } });
    await expect(caller.account.updateProfile({ displayName: "  " })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    await expect(caller.account.updateProfile({ bio: "x".repeat(281) })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("account.setUsername", () => {
  it("sets the first username freely and stamps the change", async () => {
    const { caller, db } = setup();
    await expect(caller.account.setUsername({ username: "@Fyron_A" })).resolves.toEqual({
      username: "fyron_a",
    });
    expect(db.user.update.mock.calls[0]?.[0]).toMatchObject({
      data: { username: "fyron_a", usernameChangedAt: expect.any(Date) as Date },
    });
  });

  it("allows one change every 30 days", async () => {
    const recent = setup({ username: "fyron", usernameChangedAt: new Date(Date.now() - 5 * DAY) });
    await expect(recent.caller.account.setUsername({ username: "other" })).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
      message: "You can change your username once every 30 days.",
    });
    expect(recent.db.user.update).not.toHaveBeenCalled();

    const old = setup({ username: "fyron", usernameChangedAt: new Date(Date.now() - 31 * DAY) });
    await expect(old.caller.account.setUsername({ username: "other" })).resolves.toEqual({
      username: "other",
    });
  });

  it("says when the name is taken or not allowed", async () => {
    const taken = setup();
    taken.db.user.update.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "7" }),
    );
    await expect(taken.caller.account.setUsername({ username: "taken" })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "That name is taken.",
    });
    await expect(setup().caller.account.setUsername({ username: "admin" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "That name is reserved",
    });
  });
});

describe("account pictures", () => {
  it("signs an image upload, then saves only a picture this app stored", async () => {
    const { caller, db } = setup();
    await expect(
      caller.account.imageUpload({
        fileName: "me.png",
        fileType: "image/png",
        fileSize: 1000,
        checksum: "abc",
      }),
    ).resolves.toMatchObject({ fileUrl: "https://cdn.example/me.png" });
    await caller.account.setAvatar({ url: "https://cdn.example/me.png" });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "me" },
      data: { avatarUrl: "https://cdn.example/me.png" },
    });
    await expect(
      caller.account.setAvatar({ url: "https://evil.example/x.png" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("sets and removes the cover image the same way", async () => {
    const { caller, db } = setup();
    await caller.account.setCover({ url: "https://cdn.example/cover.jpg" });
    expect(db.user.update).toHaveBeenLastCalledWith({
      where: { id: "me" },
      data: { coverUrl: "https://cdn.example/cover.jpg" },
    });
    await caller.account.setCover({ url: null });
    expect(db.user.update).toHaveBeenLastCalledWith({
      where: { id: "me" },
      data: { coverUrl: null },
    });
    await expect(
      caller.account.setCover({ url: "https://evil.example/x.png" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("includes the cover in the settings", async () => {
    await expect(setup().caller.account.settings()).resolves.toMatchObject({ coverUrl: null });
  });
});
