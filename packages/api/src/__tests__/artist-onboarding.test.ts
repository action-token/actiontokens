import {
  Account,
  Keypair,
  Networks,
  type Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import { createContext, type SessionUser } from "../context";
import { portalRouter } from "../root-portal";
import type { ChainGateway } from "../services/chain-gateway";
import { createCallerFactory } from "../trpc";
import {
  applyAsArtist,
  quoteIssuerOpening,
  startIssuerOpening,
  submitIssuerOpening,
} from "../services/artist/onboarding";

const wallet = Keypair.random();
const network = { passphrase: Networks.TESTNET, baseFee: "100" };
const ORDER = "cmvorder0000000000000003";
const me: SessionUser = {
  id: "me",
  role: "FAN",
  walletAddress: wallet.publicKey(),
  walletType: "freighter",
};

beforeAll(() => {
  process.env.CHAIN_ACCOUNT_KEY = "ab".repeat(32);
});

type Row = Record<string, unknown>;

function setup(
  opts: {
    xlm?: string;
    artist?: Row | null;
    submit?: (xdr: string) => Promise<{ hash: string }>;
    takenSlug?: string;
  } = {},
) {
  const artists = new Map<string, Row>();
  if (opts.artist) artists.set("a1", { id: "a1", userId: "me", ...opts.artist });
  const chainAccounts = new Map<string, Row>();
  const orders = new Map<string, Row>();
  const db = {
    artist: {
      findUnique: vi.fn(({ where }: { where: { userId?: string; slug?: string } }) => {
        if (where.slug && where.slug === opts.takenSlug)
          return Promise.resolve({ id: "other", userId: "someone", slug: where.slug });
        return Promise.resolve(
          [...artists.values()].find((row) =>
            where.userId ? row.userId === where.userId : row.slug === where.slug,
          ) ?? null,
        );
      }),
      findUniqueOrThrow: vi.fn(({ where }: { where: { userId: string } }) =>
        Promise.resolve([...artists.values()].find((row) => row.userId === where.userId)),
      ),
      create: vi.fn(({ data }: { data: Row }) => {
        const row = { id: "a1", status: "PENDING", issuerAccountId: null, ...data };
        artists.set("a1", row);
        return Promise.resolve(row);
      }),
      update: vi.fn(({ where, data }: { where: { id: string }; data: Row }) => {
        const row = artists.get(where.id)!;
        Object.assign(row, data);
        return Promise.resolve(row);
      }),
    },
    chainAccount: {
      findFirst: vi.fn(
        ({ where }: { where: { ownerId: string; kind: string; activatedAt: null } }) =>
          Promise.resolve(
            [...chainAccounts.values()].find(
              (row) =>
                row.ownerId === where.ownerId &&
                row.kind === where.kind &&
                row.activatedAt === null,
            ) ?? null,
          ),
      ),
      findUnique: vi.fn(({ where }: { where: { publicKey: string } }) =>
        Promise.resolve(chainAccounts.get(where.publicKey) ?? null),
      ),
      create: vi.fn(({ data }: { data: Row }) => {
        const row = { id: `chain${chainAccounts.size + 1}`, activatedAt: null, ...data };
        chainAccounts.set(data.publicKey as string, row);
        return Promise.resolve(row);
      }),
      update: vi.fn(({ where, data }: { where: { id: string }; data: Row }) => {
        const row = [...chainAccounts.values()].find((entry) => entry.id === where.id)!;
        Object.assign(row, data);
        return Promise.resolve(row);
      }),
    },
    order: {
      create: vi.fn(({ data }: { data: Row }) => {
        const row = { id: ORDER, status: "QUOTED", buyerId: "me", ...data };
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
  const chain = {
    config: {
      name: "testnet",
      network,
      assets: {
        bandcoin: { code: "BANDCOIN", issuer: Keypair.random().publicKey() },
        usdc: { code: "USDC", issuer: Keypair.random().publicKey() },
      },
      treasury: Keypair.random().publicKey(),
      mother: Keypair.random().publicKey(),
    },
    loadAccount: vi.fn().mockResolvedValue(account),
    signWithServerKeys: vi.fn((xdr: string) => Promise.resolve(xdr)),
    submit: vi.fn(opts.submit ?? ((_xdr: string) => Promise.resolve({ hash: "txhash" }))),
  };
  const activity = { set: vi.fn(), facts: () => ({}) };
  return {
    ctx: { db: db as unknown as Db, chain: chain as unknown as ChainGateway, activity },
    db,
    chain,
    artists,
    chainAccounts,
    orders,
  };
}

const pending = { name: "Luna Vale", slug: "luna-vale", status: "PENDING", issuerAccountId: null };

describe("applyAsArtist", () => {
  it("creates a pending application, with a page address made from the name when none is given", async () => {
    const { ctx, artists } = setup();
    await expect(applyAsArtist(ctx, me, { name: "Luna Vale" })).resolves.toEqual({
      artistId: "a1",
      slug: "luna-vale",
    });
    expect(artists.get("a1")).toMatchObject({
      userId: "me",
      name: "Luna Vale",
      slug: "luna-vale",
      status: "PENDING",
    });
  });

  it("refuses a page address someone else has, a reserved one, and a malformed one", async () => {
    await expect(
      applyAsArtist(setup({ takenSlug: "luna-vale" }).ctx, me, { name: "Luna Vale" }),
    ).rejects.toMatchObject({ message: "That page address is taken" });
    await expect(
      applyAsArtist(setup().ctx, me, { name: "Admin", slug: "admin" }),
    ).rejects.toMatchObject({ message: "That address is reserved" });
    await expect(
      applyAsArtist(setup().ctx, me, { name: "X", slug: "Not Valid" }),
    ).rejects.toMatchObject({
      message: "Use lowercase letters, numbers and single hyphens",
    });
  });

  it("won't start a second application, or restart an approved or banned artist", async () => {
    for (const status of ["PENDING", "APPROVED", "BANNED"]) {
      await expect(
        applyAsArtist(setup({ artist: { ...pending, status } }).ctx, me, { name: "Luna Vale" }),
      ).rejects.toMatchObject({
        message: "You already have an artist page.",
      });
    }
  });

  it("lets a rejected artist apply again with the same row, clearing the reason", async () => {
    const { ctx, artists, db } = setup({
      artist: { ...pending, status: "REJECTED", rejectionReason: "Needs a real name" },
    });
    await applyAsArtist(ctx, me, { name: "Luna Vale Band", slug: "luna-vale-band" });
    expect(db.artist.create).not.toHaveBeenCalled();
    expect(artists.get("a1")).toMatchObject({
      name: "Luna Vale Band",
      slug: "luna-vale-band",
      status: "PENDING",
      rejectionReason: null,
    });
  });
});

describe("quoteIssuerOpening", () => {
  it("prices the 1.5 XLM and the fee for a pending applicant", async () => {
    await expect(quoteIssuerOpening(setup({ artist: pending }).ctx, me)).resolves.toMatchObject({
      ok: true,
      total: "1.5000100",
    });
  });

  it("says what's missing when the wallet is short, and when there is nothing to pay for", async () => {
    await expect(
      quoteIssuerOpening(setup({ artist: pending, xlm: "2" }).ctx, me),
    ).resolves.toMatchObject({
      ok: false,
      problems: [{ code: "INSUFFICIENT_FUNDS" }],
    });
    await expect(quoteIssuerOpening(setup().ctx, me)).resolves.toMatchObject({
      ok: false,
      problems: [
        { code: "UNAVAILABLE", message: "Apply first, then you can open your artist account." },
      ],
    });
    await expect(
      quoteIssuerOpening(setup({ artist: { ...pending, issuerAccountId: "chain1" } }).ctx, me),
    ).resolves.toMatchObject({
      problems: [{ code: "UNAVAILABLE", message: "Your artist account is already open." }],
    });
  });
});

describe("opening the issuer", () => {
  it("builds the payment from the artist's wallet to a new issuer the platform holds the key for, and signs nothing yet", async () => {
    const { ctx, chain, orders, chainAccounts } = setup({ artist: pending });
    const started = await startIssuerOpening(ctx, me);
    expect(started).toMatchObject({ orderId: ORDER, signer: "wallet" });

    const tx = TransactionBuilder.fromXDR(started.xdr, Networks.TESTNET) as Transaction;
    expect(tx.source).toBe(wallet.publicKey());
    const [issuerKey] = [...chainAccounts.keys()];
    expect(tx.operations[0]).toMatchObject({
      type: "createAccount",
      destination: issuerKey,
      startingBalance: "1.5000000",
    });
    expect(chainAccounts.get(issuerKey!)).toMatchObject({
      kind: "ISSUER",
      ownerId: "me",
      activatedAt: null,
    });
    expect(chainAccounts.get(issuerKey!)!.secretEncrypted).not.toContain("S");
    expect(orders.get(ORDER)).toMatchObject({
      kind: "ISSUER_SETUP",
      currency: "XLM",
      method: "WALLET",
      total: "1.5000100",
      status: "AWAITING_SIGNATURE",
    });
    expect(chain.submit).not.toHaveBeenCalled();
  });

  it("reuses the issuer key from an earlier attempt that never paid", async () => {
    const { ctx, chainAccounts } = setup({ artist: pending });
    await startIssuerOpening(ctx, me);
    await startIssuerOpening(ctx, me);
    expect(chainAccounts.size).toBe(1);
  });

  it("won't start when the wallet can't cover it", async () => {
    await expect(
      startIssuerOpening(setup({ artist: pending, xlm: "1" }).ctx, me),
    ).rejects.toMatchObject({ code: "PRECONDITION_NOT_MET" });
  });

  it("sends the signed payment with the issuer's signature added, then links the issuer to the artist", async () => {
    const { ctx, chain, artists, chainAccounts, orders } = setup({ artist: pending });
    const { xdr } = await startIssuerOpening(ctx, me);
    const [issuerKey] = [...chainAccounts.keys()];

    await expect(submitIssuerOpening(ctx, me, { orderId: ORDER, xdr })).resolves.toEqual({
      orderId: ORDER,
      status: "DELIVERED",
    });
    expect(chain.signWithServerKeys).toHaveBeenCalledWith(xdr, [issuerKey]);
    expect(chain.submit).toHaveBeenCalledOnce();
    expect(chainAccounts.get(issuerKey!)!.activatedAt).toBeInstanceOf(Date);
    expect(artists.get("a1")).toMatchObject({ issuerAccountId: "chain1", status: "PENDING" });
    expect(orders.get(ORDER)).toMatchObject({ status: "DELIVERED" });
  });

  it("refuses a different transaction than the one it built", async () => {
    const { ctx } = setup({ artist: pending });
    await startIssuerOpening(ctx, me);
    const other = new TransactionBuilder(new Account(wallet.publicKey(), "9"), {
      fee: "100",
      networkPassphrase: Networks.TESTNET,
    })
      .setTimeout(30)
      .build();
    await expect(
      submitIssuerOpening(ctx, me, { orderId: ORDER, xdr: other.toXDR() }),
    ).rejects.toBeDefined();
  });

  it("keeps the artist unlinked and fails the order when the network says no", async () => {
    const { ctx, artists, orders } = setup({
      artist: pending,
      submit: () => Promise.reject(new Error("tx_failed")),
    });
    const { xdr } = await startIssuerOpening(ctx, me);
    await expect(submitIssuerOpening(ctx, me, { orderId: ORDER, xdr })).rejects.toThrow(
      "tx_failed",
    );
    expect(artists.get("a1")).toMatchObject({ issuerAccountId: null });
    expect(orders.get(ORDER)).toMatchObject({ status: "FAILED" });
  });

  it("won't take someone else's order or another kind of order", async () => {
    const { ctx, orders } = setup({ artist: pending });
    const { xdr } = await startIssuerOpening(ctx, me);
    await expect(
      submitIssuerOpening(ctx, { ...me, id: "other" }, { orderId: ORDER, xdr }),
    ).rejects.toMatchObject({ message: "Order not found" });
    orders.get(ORDER)!.kind = "RECHARGE";
    await expect(submitIssuerOpening(ctx, me, { orderId: ORDER, xdr })).rejects.toMatchObject({
      message: "Order not found",
    });
  });
});

describe("onboarding router", () => {
  const caller = (user: SessionUser | null) =>
    createCallerFactory(portalRouter)(
      createContext({
        db: { activityLog: { create: vi.fn() } } as unknown as Db,
        chain: setup().chain as unknown as ChainGateway,
        app: "artist",
        session: user ? { user } : null,
      }),
    );

  it("needs a signed-in person for everything", async () => {
    await expect(
      caller(null).onboarding.submitApplication({ name: "Luna Vale" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller(null).onboarding.issuerQuote()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(caller(null).onboarding.issuerStart()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    await expect(
      caller(null).onboarding.issuerSubmit({ orderId: "o", xdr: "x" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects a name that is too short before touching anything", async () => {
    await expect(caller(me).onboarding.submitApplication({ name: "L" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});
