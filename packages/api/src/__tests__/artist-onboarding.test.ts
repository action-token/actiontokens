import {
  Account,
  Keypair,
  Networks,
  type Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

import { createContext, type SessionUser } from "../context";
import { portalRouter } from "../root-portal";
import type { ChainGateway } from "../services/chain-gateway";
import { createCallerFactory } from "../trpc";

const tokenImage = vi.hoisted(() => vi.fn().mockResolvedValue(null));
vi.mock("../services/artist/token-image", () => ({ existingTokenImage: tokenImage }));
vi.mock("@actiontokens/storage", () => ({
  isOwnS3Url: (url: string) => url.startsWith("https://cdn.example/"),
  copyImageToBucket: (url: string) =>
    Promise.resolve(`https://cdn.example/copied-of-${url.split("/").pop()}`),
}));
import {
  applyAsArtist,
  checkSlug,
  getApplication,
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
    organization?: Row | null;
    submit?: (xdr: string) => Promise<{ hash: string }>;
    takenSlug?: string;
  } = {},
) {
  const artists = new Map<string, Row>();
  if (opts.organization) artists.set("a1", { id: "a1", userId: "me", ...opts.organization });
  const chainAccounts = new Map<string, Row>();
  const orders = new Map<string, Row>();
  const db = {
    classicToken: { findUnique: vi.fn().mockResolvedValue(null) },
    organizationSlugHistory: { findUnique: vi.fn().mockResolvedValue(null) },
    organization: {
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
      update: vi.fn(({ where, data }: { where: { id?: string; userId?: string }; data: Row }) => {
        const row = where.id
          ? artists.get(where.id)!
          : [...artists.values()].find((entry) => entry.userId === where.userId)!;
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
    assetExists: vi.fn().mockResolvedValue(true),
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
      organizationId: "a1",
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

  it("won't change an application once paid, or restart an approved or banned artist", async () => {
    const paid = { ...pending, issuerAccountId: "chain1" };
    for (const artist of [
      paid,
      { ...pending, status: "APPROVED" },
      { ...pending, status: "BANNED" },
    ]) {
      await expect(
        applyAsArtist(setup({ organization: artist }).ctx, me, { name: "Luna Vale" }),
      ).rejects.toMatchObject({
        message: "You already have an artist page.",
      });
    }
  });

  it("lets an artist go back and change their answers before paying", async () => {
    const { ctx, artists, db } = setup({ organization: pending });
    await applyAsArtist(ctx, me, { name: "Luna Vale Trio", slug: "luna-vale-trio" });
    expect(db.organization.create).not.toHaveBeenCalled();
    expect(artists.get("a1")).toMatchObject({ name: "Luna Vale Trio", status: "PENDING" });
  });

  it("saves the photos and the fan token chosen in the wizard, to be made on approval", async () => {
    const { ctx, artists } = setup();
    await applyAsArtist(ctx, me, {
      name: "Luna Vale",
      avatarUrl: "https://cdn.example/me.jpg",
      coverUrl: "https://cdn.example/cover.jpg",
      fanToken: { mode: "NEW", code: " luna ", coverUrl: "https://cdn.example/token.png" },
    });
    expect(artists.get("a1")).toMatchObject({
      avatarUrl: "https://cdn.example/me.jpg",
      coverUrl: "https://cdn.example/cover.jpg",
      pendingFanToken: { mode: "NEW", code: "LUNA", coverUrl: "https://cdn.example/token.png" },
    });
  });

  it("uses the image a token already on Stellar has there (no upload), else the profile photo", async () => {
    const issuer = Keypair.random().publicKey();
    const existing = { mode: "EXISTING" as const, code: "LUNA", issuer };
    tokenImage.mockResolvedValueOnce("https://luna.example/luna.png");
    const published = setup();
    await applyAsArtist(published.ctx, me, { name: "Luna Vale", fanToken: existing });
    expect(published.artists.get("a1")).toMatchObject({
      pendingFanToken: { ...existing, coverUrl: "https://cdn.example/copied-of-luna.png" },
    });

    const none = setup();
    await applyAsArtist(none.ctx, me, {
      name: "Luna Vale",
      avatarUrl: "https://cdn.example/me.jpg",
      fanToken: existing,
    });
    expect(none.artists.get("a1")).toMatchObject({
      pendingFanToken: { coverUrl: "https://cdn.example/me.jpg" },
    });
    await expect(
      applyAsArtist(setup().ctx, me, { name: "Luna Vale", fanToken: existing }),
    ).rejects.toThrow(/profile photo first/);
  });

  it("checks a token already on Stellar, and refuses uploads from elsewhere or a short code", async () => {
    const issuer = Keypair.random().publicKey();
    const existing = { mode: "EXISTING" as const, code: "LUNA", issuer };
    const ok = setup();
    await applyAsArtist(ok.ctx, me, {
      name: "Luna Vale",
      avatarUrl: "https://cdn.example/me.jpg",
      fanToken: existing,
    });
    expect(ok.chain.assetExists).toHaveBeenCalledWith("LUNA", issuer);
    expect(ok.artists.get("a1")).toMatchObject({ pendingFanToken: existing });

    const missing = setup();
    missing.chain.assetExists.mockResolvedValue(false);
    await expect(
      applyAsArtist(missing.ctx, me, { name: "Luna Vale", fanToken: existing }),
    ).rejects.toThrow(/couldn't find that asset/);
    await expect(
      applyAsArtist(setup().ctx, me, {
        name: "Luna Vale",
        avatarUrl: "https://evil.example/x.jpg",
      }),
    ).rejects.toThrow(/profile picture again/);
    await expect(
      applyAsArtist(setup().ctx, me, {
        name: "Luna Vale",
        fanToken: { mode: "NEW", code: "LV", coverUrl: "https://cdn.example/t.png" },
      }),
    ).rejects.toThrow(/4 to 12/);
  });

  it("lets a rejected artist apply again with the same row, clearing the reason", async () => {
    const { ctx, artists, db } = setup({
      organization: { ...pending, status: "REJECTED", rejectionReason: "Needs a real name" },
    });
    await applyAsArtist(ctx, me, { name: "Luna Vale Band", slug: "luna-vale-band" });
    expect(db.organization.create).not.toHaveBeenCalled();
    expect(artists.get("a1")).toMatchObject({
      name: "Luna Vale Band",
      slug: "luna-vale-band",
      status: "PENDING",
      rejectionReason: null,
    });
  });
});

describe("getApplication", () => {
  it("gives back what they sent, or null before they apply", async () => {
    await expect(getApplication(setup().ctx, me)).resolves.toBeNull();
    const token = { mode: "NEW", code: "LUNA", coverUrl: "https://cdn.example/t.png" };
    const openedAt = new Date("2026-10-31T10:00:00Z");
    const { ctx } = setup({
      organization: {
        ...pending,
        bio: "hi",
        pendingFanToken: token,
        issuerAccount: { publicKey: "GISSUER", activatedAt: openedAt },
      },
    });
    await expect(getApplication(ctx, me)).resolves.toMatchObject({
      name: "Luna Vale",
      slug: "luna-vale",
      pendingFanToken: token,
      issuer: { publicKey: "GISSUER", openedAt },
    });
  });
});

describe("checkSlug", () => {
  it("says whether a page address is free for this person", async () => {
    await expect(checkSlug(setup().ctx, me, "luna-vale")).resolves.toEqual({ ok: true });
    await expect(
      checkSlug(setup({ takenSlug: "luna-vale" }).ctx, me, "luna-vale"),
    ).resolves.toEqual({ ok: false, message: "That page address is taken" });
    await expect(checkSlug(setup().ctx, me, "admin")).resolves.toMatchObject({ ok: false });
  });
});

describe("quoteIssuerOpening", () => {
  it("lets an artist approved before paying open it late, but not a banned one", async () => {
    await expect(
      quoteIssuerOpening(setup({ organization: { ...pending, status: "APPROVED" } }).ctx, me),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      quoteIssuerOpening(setup({ organization: { ...pending, status: "BANNED" } }).ctx, me),
    ).resolves.toMatchObject({
      ok: false,
      problems: [{ message: "Your artist account is suspended." }],
    });
  });

  it("prices the 1.5 XLM and the fee for a pending applicant", async () => {
    await expect(quoteIssuerOpening(setup({ organization: pending }).ctx, me)).resolves.toMatchObject({
      ok: true,
      total: "1.5000100",
    });
  });

  it("says what's missing when the wallet is short, and when there is nothing to pay for", async () => {
    await expect(
      quoteIssuerOpening(setup({ organization: pending, xlm: "2" }).ctx, me),
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
      quoteIssuerOpening(setup({ organization: { ...pending, issuerAccountId: "chain1" } }).ctx, me),
    ).resolves.toMatchObject({
      problems: [{ code: "UNAVAILABLE", message: "Your artist account is already open." }],
    });
  });
});

describe("opening the issuer", () => {
  it("builds the payment from the artist's wallet to a new issuer the platform holds the key for, and signs nothing yet", async () => {
    const { ctx, chain, orders, chainAccounts } = setup({ organization: pending });
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
    const { ctx, chainAccounts } = setup({ organization: pending });
    await startIssuerOpening(ctx, me);
    await startIssuerOpening(ctx, me);
    expect(chainAccounts.size).toBe(1);
  });

  it("won't start when the wallet can't cover it", async () => {
    await expect(
      startIssuerOpening(setup({ organization: pending, xlm: "1" }).ctx, me),
    ).rejects.toMatchObject({ code: "PRECONDITION_NOT_MET" });
  });

  it("sends the payment with only the artist's signature when no home domain is set (Stellar refuses extra signatures), then links the issuer", async () => {
    vi.stubEnv("ISSUER_HOME_DOMAIN", "");
    const { ctx, chain, artists, chainAccounts, orders } = setup({ organization: pending });
    const { xdr } = await startIssuerOpening(ctx, me);
    const [issuerKey] = [...chainAccounts.keys()];

    await expect(submitIssuerOpening(ctx, me, { orderId: ORDER, xdr })).resolves.toEqual({
      orderId: ORDER,
      status: "DELIVERED",
    });
    expect(chain.signWithServerKeys).not.toHaveBeenCalled();
    expect(chain.submit).toHaveBeenCalledWith(xdr);
    expect(chainAccounts.get(issuerKey!)!.activatedAt).toBeInstanceOf(Date);
    expect(artists.get("a1")).toMatchObject({ issuerAccountId: "chain1", status: "PENDING" });
    expect(orders.get(ORDER)).toMatchObject({ status: "DELIVERED" });
    vi.unstubAllEnvs();
  });

  it("sets the issuer's home domain (bandcoin.io) so wallets read stellar.toml, and the issuer signs that step", async () => {
    const { ctx, chain, chainAccounts } = setup({ organization: pending });
    const { xdr } = await startIssuerOpening(ctx, me);
    const [issuerKey] = [...chainAccounts.keys()];
    const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;
    expect(tx.operations.map((op) => op.type)).toEqual(["createAccount", "setOptions"]);
    expect(tx.operations[1]).toMatchObject({ source: issuerKey, homeDomain: "bandcoin.io" });

    await submitIssuerOpening(ctx, me, { orderId: ORDER, xdr });
    expect(chain.signWithServerKeys).toHaveBeenCalledWith(xdr, [issuerKey]);
  });

  it("refuses a different transaction than the one it built", async () => {
    const { ctx } = setup({ organization: pending });
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
      organization: pending,
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
    const { ctx, orders } = setup({ organization: pending });
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
        app: "org",
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
