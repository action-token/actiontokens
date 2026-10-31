import { describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import type { ChainGateway } from "../services/chain-gateway";
import { getPerson } from "../services/admin/person";

const bandcoin = { code: "BANDCOIN", issuer: "GBAND" };
const usdc = { code: "USDC", issuer: "GUSDC" };

function setup(opts: { user?: Record<string, unknown> | null; offline?: boolean } = {}) {
  const user =
    opts.user === null
      ? null
      : {
          id: "u1",
          username: "luna",
          displayName: "Luna",
          avatarUrl: null,
          email: "luna@example.com",
          walletAddress: "GLUNA",
          signUpMethod: "google",
          role: "ARTIST",
          createdAt: new Date("2026-10-01"),
          suspendedAt: new Date("2026-10-29"),
          suspendedReason: "Fake claims",
          artist: {
            id: "a1",
            name: "Luna Vale",
            slug: "luna-vale",
            status: "APPROVED",
            createdAt: new Date("2026-10-02"),
            issuerAccount: { publicKey: "GISSUER" },
            storageAccount: null,
            _count: { items: 3, pins: 5, followers: 9 },
          },
          _count: { ownerships: 2, pinClaims: 7, redeemClaims: 1, follows: 4, orders: 6 },
          ...opts.user,
        };
  const db = {
    user: { findUnique: vi.fn(() => Promise.resolve(user)) },
    order: {
      findMany: vi.fn(() =>
        Promise.resolve([
          {
            id: "o1",
            kind: "ITEM_PURCHASE",
            status: "DELIVERED",
            total: { toString: () => "12.5" },
            currency: "BANDCOIN",
            quantity: 1,
            txHash: "h",
            createdAt: new Date(),
            item: { id: "i1", title: "Song" },
          },
        ]),
      ),
    },
    ownership: {
      findMany: vi.fn(() =>
        Promise.resolve([
          {
            quantity: { toString: () => "2" },
            source: "PURCHASE",
            acquiredAt: new Date(),
            item: { id: "i1", title: "Song", coverUrl: "c" },
          },
        ]),
      ),
    },
    pinClaim: {
      findMany: vi.fn(() =>
        Promise.resolve([
          {
            id: "c1",
            isRedeemed: false,
            claimedAt: null,
            createdAt: new Date("2026-10-20"),
            spot: {
              pin: {
                id: "p1",
                title: "Rooftop",
                type: "OTHER",
                imageUrl: null,
                artist: { id: "a1", name: "Luna Vale" },
              },
            },
          },
        ]),
      ),
    },
    redeemClaim: {
      findMany: vi.fn(() =>
        Promise.resolve([
          {
            id: "r1",
            code: "ABC123",
            claimedAt: new Date("2026-10-21"),
            redeem: { item: { id: "i1", title: "Song" } },
          },
        ]),
      ),
    },
    activityLog: {
      findFirst: vi.fn(() => Promise.resolve({ createdAt: new Date("2026-10-30") })),
    },
  };
  const account = {
    subentry_count: 0,
    num_sponsoring: 0,
    num_sponsored: 0,
    balances: [{ asset_type: "native", balance: "10", selling_liabilities: "0" }],
  };
  const chain = {
    config: { assets: { bandcoin, usdc } },
    loadAccount: vi.fn(() =>
      opts.offline ? Promise.reject(new Error("timeout")) : Promise.resolve(account),
    ),
  };
  return { ctx: { db: db as unknown as Db, chain: chain as unknown as ChainGateway } };
}

describe("person page", () => {
  it("brings together profile, suspension, balances, counts, artist, orders and items", async () => {
    const person = await getPerson(setup().ctx, "u1");
    expect(person).toMatchObject({
      name: "Luna Vale",
      suspended: { reason: "Fake claims" },
      counts: { owned: 2, pinsCollected: 7, redeemed: 1, following: 4, orders: 6 },
      artist: { status: "APPROVED", issuer: "GISSUER", storage: null, counts: { items: 3 } },
      orders: [{ id: "o1", total: "12.5", item: { title: "Song" } }],
      owned: [{ quantity: "2", item: { title: "Song" } }],
      lastActiveAt: new Date("2026-10-30"),
      pinsCollected: [
        { id: "c1", redeemed: false, at: new Date("2026-10-20"), pin: { title: "Rooftop" } },
      ],
      redeemed: [{ code: "ABC123", item: { title: "Song" } }],
    });
    expect(person.balances?.XLM).toBeDefined();
  });

  it("still shows the person when the network can't be reached", async () => {
    const person = await getPerson(setup({ offline: true }).ctx, "u1");
    expect(person.balances).toBeNull();
  });

  it("says when there is no such person", async () => {
    await expect(getPerson(setup({ user: null }).ctx, "nope")).rejects.toThrow(/not found/);
  });
});
