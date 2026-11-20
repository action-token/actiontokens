import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";
import { AppError, ErrorCodes } from "@actiontokens/errors";

const mocks = vi.hoisted(() => ({
  verifyLoginChallenge: vi.fn(),
  verifyFirebaseIdToken: vi.fn(),
  getOrCreateFirebaseUserFromApple: vi.fn(),
  axiosGet: vi.fn(),
}));

vi.mock("axios", () => ({ default: { get: mocks.axiosGet } }));
vi.mock("firebase/auth", () => ({
  sendEmailVerification: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
}));
vi.mock("@albedo-link/signature-verification", () => ({ verifyMessageSignature: () => false }));
vi.mock("@actiontokens/wallet/firebase", () => ({ firebaseAuth: {} }));
vi.mock("@actiontokens/wallet/server", () => ({
  getOrCreateFirebaseUserFromApple: mocks.getOrCreateFirebaseUserFromApple,
  verifyFirebaseIdToken: mocks.verifyFirebaseIdToken,
  verifyLoginChallenge: mocks.verifyLoginChallenge,
}));

import { createAuthOptions } from "../auth-options";
import { authorizeCredentials } from "../authorize-credentials";
import { recordSignIn } from "../sign-in-log";

const PUBLIC_KEY = "G".padEnd(56, "A");
const row = {
  id: "u1",
  walletAddress: PUBLIC_KEY,
  role: "FAN",
  email: null,
  signUpMethod: null,
  displayName: null,
  username: null,
  avatarUrl: null,
};

const db = {
  user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  activityLog: { create: vi.fn() },
};
const asDb = db as unknown as Db;

beforeEach(() => {
  vi.resetAllMocks();
  db.user.findUnique.mockResolvedValue(null);
  db.user.create.mockImplementation(({ data }: { data: object }) =>
    Promise.resolve({ ...row, ...data }),
  );
  db.user.update.mockImplementation(({ data }: { data: object }) =>
    Promise.resolve({ ...row, ...data }),
  );
  mocks.axiosGet.mockResolvedValue({
    data: { publicKey: PUBLIC_KEY, extra: { isAccActive: true } },
  });
});

describe("authorizeCredentials", () => {
  it("rejects input that isn't a known credential, before touching anything", async () => {
    for (const input of [{}, undefined, { walletType: "freighter", pubkey: PUBLIC_KEY }]) {
      await expect(authorizeCredentials(asDb, input)).rejects.toMatchObject({
        code: "WALLET_AUTH_FAILED",
      });
    }
    expect(mocks.verifyLoginChallenge).not.toHaveBeenCalled();
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("signs a wallet in only when the challenge verifies, creating the user by wallet address", async () => {
    mocks.verifyLoginChallenge.mockReturnValue(true);
    const user = await authorizeCredentials(asDb, {
      walletType: "frieghter",
      pubkey: PUBLIC_KEY,
      signedXDR: "AAAA",
    });
    expect(user).toMatchObject({
      id: "u1",
      walletAddress: PUBLIC_KEY,
      walletType: "frieghter",
      role: "FAN",
    });
    expect(db.user.create.mock.calls[0]?.[0]).toMatchObject({
      data: { walletAddress: PUBLIC_KEY, signUpMethod: "frieghter" },
    });

    mocks.verifyLoginChallenge.mockReturnValue(false);
    await expect(
      authorizeCredentials(asDb, {
        walletType: "frieghter",
        pubkey: PUBLIC_KEY,
        signedXDR: "AAAA",
      }),
    ).rejects.toMatchObject({ code: "WALLET_AUTH_FAILED" });
  });

  it("refuses a suspended account, even with a valid signature", async () => {
    mocks.verifyLoginChallenge.mockReturnValue(true);
    db.user.findUnique.mockResolvedValue({
      ...row,
      signUpMethod: "frieghter",
      suspendedAt: new Date(),
    });
    await expect(
      authorizeCredentials(asDb, {
        walletType: "frieghter",
        pubkey: PUBLIC_KEY,
        signedXDR: "AAAA",
      }),
    ).rejects.toMatchObject({ code: "AUTH_SUSPENDED" });
  });

  it("fills in a missing email on an existing user, and keeps their role", async () => {
    const artist = { ...row, role: "ARTIST", signUpMethod: "google" };
    db.user.findUnique.mockResolvedValue(artist);
    db.user.update.mockImplementation(({ data }: { data: object }) =>
      Promise.resolve({ ...artist, ...data }),
    );
    mocks.verifyFirebaseIdToken.mockResolvedValue({ uid: "g-1" });
    const user = await authorizeCredentials(asDb, {
      walletType: "google",
      token: "t",
      email: "nadia@demo.bandcoin.io",
    });
    expect(db.user.update.mock.calls[0]?.[0]).toMatchObject({
      where: { id: "u1" },
      data: { email: "nadia@demo.bandcoin.io" },
    });
    expect(user).toMatchObject({
      role: "ARTIST",
      email: "nadia@demo.bandcoin.io",
      walletType: "google",
    });
  });

  it("gives the Apple account the email Apple vouched for, not the one the client sent", async () => {
    mocks.getOrCreateFirebaseUserFromApple.mockResolvedValue({
      uid: "apple-owner",
      email: "owner@x.com",
    });
    const user = await authorizeCredentials(asDb, {
      walletType: "apple",
      appleToken: "apple-token",
      email: "victim@x.com",
    });
    expect(mocks.axiosGet.mock.calls[0]?.[1]).toMatchObject({
      params: { uid: "apple-owner", email: "owner@x.com" },
    });
    expect(user).toMatchObject({ email: "owner@x.com", walletType: "apple" });
    await expect(
      authorizeCredentials(asDb, { walletType: "apple", email: "a@x.com" }),
    ).rejects.toMatchObject({
      code: "WALLET_AUTH_FAILED",
    });
  });
});

describe("sign-in log", () => {
  const headers = new Headers({ "x-forwarded-for": "203.0.113.9", "user-agent": "vitest" });

  it("records a failed attempt as GUEST with the Firebase reason, never the password", async () => {
    await recordSignIn(asDb, {
      app: "app",
      walletType: "emailPass",
      headers,
      result: { error: new Error("Firebase: Error (auth/wrong-password).") },
    });
    const data = (db.activityLog.create.mock.calls[0]?.[0] as { data: Record<string, unknown> })
      .data;
    expect(data).toMatchObject({
      actorRole: "GUEST",
      action: "auth.signIn",
      status: "FAILED",
      errorCode: "auth/wrong-password",
      ip: "203.0.113.9",
    });
    expect(JSON.stringify(data)).not.toContain('password":');
  });

  it("records success against the user, and a failed write doesn't block the sign-in", async () => {
    db.activityLog.create.mockRejectedValueOnce(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.verifyLoginChallenge.mockReturnValue(true);
    const options = createAuthOptions({ app: "artist", db: asDb });
    const provider = options.providers[0] as unknown as {
      options: {
        authorize: (
          credentials: unknown,
          req: { headers: Record<string, string> },
        ) => Promise<unknown>;
      };
    };
    const user = await provider.options.authorize(
      { walletType: "frieghter", pubkey: PUBLIC_KEY, signedXDR: "AAAA" },
      { headers: { "user-agent": "vitest" } },
    );
    expect(user).toMatchObject({ id: "u1" });
    expect(db.activityLog.create.mock.calls[0]?.[0]).toMatchObject({
      data: {
        actorId: "u1",
        status: "SUCCESS",
        app: "artist",
        input: { walletType: "frieghter", publicKey: PUBLIC_KEY },
      },
    });
    spy.mockRestore();
  });

  it("logs and rethrows a rejected credential", async () => {
    const options = createAuthOptions({ app: "app", db: asDb });
    const provider = options.providers[0] as unknown as {
      options: {
        authorize: (
          credentials: unknown,
          req: { headers: Record<string, string> },
        ) => Promise<unknown>;
      };
    };
    await expect(provider.options.authorize({}, { headers: {} })).rejects.toBeInstanceOf(AppError);
    expect(db.activityLog.create.mock.calls[0]?.[0]).toMatchObject({
      data: { status: "FAILED", errorCode: ErrorCodes.WALLET_AUTH_FAILED },
    });
  });
});

describe("session refresh", () => {
  it("re-reads the role from the database after five minutes, so approvals and removals take effect", async () => {
    const { callbacks } = createAuthOptions({ app: "app", db: asDb });
    const jwt = callbacks!.jwt! as (args: {
      token: Record<string, unknown>;
    }) => Promise<Record<string, unknown>>;
    db.user.findUnique.mockResolvedValue({ role: "ARTIST" });

    const fresh = { sub: "u1", role: "FAN", roleCheckedAt: Date.now() };
    expect(await jwt({ token: fresh })).toBe(fresh);
    expect(db.user.findUnique).not.toHaveBeenCalled();

    const stale = await jwt({
      token: { sub: "u1", role: "FAN", roleCheckedAt: Date.now() - 6 * 60_000 },
    });
    expect(stale.role).toBe("ARTIST");

    db.user.findUnique.mockResolvedValue(null);
    const deleted = await jwt({ token: { sub: "u1", role: "FAN", roleCheckedAt: 0 } });
    expect(deleted.sub).toBeUndefined();

    db.user.findUnique.mockResolvedValue({ role: "FAN", suspendedAt: new Date() });
    const suspended = await jwt({ token: { sub: "u1", role: "FAN", roleCheckedAt: 0 } });
    expect(suspended.sub).toBeUndefined();
  });
  it("keeps the session when the database can't be reached for the role check", async () => {
    const { callbacks } = createAuthOptions({ app: "app", db: asDb });
    const jwt = callbacks!.jwt! as (args: {
      token: Record<string, unknown>;
    }) => Promise<Record<string, unknown>>;
    db.user.findUnique.mockRejectedValue(new Error("Can't reach database server"));

    const token = { sub: "u1", role: "ARTIST", roleCheckedAt: 0 };
    const kept = await jwt({ token });
    // A failed read says nothing about the user: they stay signed in with the role they had.
    expect(kept.sub).toBe("u1");
    expect(kept.role).toBe("ARTIST");
  });
  it("ends the session for the browser when the token no longer names a user", async () => {
    const { callbacks } = createAuthOptions({ app: "app", db: asDb });
    const session = callbacks!.session! as unknown as (args: {
      session: Record<string, unknown>;
      token: Record<string, unknown>;
    }) => Record<string, unknown>;
    const open = { user: { name: null }, expires: "later" };

    expect(session({ session: open, token: {} })).toEqual({});
    const live = session({
      session: open,
      token: { sub: "u1", walletAddress: "G1", walletType: "email" },
    });
    expect((live.user as { id: string }).id).toBe("u1");
  });
});
