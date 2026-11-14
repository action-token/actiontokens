import { describe, expect, it } from "vitest";

import { extensionFor, objectKey, storageNetwork, unreferencedKey } from "../key-layout";

describe("objectKey", () => {
  it("puts network, owner, kind and name in folders", () => {
    expect(
      objectKey({
        network: "mainnet",
        owner: "artists",
        ownerId: "ck12",
        kind: "items/ck99/media",
        name: "full",
        ext: "M4A",
      }),
    ).toBe("mainnet/artists/ck12/items/ck99/media/full.m4a");
  });

  it("has no owner folder id for shared files", () => {
    expect(
      objectKey({
        network: "testnet",
        owner: "shared",
        kind: "generated",
        name: "ab12",
        ext: "png",
      }),
    ).toBe("testnet/shared/generated/ab12.png");
  });

  it("allows a missing extension", () => {
    expect(
      objectKey({ network: "testnet", owner: "users", ownerId: "u1", kind: "avatars", name: "x" }),
    ).toBe("testnet/users/u1/avatars/x");
  });

  it("rejects ids that could leave their folder", () => {
    const base = { network: "mainnet", owner: "artists", kind: "images", name: "a" } as const;
    expect(() => objectKey({ ...base, ownerId: "../x" })).toThrow();
    expect(() => objectKey({ ...base, ownerId: "a/b" })).toThrow();
    expect(() => objectKey({ ...base, ownerId: "ok", kind: "a/../b" })).toThrow();
    expect(() => objectKey({ ...base, ownerId: "ok", name: "a b" })).toThrow();
    expect(() => objectKey({ ...base, ownerId: "ok", ext: "p/g" })).toThrow();
  });

  it("requires an owner id for artists and users, and none for shared", () => {
    expect(() =>
      objectKey({ network: "mainnet", owner: "artists", kind: "images", name: "a" }),
    ).toThrow();
    expect(() =>
      objectKey({ network: "mainnet", owner: "shared", ownerId: "x", kind: "images", name: "a" }),
    ).toThrow();
  });
});

describe("unreferencedKey", () => {
  it("keeps the old key under _unreferenced/", () => {
    expect(unreferencedKey("stream/1/abc/full.m4a")).toBe("_unreferenced/stream/1/abc/full.m4a");
  });
  it("rejects keys that climb", () => {
    expect(() => unreferencedKey("../x")).toThrow();
    expect(() => unreferencedKey("/x")).toThrow();
  });
});

describe("extensionFor", () => {
  it("prefers the file name", () => expect(extensionFor("Cover.PNG", "image/jpeg")).toBe("png"));
  it("falls back to the content type", () =>
    expect(extensionFor(undefined, "audio/mpeg")).toBe("mp3"));
  it("is empty when nothing tells", () =>
    expect(extensionFor("noext", "application/x-unknown")).toBe(""));
});

describe("storageNetwork", () => {
  it("reads the chain network setting", () => {
    expect(storageNetwork({ NEXT_PUBLIC_STELLAR_NETWORK: "mainnet" })).toBe("mainnet");
    expect(storageNetwork({ NEXT_PUBLIC_STELLAR_NETWORK: "testnet" })).toBe("testnet");
  });
  it("refuses anything else, so files never land in a guessed network", () => {
    expect(() => storageNetwork({ NEXT_PUBLIC_STELLAR_NETWORK: "public" })).toThrow();
  });
});
