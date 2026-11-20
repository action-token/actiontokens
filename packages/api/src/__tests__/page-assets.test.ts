import { describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

import {
  closePageAssetOffer,
  createPageAssetOffer,
  pageAssetOverview,
} from "../services/artist/page-assets";
import type { ChainGateway } from "../services/chain-gateway";

const artist = { id: "a1", fanTokenItemId: "fan", storageAccountId: "s1" };
const user = { id: "u1" };
const offer = {
  amount: "1000",
  priceBandcoin: "50",
  priceUsd: "5",
  priceXlm: "20",
  note: "Early supporter pack",
};

function setup({
  held = "5000",
  promised = ["3000"],
  storage = true,
  closed = 1,
}: { held?: string; promised?: string[]; storage?: boolean; closed?: number } = {}) {
  const created: Record<string, unknown>[] = [];
  const db = {
    item: {
      findUnique: vi.fn().mockResolvedValue({
        id: "fan",
        title: "Luna token",
        classicToken: { code: "LUNA", issuer: "GISSUER" },
      }),
    },
    chainAccount: {
      findUnique: vi
        .fn()
        .mockResolvedValue(storage ? { publicKey: "GSTORAGE", activatedAt: new Date() } : null),
    },
    listing: {
      findMany: vi.fn(({ where }: { where: { status: unknown } }) =>
        Promise.resolve(
          where.status === "ACTIVE"
            ? promised.map((amount) => ({ bundleAmount: amount }))
            : [
                {
                  id: "l1",
                  status: "SOLD_OUT",
                  bundleAmount: "100",
                  priceBandcoin: "5",
                  priceUsd: "0.5",
                  priceXlm: "2",
                  note: null,
                  createdAt: new Date(),
                },
              ],
        ),
      ),
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return Promise.resolve({ id: "offer1" });
      }),
      updateMany: vi.fn().mockResolvedValue({ count: closed }),
    },
  };
  const chain = {
    loadAccount: vi.fn().mockResolvedValue({
      balances: [
        { asset_type: "native", balance: "5" },
        {
          asset_type: "credit_alphanum4",
          asset_code: "LUNA",
          asset_issuer: "GISSUER",
          balance: held,
          selling_liabilities: "0",
        },
      ],
    }),
  };
  const activity = { set: vi.fn() };
  return {
    ctx: { db: db as unknown as Db, chain: chain as unknown as ChainGateway, activity } as never,
    db,
    created,
  };
}

describe("Sell Page Assets", () => {
  it("offers a bundle from storage with three prices, sold once", async () => {
    const { ctx, created } = setup();
    await createPageAssetOffer(ctx, artist, user, offer);
    expect(created[0]).toMatchObject({
      itemId: "fan",
      sellerId: "u1",
      kind: "BUNDLE",
      status: "ACTIVE",
      quantity: 1,
      bundleAmount: "1000.0000000",
      priceXlm: "20",
      note: "Early supporter pack",
    });
  });

  it("counts what open offers already promise against what storage holds", async () => {
    // 5000 held, 3000 promised: 2000 can still be offered.
    await expect(
      createPageAssetOffer(setup().ctx, artist, user, { ...offer, amount: "2500" }),
    ).rejects.toMatchObject({
      message: "Storage can offer 2000 LUNA more. Move more into it under Settings › Balances.",
    });
    await expect(
      createPageAssetOffer(setup({ storage: false }).ctx, artist, user, offer),
    ).rejects.toMatchObject({ message: expect.stringMatching(/Open your storage account/) });
    await expect(
      createPageAssetOffer(setup().ctx, artist, user, { ...offer, amount: "0" }),
    ).rejects.toThrow(/above zero/);
    await expect(
      createPageAssetOffer(setup().ctx, artist, user, { ...offer, priceXlm: "0" }),
    ).rejects.toThrow();
  });

  it("shows what storage holds, what it can still offer, and the offers", async () => {
    const overview = await pageAssetOverview(setup().ctx, artist);
    expect(overview).toMatchObject({
      fanToken: { code: "LUNA" },
      storageOpen: true,
      held: "5000.0000000",
      free: "2000.0000000",
      offers: [{ id: "l1", sold: true, amount: "100", priceXlm: "2" }],
    });
  });

  it("says storage couldn't be read instead of failing the page", async () => {
    const { ctx } = setup();
    (
      ctx as unknown as { chain: { loadAccount: ReturnType<typeof vi.fn> } }
    ).chain.loadAccount.mockRejectedValue(new Error("fetch failed"));
    await expect(pageAssetOverview(ctx, artist)).resolves.toMatchObject({
      storageOpen: true,
      held: null,
      free: null,
    });
  });

  it("takes an unsold offer down, and says so when it's already sold", async () => {
    const { ctx, db } = setup();
    await closePageAssetOffer(ctx, artist, "l1");
    expect(db.listing.updateMany).toHaveBeenCalledWith({
      where: {
        id: "l1",
        kind: "BUNDLE",
        status: "ACTIVE",
        item: { id: "fan", organizationId: "a1" },
      },
      data: { status: "CLOSED" },
    });
    await expect(closePageAssetOffer(setup({ closed: 0 }).ctx, artist, "l1")).rejects.toThrow(
      /already sold/,
    );
  });
});
