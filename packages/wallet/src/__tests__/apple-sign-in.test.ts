import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  getUserByProviderUid: vi.fn(),
  getUserByEmail: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
}));
const verifyAppleToken = vi.hoisted(() => vi.fn());

vi.mock("firebase-admin/auth", () => ({ getAuth: () => auth }));
vi.mock("../firebase/admin-app", () => ({ initFirebaseAdmin: () => ({}) }));
vi.mock("../firebase/verify-apple-token", () => ({
  verifyAppleToken,
  APPLE_WEB_SERVICE_ID: "com.action-tokens",
}));

import { getOrCreateFirebaseUserFromApple } from "../firebase/admin-users";

const APP = "com.thebillboardapp.actionToken";
const WEB = "com.action-tokens";
const notFound = Object.assign(new Error("not found"), { code: "auth/user-not-found" });
const unlinkApple = { providersToUnlink: ["apple.com"] };

beforeEach(() => {
  vi.resetAllMocks();
  auth.getUserByProviderUid.mockRejectedValue(notFound);
  auth.getUserByEmail.mockRejectedValue(notFound);
  auth.updateUser.mockImplementation((uid: string) => Promise.resolve({ uid }));
});

describe("getOrCreateFirebaseUserFromApple", () => {
  it("signs in the user with the verified email without linking Apple to it", async () => {
    verifyAppleToken.mockResolvedValue({
      sub: "a1",
      email: "a@x.com",
      emailVerified: true,
      audience: APP,
    });
    auth.getUserByEmail.mockResolvedValue({ uid: "by-email" });

    await expect(getOrCreateFirebaseUserFromApple("token")).resolves.toEqual({ uid: "by-email" });
    expect(auth.getUserByEmail).toHaveBeenCalledWith("a@x.com");
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("creates a user, without an Apple link, when the email is new", async () => {
    verifyAppleToken.mockResolvedValue({
      sub: "a2",
      email: "new@x.com",
      emailVerified: true,
      audience: APP,
    });
    auth.createUser.mockResolvedValue({ uid: "created" });

    await expect(getOrCreateFirebaseUserFromApple("token")).resolves.toEqual({ uid: "created" });
    expect(auth.createUser).toHaveBeenCalledWith({ email: "new@x.com", emailVerified: true });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("releases an app Apple link made before, so the website's Apple id can attach", async () => {
    verifyAppleToken.mockResolvedValue({
      sub: "a3",
      email: "a@x.com",
      emailVerified: true,
      audience: APP,
    });
    auth.getUserByProviderUid.mockResolvedValue({ uid: "main" });
    auth.getUserByEmail.mockResolvedValue({ uid: "main" });

    await expect(getOrCreateFirebaseUserFromApple("token")).resolves.toEqual({ uid: "main" });
    expect(auth.updateUser).toHaveBeenCalledWith("main", unlinkApple);
  });

  it("prefers the verified email's account over an old private-relay link", async () => {
    verifyAppleToken.mockResolvedValue({
      sub: "a4",
      email: "a@x.com",
      emailVerified: true,
      audience: APP,
    });
    auth.getUserByProviderUid.mockResolvedValue({ uid: "relay-user" });
    auth.getUserByEmail.mockResolvedValue({ uid: "main" });

    await expect(getOrCreateFirebaseUserFromApple("token")).resolves.toEqual({ uid: "main" });
  });

  it("leaves a website Apple link alone", async () => {
    verifyAppleToken.mockResolvedValue({
      sub: "w1",
      email: "a@x.com",
      emailVerified: true,
      audience: WEB,
    });
    auth.getUserByProviderUid.mockResolvedValue({ uid: "main" });
    auth.getUserByEmail.mockResolvedValue({ uid: "main" });

    await expect(getOrCreateFirebaseUserFromApple("token")).resolves.toEqual({ uid: "main" });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("keeps using an old link when Apple sent no verified email", async () => {
    verifyAppleToken.mockResolvedValue({
      sub: "a5",
      email: undefined,
      emailVerified: false,
      audience: APP,
    });
    auth.getUserByProviderUid.mockResolvedValue({ uid: "linked" });

    await expect(getOrCreateFirebaseUserFromApple("token")).resolves.toEqual({ uid: "linked" });
    expect(auth.updateUser).not.toHaveBeenCalled();
    expect(auth.getUserByEmail).not.toHaveBeenCalled();
  });

  it("never looks up an account by an email Apple didn't vouch for", async () => {
    verifyAppleToken.mockResolvedValue({
      sub: "a6",
      email: "a@x.com",
      emailVerified: false,
      audience: APP,
    });

    await expect(getOrCreateFirebaseUserFromApple("token")).rejects.toMatchObject({
      code: "WALLET_AUTH_FAILED",
    });
    expect(auth.getUserByEmail).not.toHaveBeenCalled();
    expect(auth.createUser).not.toHaveBeenCalled();
  });

  it("does not hide unexpected Firebase failures", async () => {
    verifyAppleToken.mockResolvedValue({
      sub: "a7",
      email: "a@x.com",
      emailVerified: true,
      audience: APP,
    });
    auth.getUserByProviderUid.mockRejectedValue(
      Object.assign(new Error("quota"), { code: "auth/quota-exceeded" }),
    );

    await expect(getOrCreateFirebaseUserFromApple("token")).rejects.toThrow("quota");
  });
});
