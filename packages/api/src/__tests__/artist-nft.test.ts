import {
  Account,
  Keypair,
  Networks,
  type Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import type { SessionUser } from "../context";
import {
  createNftDraft,
  quoteNftRegistration,
  startNftRegistration,
  submitNftRegistration,
} from "../services/artist/nft";
import type { ChainGateway } from "../services/chain-gateway";

vi.mock("@bandcoin/storage", () => ({
  isOwnS3Url: (url: string) => url.startsWith("https://cdn.example/"),
}));

const wallet = Keypair.random();
const treasury = Keypair.random().publicKey();
const contract = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const network = { passphrase: Networks.TESTNET, baseFee: "100" };
const ORDER = "cmvorder0000000000000004";
const artist = { id: "a1", slug: "luna-vale", userId: "u1", issuerAccountId: "chain1" };
const me: SessionUser = {
  id: "u1",
  role: "ARTIST",
  walletAddress: wallet.publicKey(),
  walletType: "freighter",
};

const input = {
  type: "IMAGE" as const,
  title: "Night Drive",
  description: "A print",
  coverUrl: "https://cdn.example/cover.jpg",
  media: { url: "https://cdn.example/art.png", mediaType: "IMAGE" as const },
  supply: 50,
  priceBandcoin: "25",
  priceUsd: "0.5",
  resaleRoyaltyPercent: "5",
};

type Row = Record<string, unknown>;

function setup(
  opts: {
    contract?: string | null;
    xlm?: string;
    item?: Row | null;
    editionId?: number | null;
    submit?: (xdr: string) => Promise<{ hash: string }>;
  } = {},
) {
  const created: Row[] = [];
  const orders = new Map<string, Row>();
  const item =
    opts.item === null
      ? null
      : {
          id: "i1",
          artistId: "a1",
          type: "IMAGE",
          chainType: "CONTRACT_NFT",
          title: "Night Drive",
          description: "A print",
          coverUrl: "https://cdn.example/cover.jpg",
          supply: 50,
          media: { mediaType: "IMAGE", sourceUrl: "https://cdn.example/art.png" },
          contractNft: { status: "PENDING", royaltyBps: 500, contractAddress: contract },
          listings: [{ priceBandcoin: { toString: () => "25" } }],
          ...opts.item,
        };
  const db = {
    item: {
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(item),
      create: vi.fn(({ data }: { data: Row }) => {
        created.push(data);
        return Promise.resolve({ id: "i1", slug: data.slug });
      }),
    },
    contractNft: { update: vi.fn().mockResolvedValue({}) },
    order: {
      create: vi.fn(({ data }: { data: Row }) => {
        const row = { id: ORDER, status: "QUOTED", buyerId: "u1", ...data };
        orders.set(ORDER, row);
        return Promise.resolve(row);
      }),
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(orders.get(where.id) ?? null),
      ),
      findUniqueOrThrow: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(orders.get(where.id)),
      ),
      updateMany: vi.fn(
        ({ where, data }: { where: { id: string; status: { in: string[] } }; data: Row }) => {
          const row = orders.get(where.id);
          if (!row || !where.status.in.includes(row.status as string))
            return Promise.resolve({ count: 0 });
          Object.assign(row, data);
          return Promise.resolve({ count: 1 });
        },
      ),
    },
    $transaction: (run: (tx: unknown) => unknown) => run(db),
  };
  const account = Object.assign(new Account(wallet.publicKey(), "5"), {
    subentry_count: 0,
    balances: [{ asset_type: "native", balance: opts.xlm ?? "10", selling_liabilities: "0" }],
  });
  // The contract only knows the edition after the registration has been sent.
  let sent = false;
  const chain = {
    config: {
      name: "testnet",
      network,
      assets: {
        bandcoin: { code: "BANDCOIN", issuer: Keypair.random().publicKey() },
        usdc: { code: "USDC", issuer: Keypair.random().publicKey() },
      },
      treasury,
      mother: null,
      nftContract: opts.contract === undefined ? contract : opts.contract,
    },
    loadAccount: vi.fn().mockResolvedValue(account),
    prepareContractCall: vi.fn((xdr: string) => Promise.resolve(xdr)),
    editionIdByRef: vi.fn(() =>
      Promise.resolve(sent ? (opts.editionId === undefined ? 7 : opts.editionId) : null),
    ),
    submit: vi.fn(async (xdr: string) => {
      const result = await (opts.submit ?? (() => Promise.resolve({ hash: "txhash" })))(xdr);
      sent = true;
      return result;
    }),
  };
  const activity = { set: vi.fn(), facts: () => ({}) };
  return {
    ctx: { db: db as unknown as Db, chain: chain as unknown as ChainGateway, activity },
    db,
    chain,
    created,
    orders,
  };
}

describe("createNftDraft", () => {
  it("saves a contract NFT as an unpublished draft, waiting to be registered", async () => {
    const { ctx, created } = setup();
    await expect(createNftDraft(ctx, artist, me, input)).resolves.toEqual({
      itemId: "i1",
      slug: "luna-vale-night-drive",
    });
    expect(created[0]).toMatchObject({
      chainType: "CONTRACT_NFT",
      visibility: "DRAFT",
      supply: 50,
      contractNft: { create: { contractAddress: contract, royaltyBps: 500, status: "PENDING" } },
      listings: {
        create: { kind: "PRIMARY", status: "PAUSED", priceBandcoin: "25", priceUsd: "0.5" },
      },
    });
    expect(created[0]!.classicToken).toBeUndefined();
  });

  it("needs a fixed number of copies, a sane resale royalty and a configured contract", async () => {
    await expect(
      createNftDraft(setup().ctx, artist, me, { ...input, supply: 0 }),
    ).rejects.toMatchObject({ message: "Use a whole number from 1 to 100,000." });
    await expect(
      createNftDraft(setup().ctx, artist, me, { ...input, resaleRoyaltyPercent: "91" }),
    ).rejects.toMatchObject({
      message: "Resale royalty can be from 0 to 90%.",
    });
    await expect(
      createNftDraft(setup({ contract: null }).ctx, artist, me, input),
    ).rejects.toMatchObject({
      message: "Contract NFTs aren't set up on this server yet.",
    });
  });

  it("shares the classic item rules: own storage, a file for art, prices", async () => {
    await expect(
      createNftDraft(setup().ctx, artist, me, { ...input, coverUrl: "https://evil.example/c.jpg" }),
    ).rejects.toMatchObject({ message: "Upload the cover again." });
    await expect(
      createNftDraft(setup().ctx, artist, me, { ...input, media: undefined }),
    ).rejects.toMatchObject({ message: "Add the file people will get." });
    await expect(
      createNftDraft(setup().ctx, artist, me, { ...input, priceBandcoin: "0" }),
    ).rejects.toMatchObject({ message: "Enter a price above zero" });
  });
});

describe("quoteNftRegistration", () => {
  it("prices the network fee, asking the contract first so a bad edition fails before anyone signs", async () => {
    const { ctx, chain } = setup();
    const quote = await quoteNftRegistration(ctx, me, artist, "i1");
    expect(quote).toMatchObject({
      ok: true,
      total: "0.0000100",
      lines: [
        { key: "networkFee", currency: "XLM" },
        { key: "total", currency: "XLM" },
      ],
    });
    expect(chain.prepareContractCall).toHaveBeenCalledWith(expect.any(String), [treasury]);
  });

  it("explains what's in the way: not enough XLM, already registered, not set up, not found", async () => {
    await expect(
      quoteNftRegistration(setup({ xlm: "0" }).ctx, me, artist, "i1"),
    ).resolves.toMatchObject({ ok: false, problems: [{ code: "INSUFFICIENT_FUNDS" }] });
    await expect(
      quoteNftRegistration(
        setup({
          item: { contractNft: { status: "MINTED", royaltyBps: 0, contractAddress: contract } },
        }).ctx,
        me,
        artist,
        "i1",
      ),
    ).resolves.toMatchObject({
      problems: [{ code: "UNAVAILABLE", message: "This NFT is already registered." }],
    });
    await expect(
      quoteNftRegistration(setup({ contract: null }).ctx, me, artist, "i1"),
    ).resolves.toMatchObject({
      problems: [
        { code: "UNAVAILABLE", message: "Contract NFTs aren't set up on this server yet." },
      ],
    });
    await expect(
      quoteNftRegistration(setup({ item: null }).ctx, me, artist, "i1"),
    ).rejects.toMatchObject({ message: "Item not found" });
  });

  it("turns a contract refusal into a plain problem instead of an error page", async () => {
    const { ctx, chain } = setup();
    chain.prepareContractCall.mockRejectedValue(new Error("simulation failed"));
    await expect(quoteNftRegistration(ctx, me, artist, "i1")).resolves.toMatchObject({
      ok: false,
      problems: [
        {
          code: "UNAVAILABLE",
          message: "The contract rejected this edition. Check the details and try again.",
        },
      ],
    });
  });
});

describe("registering on the network", () => {
  it("builds the payment from the artist's wallet, authorised by the price authority, and signs nothing yet", async () => {
    const { ctx, chain, orders } = setup();
    const started = await startNftRegistration(ctx, me, artist, "i1");
    expect(started).toMatchObject({ orderId: ORDER, signer: "wallet" });
    const tx = TransactionBuilder.fromXDR(started.xdr, Networks.TESTNET) as Transaction;
    expect(tx.source).toBe(wallet.publicKey());
    expect(chain.submit).not.toHaveBeenCalled();
    expect(orders.get(ORDER)).toMatchObject({
      kind: "NFT_REGISTER",
      currency: "XLM",
      method: "WALLET",
      status: "AWAITING_SIGNATURE",
      breakdown: expect.objectContaining({ itemId: "i1" }) as unknown,
    });
  });

  it("sends the signed payment, then records the edition id the contract gave", async () => {
    const { ctx, chain, db, orders } = setup();
    const { xdr } = await startNftRegistration(ctx, me, artist, "i1");
    await expect(
      submitNftRegistration(ctx, me, { orderId: ORDER, xdr }, { retryDelayMs: 0 }),
    ).resolves.toEqual({ orderId: ORDER, status: "DELIVERED" });
    expect(chain.submit).toHaveBeenCalledWith(xdr);
    expect(chain.editionIdByRef).toHaveBeenCalledWith("i1");
    expect(db.contractNft.update).toHaveBeenCalledWith({
      where: { itemId: "i1" },
      data: { onChainEditionId: "7", status: "MINTED" },
    });
    expect(orders.get(ORDER)).toMatchObject({ status: "DELIVERED" });
  });

  it("fails the order and records nothing when the network says no", async () => {
    const { ctx, db, orders } = setup({ submit: () => Promise.reject(new Error("tx_failed")) });
    const { xdr } = await startNftRegistration(ctx, me, artist, "i1");
    await expect(
      submitNftRegistration(ctx, me, { orderId: ORDER, xdr }, { retryDelayMs: 0 }),
    ).rejects.toThrow("tx_failed");
    expect(db.contractNft.update).not.toHaveBeenCalled();
    expect(orders.get(ORDER)).toMatchObject({ status: "FAILED" });
  });

  it("keeps the order open when the payment landed but the edition can't be read yet, and finishes on the next quote", async () => {
    const { ctx, db, chain, orders } = setup({ editionId: null });
    const { xdr } = await startNftRegistration(ctx, me, artist, "i1");
    await expect(
      submitNftRegistration(ctx, me, { orderId: ORDER, xdr }, { retryDelayMs: 0 }),
    ).rejects.toMatchObject({
      message: "Your NFT is registered, but we couldn't confirm it yet. Refresh in a moment.",
    });
    expect(orders.get(ORDER)).toMatchObject({ status: "SUBMITTED" });
    expect(db.contractNft.update).not.toHaveBeenCalled();

    chain.editionIdByRef.mockResolvedValue(9);
    await expect(quoteNftRegistration(ctx, me, artist, "i1")).resolves.toMatchObject({
      problems: [{ message: "This NFT is already registered." }],
    });
    expect(db.contractNft.update).toHaveBeenCalledWith({
      where: { itemId: "i1" },
      data: { onChainEditionId: "9", status: "MINTED" },
    });
  });

  it("won't take someone else's order or another kind of order", async () => {
    const { ctx, orders } = setup();
    const { xdr } = await startNftRegistration(ctx, me, artist, "i1");
    await expect(
      submitNftRegistration(
        ctx,
        { ...me, id: "other" },
        { orderId: ORDER, xdr },
        { retryDelayMs: 0 },
      ),
    ).rejects.toMatchObject({ message: "Order not found" });
    orders.get(ORDER)!.kind = "ISSUER_SETUP";
    await expect(
      submitNftRegistration(ctx, me, { orderId: ORDER, xdr }, { retryDelayMs: 0 }),
    ).rejects.toMatchObject({ message: "Order not found" });
  });
});
