import {
  Account,
  Asset,
  Keypair,
  Networks,
  Operation,
  type Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

import type { SessionUser } from "../context";
import {
  checkVanityName,
  claimVanity,
  getVanity,
  quoteVanity,
  resolveVanity,
  startVanity,
  submitVanity,
  type VanityPayInput,
} from "../services/artist/vanity";
import type { ChainGateway } from "../services/chain-gateway";

const wallet = Keypair.random();
const treasury = Keypair.random().publicKey();
const actionTokenIssuer = Keypair.random().publicKey();
const network = { passphrase: Networks.TESTNET, baseFee: "100" };
const ORDER = "cmvorder0000000000000009";
const artist = { id: "a1" };
const me: SessionUser = {
  id: "u-artist",
  role: "ARTIST",
  walletAddress: wallet.publicKey(),
  walletType: "freighter",
};
const DAY = 86_400_000;
const days = (n: number) => new Date(Date.now() + n * DAY);

type Row = Record<string, unknown>;

function setup(
  opts: {
    links?: Row[];
    trialUsed?: boolean;
    prices?: boolean;
    feeBps?: number;
    actionToken?: string;
    submit?: () => Promise<{ hash: string }>;
  } = {},
) {
  const links = new Map<string, Row>(
    (opts.links ?? []).map((link) => [link.organizationId as string, { ...link }]),
  );
  const payments: Row[] = opts.trialUsed
    ? [{ kind: "FREE_TRIAL", organizationId: "a1", amount: "0" }]
    : [];
  const orders = new Map<string, Row>();
  const byName = (name: string) => [...links.values()].find((link) => link.name === name) ?? null;
  const settings =
    opts.prices === false
      ? null
      : {
          vanityMonthlyActionToken: "50",
          vanityMonthlyUsd: "1",
          vanityNameChangeActionToken: "200",
          vanityNameChangeUsd: "4",
          platformFeeBps: opts.feeBps ?? 0,
        };

  const db = {
    appSetting: { findUnique: vi.fn().mockResolvedValue(settings) },
    vanityUrl: {
      findUnique: vi.fn(({ where }: { where: { organizationId?: string; name?: string } }) =>
        Promise.resolve(
          where.organizationId
            ? (links.get(where.organizationId) ?? null)
            : where.name
              ? byName(where.name)
              : null,
        ),
      ),
      create: vi.fn(({ data }: { data: Row }) => {
        if (byName(data.name as string))
          return Promise.reject(Object.assign(new Error("unique"), { code: "P2002" }));
        links.set(data.organizationId as string, data);
        return Promise.resolve(data);
      }),
      update: vi.fn(({ where, data }: { where: { organizationId: string }; data: Row }) => {
        Object.assign(links.get(where.organizationId)!, data);
        return Promise.resolve(links.get(where.organizationId));
      }),
      delete: vi.fn(({ where }: { where: { organizationId: string } }) => {
        links.delete(where.organizationId);
        return Promise.resolve({});
      }),
    },
    vanityPayment: {
      findFirst: vi.fn(({ where }: { where: { kind: string } }) =>
        Promise.resolve(payments.find((payment) => payment.kind === where.kind) ?? null),
      ),
      findMany: vi.fn().mockImplementation(() => Promise.resolve(payments)),
      create: vi.fn(({ data }: { data: Row }) => {
        payments.push(data);
        return Promise.resolve(data);
      }),
    },
    order: {
      create: vi.fn(({ data }: { data: Row }) => {
        const row = { id: ORDER, status: "QUOTED", buyerId: "u-artist", ...data };
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
    balances: [
      { asset_type: "native", balance: "10", selling_liabilities: "0" },
      {
        asset_type: "credit_alphanum12",
        asset_code: "ACTION",
        asset_issuer: actionTokenIssuer,
        balance: opts.actionToken ?? "500",
        selling_liabilities: "0",
      },
    ],
  });
  const chain = {
    config: {
      name: "testnet",
      network,
      assets: {
        actionToken: { code: "ACTION", issuer: actionTokenIssuer },
        usdc: { code: "USDC", issuer: Keypair.random().publicKey() },
      },
      treasury,
      mother: null,
      nftContract: null,
    },
    loadAccount: vi.fn(() => Promise.resolve(account)),
    rates: vi.fn().mockResolvedValue({ xlmUsd: "0.1", usdcUsd: "1" }),
    submit: vi.fn((_xdr: string) => (opts.submit ?? (() => Promise.resolve({ hash: "txhash" })))()),
    card: {
      charge: vi.fn().mockResolvedValue({ paymentId: "pay1" }),
      refund: vi.fn().mockResolvedValue(undefined),
    },
  };
  const activity = { set: vi.fn(), facts: () => ({}) };
  return {
    ctx: { db: db as unknown as Db, chain: chain as unknown as ChainGateway, activity },
    db,
    chain,
    links,
    payments,
    orders,
  };
}

const renew: VanityPayInput = { purpose: "RENEWAL", currency: "ACTION" };

describe("checkVanityName", () => {
  it("accepts a free, well formed name", async () => {
    expect(await checkVanityName(setup().ctx, artist, "@Luna")).toEqual({ name: "luna", ok: true });
  });

  it("explains a bad or reserved name", async () => {
    const check = await checkVanityName(setup().ctx, artist, "music");
    expect(check).toMatchObject({ ok: false, reason: "That name can't be used" });
  });

  it("says taken for another artist's link, but not for your own or one past its reserved days", async () => {
    const live = { organizationId: "b2", name: "luna", status: "ACTIVE", paidUntil: days(10) };
    expect(await checkVanityName(setup({ links: [live] }).ctx, artist, "luna")).toMatchObject({
      ok: false,
      reason: "That name is taken",
    });
    expect(
      await checkVanityName(
        setup({ links: [{ ...live, organizationId: "a1" }] }).ctx,
        artist,
        "luna",
      ),
    ).toMatchObject({ ok: true });
    const stale = { ...live, paidUntil: days(-60) };
    expect(await checkVanityName(setup({ links: [stale] }).ctx, artist, "luna")).toMatchObject({
      ok: true,
    });
  });
});

describe("claimVanity", () => {
  it("gives the first month free and records it", async () => {
    const { ctx, links, payments } = setup();
    const { name, paidUntil } = await claimVanity(ctx, artist, "Luna");
    expect(name).toBe("luna");
    expect(paidUntil.getTime()).toBeGreaterThan(days(27).getTime());
    expect(links.get("a1")).toMatchObject({ name: "luna", status: "TRIAL" });
    expect(payments).toEqual([expect.objectContaining({ kind: "FREE_TRIAL", amount: "0" })]);
  });

  it("is free only once, and not with a link already", async () => {
    await expect(claimVanity(setup({ trialUsed: true }).ctx, artist, "luna")).rejects.toThrow(
      /free month was already used/,
    );
    const link = { organizationId: "a1", name: "old", status: "TRIAL", paidUntil: days(5) };
    await expect(claimVanity(setup({ links: [link] }).ctx, artist, "luna")).rejects.toThrow(
      /already have a link/,
    );
  });

  it("reads losing a race for the name as taken", async () => {
    const { ctx, db } = setup();
    db.vanityUrl.create.mockRejectedValueOnce(
      Object.assign(new Error("unique"), { code: "P2002" }),
    );
    await expect(claimVanity(ctx, artist, "luna")).rejects.toThrow(/taken/);
  });

  it("takes over a name whose owner let it go completely", async () => {
    const stale = { organizationId: "b2", name: "luna", status: "ACTIVE", paidUntil: days(-60) };
    const { ctx, links } = setup({ links: [stale] });
    await claimVanity(ctx, artist, "luna");
    expect(links.get("b2")).toBeUndefined();
    expect(links.get("a1")).toMatchObject({ name: "luna" });
  });
});

describe("getVanity", () => {
  it("reports where the link stands and what is on offer", async () => {
    const link = { organizationId: "a1", name: "luna", status: "ACTIVE", paidUntil: days(-2) };
    const overview = await getVanity(setup({ links: [link] }).ctx, artist);
    expect(overview.link).toMatchObject({ name: "luna", status: "GRACE", works: true });
    expect(overview.canClaimFree).toBe(false);
    expect(overview.prices.monthly).toEqual({ actionToken: "50", usd: "1" });
  });

  it("offers the free month to someone who never had one", async () => {
    expect((await getVanity(setup().ctx, artist)).canClaimFree).toBe(true);
    expect((await getVanity(setup({ trialUsed: true }).ctx, artist)).canClaimFree).toBe(false);
  });
});

describe("quoteVanity", () => {
  const link = { organizationId: "a1", name: "luna", status: "ACTIVE", paidUntil: days(10) };

  it("prices a month in ACTION with the platform fee and the network fee on top", async () => {
    const quote = await quoteVanity(setup({ links: [link] }).ctx, me, artist, renew);
    expect(quote.ok).toBe(true);
    expect(quote.lines.map((line) => line.key)).toEqual(["price", "platformFee", "networkFee"]);
    expect(quote.lines[0]).toMatchObject({ label: "One more month", amount: "50.0000000" });
    expect(quote.name).toBe("luna");
  });

  it("works out XLM from the USD price at the live rate", async () => {
    const quote = await quoteVanity(setup({ links: [link] }).ctx, me, artist, {
      ...renew,
      currency: "XLM",
    });
    expect(quote.lines[0]).toMatchObject({ amount: "10.0000000", currency: "XLM" });
  });

  it("says how short the balance is", async () => {
    const quote = await quoteVanity(
      setup({ links: [link], actionToken: "20" }).ctx,
      me,
      artist,
      renew,
    );
    expect(quote.ok).toBe(false);
    expect(quote.problems[0]).toMatchObject({ code: "INSUFFICIENT_FUNDS" });
  });

  it("needs prices and, for a rename, a different free name", async () => {
    const none = await quoteVanity(setup({ links: [link], prices: false }).ctx, me, artist, renew);
    expect(none.problems.map((p) => p.message)).toContain("Link prices aren't set yet.");

    const same = await quoteVanity(setup({ links: [link] }).ctx, me, artist, {
      ...renew,
      purpose: "NAME_CHANGE",
      name: "luna",
    });
    expect(same.problems.map((p) => p.message)).toContain("That is already your link.");

    const fresh = await quoteVanity(setup({ links: [link] }).ctx, me, artist, {
      ...renew,
      purpose: "NAME_CHANGE",
      name: "luna-vale",
    });
    expect(fresh).toMatchObject({ ok: true, name: "luna-vale" });
    expect(fresh.lines[0]).toMatchObject({ label: "Change the name", amount: "200.0000000" });
  });

  it("won't rename a lapsed link", async () => {
    const lapsed = { ...link, paidUntil: days(-20) };
    const quote = await quoteVanity(setup({ links: [lapsed] }).ctx, me, artist, {
      ...renew,
      purpose: "NAME_CHANGE",
      name: "other",
    });
    expect(quote.problems.map((p) => p.message)).toContain(
      "You need a working link before you can change its name.",
    );
  });

  it("a renewal with no link yet (free month used) needs the name", async () => {
    const quote = await quoteVanity(setup({ trialUsed: true }).ctx, me, artist, {
      ...renew,
      name: "luna",
    });
    expect(quote).toMatchObject({ ok: true, name: "luna" });
  });
});

describe("pay for the link", () => {
  const link = { organizationId: "a1", name: "luna", status: "TRIAL", paidUntil: days(10) };

  async function started(opts: Parameters<typeof setup>[0], input = renew) {
    const env = setup({ links: [link], ...opts });
    const result = await startVanity(env.ctx, me, artist, input);
    // Crypto orders always come with a transaction; card ones are tested on their own.
    return { ...env, result: { ...result, xdr: result.xdr ?? "" } };
  }

  it("builds one payment to the platform, memo = the order, and pins its hash", async () => {
    const { result, orders } = await started({});
    const tx = TransactionBuilder.fromXDR(result.xdr, Networks.TESTNET) as Transaction;
    expect(Buffer.from(tx.memo.value as Buffer).toString()).toBe(ORDER);
    const [payment] = tx.operations as Operation.Payment[];
    expect(payment).toMatchObject({ type: "payment", destination: treasury, amount: "50.0000000" });
    expect(orders.get(ORDER)).toMatchObject({
      kind: "VANITY",
      status: "AWAITING_SIGNATURE",
      currency: "ACTION",
      total: "50.0000000",
      platformFee: "0.0000000",
      txHash: Buffer.from(tx.hash()).toString("hex"),
    });
    expect(result.signer).toBe("wallet");
  });

  it("refuses to start when the price can't be paid", async () => {
    await expect(started({ actionToken: "1" })).rejects.toThrow(/short/);
  });

  it("a paid renewal adds a month to the time left and logs the payment", async () => {
    const { ctx, result, links, payments, chain } = await started({});
    const done = await submitVanity(ctx, me, { orderId: result.orderId, xdr: result.xdr });
    expect(done).toMatchObject({ status: "DELIVERED", name: "luna" });
    expect(chain.submit).toHaveBeenCalledOnce();
    const row = links.get("a1")!;
    expect(row.status).toBe("ACTIVE");
    const extra = (row.paidUntil as Date).getTime() - days(10).getTime();
    expect(extra).toBeGreaterThan(27 * DAY);
    expect(extra).toBeLessThan(32 * DAY);
    expect(payments.at(-1)).toMatchObject({
      kind: "RENEWAL",
      orderId: ORDER,
      amount: "50.0000000",
    });
  });

  it("a paid name change swaps the name and keeps the paid-up time", async () => {
    const { ctx, result, links, payments } = await started(
      {},
      { ...renew, purpose: "NAME_CHANGE", name: "luna-vale" },
    );
    await submitVanity(ctx, me, { orderId: result.orderId, xdr: result.xdr });
    expect(links.get("a1")).toMatchObject({ name: "luna-vale", paidUntil: link.paidUntil });
    expect(payments.at(-1)).toMatchObject({ kind: "NAME_CHANGE" });
  });

  it("a renewal after the free month was used creates the link", async () => {
    const env = setup({ trialUsed: true });
    const result = await startVanity(env.ctx, me, artist, { ...renew, name: "luna" });
    await submitVanity(env.ctx, me, { orderId: result.orderId, xdr: result.xdr ?? "" });
    expect(env.links.get("a1")).toMatchObject({ name: "luna", status: "ACTIVE" });
  });

  it("sends nothing when the name was taken since the price was shown", async () => {
    const { ctx, result, db, chain, orders } = await started(
      {},
      { ...renew, purpose: "NAME_CHANGE", name: "luna-vale" },
    );
    db.vanityUrl.findUnique.mockImplementation(
      ({ where }: { where: { name?: string; organizationId?: string } }) =>
        Promise.resolve(
          where.name
            ? { organizationId: "b2", name: where.name, status: "ACTIVE", paidUntil: days(9) }
            : link,
        ),
    );
    await expect(
      submitVanity(ctx, me, { orderId: result.orderId, xdr: result.xdr }),
    ).rejects.toThrow(/taken/);
    expect(chain.submit).not.toHaveBeenCalled();
    expect(orders.get(ORDER)?.status).toBe("CANCELED");
  });

  it("only takes the transaction that was built", async () => {
    const { ctx, result } = await started({});
    const other = new TransactionBuilder(new Account(wallet.publicKey(), "99"), {
      fee: "100",
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.payment({
          destination: treasury,
          asset: Asset.native(),
          amount: "1",
        }),
      )
      .setTimeout(30)
      .build()
      .toXDR();
    expect(result.xdr).not.toBe(other);
    await expect(submitVanity(ctx, me, { orderId: result.orderId, xdr: other })).rejects.toThrow();
  });

  it("is delivered once even if submitted twice", async () => {
    const { ctx, result } = await started({});
    await submitVanity(ctx, me, { orderId: result.orderId, xdr: result.xdr });
    await expect(
      submitVanity(ctx, me, { orderId: result.orderId, xdr: result.xdr }),
    ).rejects.toThrow(/already/);
  });
});

describe("pay for the link by card, with the platform fee (plan 33)", () => {
  const link = { organizationId: "a1", name: "luna", status: "TRIAL", paidUntil: days(10) };
  const byCard: VanityPayInput = { purpose: "RENEWAL", currency: "USD" };

  it("adds the platform fee to a crypto payment", async () => {
    const env = setup({ links: [link], feeBps: 250 });
    const result = await startVanity(env.ctx, me, artist, renew);
    const tx = TransactionBuilder.fromXDR(result.xdr ?? "", Networks.TESTNET) as Transaction;
    expect((tx.operations[0] as Operation.Payment).amount).toBe("51.2500000");
    expect(env.orders.get(ORDER)).toMatchObject({
      unitPrice: "50.0000000",
      platformFee: "1.2500000",
      total: "51.2500000",
    });
  });

  it("builds nothing to sign, charges the price + fee once, then delivers", async () => {
    const env = setup({ links: [link], feeBps: 250 });
    const result = await startVanity(env.ctx, me, artist, byCard);
    expect(result).toMatchObject({ xdr: null, signer: "card" });
    expect(env.orders.get(ORDER)).toMatchObject({ method: "CARD", currency: "USD" });
    expect(result.quote.lines.map((line) => line.key)).not.toContain("networkFee");

    const card = { sourceId: "cnon:card" };
    await expect(
      submitVanity(env.ctx, me, { orderId: result.orderId, card }),
    ).resolves.toMatchObject({ status: "DELIVERED", name: "luna" });
    expect(env.chain.card.charge).toHaveBeenCalledOnce();
    expect(env.chain.card.charge).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: ORDER, cents: 103 }),
    );
    expect(env.chain.submit).not.toHaveBeenCalled();
    expect(env.payments.at(-1)).toMatchObject({ kind: "RENEWAL", currency: "USD" });
    await expect(submitVanity(env.ctx, me, { orderId: result.orderId, card })).rejects.toThrow(
      /already/,
    );
    expect(env.chain.card.charge).toHaveBeenCalledOnce();
  });

  it("needs a card", async () => {
    const env = setup({ links: [link] });
    const result = await startVanity(env.ctx, me, artist, byCard);
    await expect(submitVanity(env.ctx, me, { orderId: result.orderId })).rejects.toThrow(/card/);
    expect(env.chain.card.charge).not.toHaveBeenCalled();
  });

  it("checks the name before charging", async () => {
    const env = setup({ links: [link] });
    const result = await startVanity(env.ctx, me, artist, {
      ...byCard,
      purpose: "NAME_CHANGE",
      name: "luna-vale",
    });
    env.db.vanityUrl.findUnique.mockImplementation(
      ({ where }: { where: { name?: string; organizationId?: string } }) =>
        Promise.resolve(
          where.name
            ? { organizationId: "b2", name: where.name, status: "ACTIVE", paidUntil: days(9) }
            : link,
        ),
    );
    await expect(
      submitVanity(env.ctx, me, { orderId: result.orderId, card: { sourceId: "c" } }),
    ).rejects.toThrow(/taken/);
    expect(env.chain.card.charge).not.toHaveBeenCalled();
    expect(env.orders.get(ORDER)?.status).toBe("CANCELED");
  });

  it("refunds the card when the link can't be updated", async () => {
    const env = setup({ links: [link] });
    const result = await startVanity(env.ctx, me, artist, byCard);
    env.db.vanityUrl.update.mockRejectedValueOnce(new Error("db down"));
    await expect(
      submitVanity(env.ctx, me, { orderId: result.orderId, card: { sourceId: "c" } }),
    ).rejects.toThrow("db down");
    expect(env.chain.card.refund).toHaveBeenCalledWith({
      orderId: ORDER,
      paymentId: "pay1",
      cents: 100,
    });
    expect(env.orders.get(ORDER)?.status).toBe("REFUNDED");
  });
});

describe("resolveVanity", () => {
  const artistRow = { slug: "luna-vale", status: "APPROVED" };
  const link = (paidUntil: Date, artistStatus = "APPROVED") => ({
    name: "luna",
    status: "ACTIVE",
    paidUntil,
    organization: { ...artistRow, status: artistStatus },
  });
  const ctxWith = (row: unknown) =>
    ({ db: { vanityUrl: { findUnique: vi.fn().mockResolvedValue(row) } } }) as unknown as {
      db: Db;
    };

  it("shows the page while paid or in grace", async () => {
    expect(await resolveVanity(ctxWith(link(days(5))), "Luna")).toEqual({
      slug: "luna-vale",
      works: true,
    });
    expect(await resolveVanity(ctxWith(link(days(-3))), "luna")).toMatchObject({ works: true });
  });

  it("redirects once it lapsed", async () => {
    expect(await resolveVanity(ctxWith(link(days(-9))), "luna")).toEqual({
      slug: "luna-vale",
      works: false,
    });
  });

  it("knows nothing of unknown names or artists who aren't approved", async () => {
    expect(await resolveVanity(ctxWith(null), "luna")).toBeNull();
    expect(await resolveVanity(ctxWith(link(days(5), "BANNED")), "luna")).toBeNull();
  });
});
