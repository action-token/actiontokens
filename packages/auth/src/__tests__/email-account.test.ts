import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

const mocks = vi.hoisted(() => ({
  findOrCreateFirebaseUserByEmail: vi.fn(),
  axiosGet: vi.fn(),
}));

vi.mock("axios", () => ({ default: { get: mocks.axiosGet } }));
vi.mock("firebase/auth", () => ({
  sendEmailVerification: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
}));
vi.mock("@albedo-link/signature-verification", () => ({ verifyMessageSignature: () => false }));
vi.mock("@bandcoin/wallet/firebase", () => ({ firebaseAuth: {} }));
vi.mock("@bandcoin/wallet/server", () => ({
  findOrCreateFirebaseUserByEmail: mocks.findOrCreateFirebaseUserByEmail,
}));

import { lookupAccountForEmail, resolveAccountForEmail } from "../email-account";

const KEY = "G".padEnd(56, "K");
const db = {
  user: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
};
const asDb = db as unknown as Db;

beforeEach(() => {
  vi.resetAllMocks();
  db.user.findFirst.mockResolvedValue(null);
  db.user.findUnique.mockResolvedValue(null);
  db.user.create.mockImplementation(({ data }: { data: object }) =>
    Promise.resolve({ id: "new", ...data }),
  );
  mocks.axiosGet.mockResolvedValue({ data: { publicKey: KEY, extra: { isAccActive: false } } });
});

describe("an account for an email", () => {
  it("returns the account already on that email without asking Firebase", async () => {
    db.user.findFirst.mockResolvedValue({ id: "u1", walletAddress: KEY, signUpMethod: "google" });
    await expect(resolveAccountForEmail(asDb, " Fan@Example.com ")).resolves.toEqual({
      userId: "u1",
      walletAddress: KEY,
      custodial: true,
      created: false,
    });
    expect(db.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { equals: "Fan@Example.com", mode: "insensitive" } },
      }),
    );
    expect(mocks.findOrCreateFirebaseUserByEmail).not.toHaveBeenCalled();
  });

  it("says a wallet account isn't custodial", async () => {
    db.user.findFirst.mockResolvedValue({
      id: "u2",
      walletAddress: KEY,
      signUpMethod: "freighter",
    });
    await expect(lookupAccountForEmail(asDb, "w@example.com")).resolves.toMatchObject({
      custodial: false,
    });
  });

  it("makes the Firebase user, key and row for a new email, unverified", async () => {
    mocks.findOrCreateFirebaseUserByEmail.mockResolvedValue({
      user: { uid: "fb1", email: "new@example.com", emailVerified: false },
      created: true,
    });
    await expect(resolveAccountForEmail(asDb, "New@Example.com")).resolves.toEqual({
      userId: "new",
      walletAddress: KEY,
      custodial: true,
      created: true,
    });
    expect(mocks.findOrCreateFirebaseUserByEmail).toHaveBeenCalledWith("new@example.com");
    expect(mocks.axiosGet).toHaveBeenCalledWith(expect.any(String), {
      params: expect.objectContaining({ uid: "fb1", email: "new@example.com" }),
    });
    expect(db.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        walletAddress: KEY,
        email: "new@example.com",
        emailVerifiedAt: null,
        signUpMethod: "emailPass",
      }),
    });
  });

  it("stops when Firebase fails, without making anything", async () => {
    mocks.findOrCreateFirebaseUserByEmail.mockRejectedValue(new Error("quota"));
    await expect(resolveAccountForEmail(asDb, "x@example.com")).rejects.toThrow("quota");
    expect(mocks.axiosGet).not.toHaveBeenCalled();
    expect(db.user.create).not.toHaveBeenCalled();
  });
});
