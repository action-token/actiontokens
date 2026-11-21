import {
  Account,
  Keypair,
  Networks,
  type Operation,
  type Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

import type { SessionUser } from "../context";
import {
  cancelRoyalty,
  quoteRoyalty,
  resumeRoyalty,
  startRoyalty,
  submitRoyaltyBatch,
} from "../services/artist/royalty";
import type { ChainGateway } from "../services/chain-gateway";

vi.mock("@actiontokens/storage", () => ({
  isOwnS3Url: (url: string) => url.startsWith("https://cdn.example/"),
}));

const wallet = Keypair.random();
const issuer = Keypair.random().publicKey();
const storage = Keypair.random().publicKey();
const treasury = Keypair.random().publicKey();
const actionTokenIssuer = Keypair.random().publicKey();
const network = { passphrase: Networks.TESTNET, baseFee: "100" };
const artist = { id: "a1" };
const me: SessionUser = {
  id: "u-artist",
  role: "ARTIST",
  walletAddress: wallet.publicKey(),
  walletType: "freighter",
};
const report = {
  url: "https://cdn.example/uploads/report.pdf",
  name: "Q3 report.pdf",
  size: 1234,
  type: "application/pdf",
};

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const matches = (row: Row, where: Where = {}) =>
  Object.entries(where).every(([key, want]) => {
    const have = row[key];
    if (want && typeof want === "object" && "not" in want) return have !== (want as Row).not;
    if (want && typeof want === "object" && "in" in want)
      return ((want as Row).in as unknown[]).includes(have);
    return have === want;
  });

const holder = () => Keypair.random().publicKey();

function setup(
  opts: {
    holders?: { address: string; balance: string }[];
    complete?: boolean;
    supply?: number | null;
    percent?: string;
    actionToken?: string;
    xlm?: string;
    /** Holders (by address) that have a ACTION trustline */
    trusting?: string[];
    submit?: (xdr: string) => Promise<{ hash: string }>;
    landed?: string[];
  } = {},
) {
  const payouts = new Map<string, Row>();
  const lines: Row[] = [];
  let seq = 0;

  const db = {
    item: {
      findFirst: vi.fn().mockResolvedValue({
        id: "i1",
        title: "Luna Records share",
        supply: opts.supply === undefined ? 100 : opts.supply,
        royaltyPercent: { toString: () => opts.percent ?? "20" },
        classicToken: { code: "LUNA", issuer },
      }),
    },
    organization: {
      findUnique: vi.fn().mockResolvedValue({
        issuerAccount: { publicKey: issuer },
        storageAccount: { publicKey: storage },
      }),
    },
    royaltyReport: { create: vi.fn().mockResolvedValue({ id: "r1" }) },
    royaltyPayout: {
      create: vi.fn(({ data }: { data: Row }) => {
        const row = { id: "p1", createdAt: new Date(), ...data };
        payouts.set("p1", row);
        return Promise.resolve(row);
      }),
      findFirst: vi.fn(({ where }: { where: Where }) =>
        Promise.resolve(
          [...payouts.values()].find((row) =>
            matches(row, { id: where.id, organizationId: where.organizationId }),
          ) ?? null,
        ),
      ),
      update: vi.fn(({ where, data }: { where: { id: string }; data: Row }) => {
        Object.assign(payouts.get(where.id)!, data);
        return Promise.resolve(payouts.get(where.id));
      }),
    },
    royaltyPayoutLine: {
      createMany: vi.fn(({ data }: { data: Row[] }) => {
        for (const row of data) lines.push({ id: `l${++seq}`, status: "PENDING", ...row });
        return Promise.resolve({ count: data.length });
      }),
      findMany: vi.fn(({ where }: { where: Where }) =>
        Promise.resolve(lines.filter((row) => matches(row, where))),
      ),
      updateMany: vi.fn(({ where, data }: { where: Where; data: Row }) => {
        const hit = lines.filter((row) => matches(row, where));
        for (const row of hit) Object.assign(row, data);
        return Promise.resolve({ count: hit.length });
      }),
      update: vi.fn(({ where, data }: { where: { id: string }; data: Row }) => {
        Object.assign(
          lines.find((row) => row.id === where.id)!,
          data,
        );
        return Promise.resolve({});
      }),
      count: vi.fn(({ where }: { where: Where }) =>
        Promise.resolve(lines.filter((row) => matches(row, where)).length),
      ),
      aggregate: vi.fn(({ where }: { where: Where }) =>
        Promise.resolve({
          _max: {
            batchNo: Math.max(
              0,
              ...lines.filter((row) => matches(row, where)).map((row) => row.batchNo as number),
            ),
          },
        }),
      ),
      groupBy: vi.fn(({ where }: { where: Where }) => {
        const counts = new Map<string, number>();
        for (const row of lines.filter((l) => matches(l, { payoutId: where.payoutId })))
          counts.set(row.status as string, (counts.get(row.status as string) ?? 0) + 1);
        return Promise.resolve([...counts].map(([status, _count]) => ({ status, _count })));
      }),
    },
    $transaction: (run: unknown) =>
      typeof run === "function"
        ? (run as (tx: unknown) => unknown)(db)
        : Promise.all(run as unknown[]),
  };

  const holders = opts.holders ?? [
    { address: holder(), balance: "30" },
    { address: holder(), balance: "10" },
  ];
  const trusting = new Set(opts.trusting ?? holders.map((h) => h.address));
  const account = Object.assign(new Account(wallet.publicKey(), "5"), {
    subentry_count: 0,
    balances: [
      { asset_type: "native", balance: opts.xlm ?? "10", selling_liabilities: "0" },
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
    },
    assetHolders: vi.fn().mockResolvedValue({ holders, complete: opts.complete ?? true }),
    loadAccount: vi.fn((id: string) => {
      if (id === wallet.publicKey()) return Promise.resolve(account);
      if (!trusting.has(id)) return Promise.resolve({ balances: [{ asset_type: "native" }] });
      return Promise.resolve({
        balances: [
          {
            asset_type: "credit_alphanum12",
            asset_code: "ACTION",
            asset_issuer: actionTokenIssuer,
            balance: "1",
          },
        ],
      });
    }),
    findTransaction: vi.fn((hash: string) =>
      Promise.resolve(
        opts.landed?.includes(hash) ? { successful: true, envelopeXdr: "", ledgerAt: "" } : null,
      ),
    ),
    submit: vi.fn((xdr: string) =>
      (opts.submit ?? (() => Promise.resolve({ hash: "txhash" })))(xdr),
    ),
  };
  const activity = { set: vi.fn(), facts: () => ({}) };
  return {
    ctx: { db: db as unknown as Db, chain: chain as unknown as ChainGateway, activity },
    db,
    chain,
    payouts,
    lines,
    holders,
  };
}

const ask = { itemId: "i1", revenue: "1000", currency: "ACTION" as const };

describe("quoteRoyalty", () => {
  it("pays by share of the whole supply and keeps the unsold share", async () => {
    const { ctx } = setup();
    const quote = await quoteRoyalty(ctx, me, artist, ask);
    // pool 200 (20% of 1000); 30 and 10 of 100 tokens held
    expect(quote).toMatchObject({
      ok: true,
      pool: "200.0000000",
      paid: "80.0000000",
      kept: "120.0000000",
    });
    expect(quote.holders).toMatchObject({ count: 2, skipped: 0 });
    expect(quote.holders.preview.map((h) => h.amount)).toEqual(["60.0000000", "20.0000000"]);
    expect(quote.lines.map((line) => line.key)).toEqual(["price", "networkFee"]);
    expect(quote.totals).toEqual([
      { currency: "ACTION", amount: "80.0000000" },
      { currency: "XLM", amount: "0.0000200" },
    ]);
  });

  it("never pays the artist, the issuer, their storage or the platform", async () => {
    const fan = holder();
    const { ctx } = setup({
      holders: [
        { address: wallet.publicKey(), balance: "20" },
        { address: issuer, balance: "20" },
        { address: storage, balance: "20" },
        { address: treasury, balance: "20" },
        { address: fan, balance: "10" },
      ],
    });
    const quote = await quoteRoyalty(ctx, me, artist, ask);
    expect(quote.holders.preview.map((h) => h.address)).toEqual([fan]);
    expect(quote.kept).toBe("180.0000000");
  });

  it("skips holders who can't receive the payout asset, and says so", async () => {
    const a = holder();
    const b = holder();
    const { ctx } = setup({
      holders: [
        { address: a, balance: "30" },
        { address: b, balance: "10" },
      ],
      trusting: [a],
    });
    const quote = await quoteRoyalty(ctx, me, artist, ask);
    expect(quote.holders).toMatchObject({ count: 1, skipped: 1 });
    expect(quote.paid).toBe("60.0000000");
  });

  it("pays in XLM without any trustline", async () => {
    const { ctx, chain } = setup({ trusting: [] });
    const quote = await quoteRoyalty(ctx, me, artist, { ...ask, currency: "XLM" });
    expect(quote.holders.count).toBe(2);
    expect(chain.loadAccount).toHaveBeenCalledTimes(1);
  });

  const problems = async (opts: Parameters<typeof setup>[0], input = ask) =>
    (await quoteRoyalty(setup(opts).ctx, me, artist, input)).problems.map((p) => p.message);

  it("explains what's in the way", async () => {
    expect(await problems({}, { ...ask, revenue: "abc" })).toContain(
      "Enter the revenue as a number above 0.",
    );
    expect(await problems({ supply: null })).toContain(
      "Set how many shares exist on this item before paying out.",
    );
    expect(await problems({ holders: [] })).toContain(
      "Nobody holds this item yet, so there is nobody to pay.",
    );
    expect(await problems({ complete: false })).toEqual([
      expect.stringContaining("too many holders"),
    ]);
    expect(await problems({ trusting: [] })).toContain(
      "None of the holders can receive ACTION yet. Pay in XLM instead.",
    );
  });

  it("says how short the balance is", async () => {
    const quote = await quoteRoyalty(setup({ actionToken: "10" }).ctx, me, artist, ask);
    expect(quote.ok).toBe(false);
    expect(quote.problems[0]).toMatchObject({ code: "INSUFFICIENT_FUNDS" });
  });
});

describe("startRoyalty", () => {
  it("saves the report, the payout and every holder's line, and builds the batches", async () => {
    const { ctx, db, lines } = setup();
    const result = await startRoyalty(ctx, me, artist, { ...ask, report });
    expect(db.royaltyReport.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ itemId: "i1", fileName: "Q3 report.pdf" }) as unknown,
    });
    expect(db.royaltyPayout.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        totalAmount: "80.0000000",
        status: "DRAFT",
        reportId: "r1",
      }) as unknown,
    });
    expect(lines).toHaveLength(2);
    expect(result.batches).toHaveLength(1);
    const tx = TransactionBuilder.fromXDR(result.batches[0]!.xdr, Networks.TESTNET) as Transaction;
    expect(Buffer.from(tx.memo.value as Buffer).toString()).toBe("p1");
    expect((tx.operations as Operation.Payment[]).map((op) => op.amount)).toEqual([
      "60.0000000",
      "20.0000000",
    ]);
    expect(lines.every((line) => line.txHash === Buffer.from(tx.hash()).toString("hex"))).toBe(
      true,
    );
    expect(result.signer).toBe("wallet");
  });

  it("splits more than 100 holders into batches that follow each other", async () => {
    const holders = Array.from({ length: 130 }, () => ({ address: holder(), balance: "0.5" }));
    const { ctx, lines } = setup({ holders, supply: 1000 });
    const result = await startRoyalty(ctx, me, artist, { ...ask, revenue: "10000", report });
    expect(result.batches.map((batch) => batch.batchNo)).toEqual([1, 2]);
    expect(lines.filter((line) => line.batchNo === 1)).toHaveLength(100);
    expect(lines.filter((line) => line.batchNo === 2)).toHaveLength(30);
    const [first, second] = result.batches.map(
      (batch) => TransactionBuilder.fromXDR(batch.xdr, Networks.TESTNET) as Transaction,
    );
    expect(BigInt(second!.sequence)).toBe(BigInt(first!.sequence) + 1n);
  });

  it("needs a report from our own storage, and a price that can be paid", async () => {
    await expect(
      startRoyalty(setup().ctx, me, artist, {
        ...ask,
        report: { ...report, url: "https://evil.example/x.pdf" },
      }),
    ).rejects.toThrow(/Upload the file again/);
    await expect(
      startRoyalty(setup({ actionToken: "1" }).ctx, me, artist, { ...ask, report }),
    ).rejects.toThrow(/short/);
  });
});

describe("submitRoyaltyBatch", () => {
  async function started(opts: Parameters<typeof setup>[0] = {}, revenue = "10000") {
    const env = setup(
      opts?.holders
        ? opts
        : {
            ...opts,
            holders: Array.from({ length: 130 }, () => ({ address: holder(), balance: "0.5" })),
            supply: 1000,
          },
    );
    const result = await startRoyalty(env.ctx, me, artist, { ...ask, revenue, report });
    return { ...env, result };
  }

  it("sends batches in order and completes the payout after the last", async () => {
    const { ctx, result, payouts, lines } = await started();
    const [one, two] = result.batches;
    await expect(
      submitRoyaltyBatch(ctx, me, artist, { payoutId: "p1", batchNo: 2, xdr: two!.xdr }),
    ).rejects.toThrow(/earlier batches/);

    const first = await submitRoyaltyBatch(ctx, me, artist, {
      payoutId: "p1",
      batchNo: 1,
      xdr: one!.xdr,
    });
    expect(first.status).toBe("SUBMITTING");
    expect(lines.filter((line) => line.status === "SENT")).toHaveLength(100);

    const last = await submitRoyaltyBatch(ctx, me, artist, {
      payoutId: "p1",
      batchNo: 2,
      xdr: two!.xdr,
    });
    expect(last.status).toBe("COMPLETE");
    expect(payouts.get("p1")?.status).toBe("COMPLETE");
    await expect(
      submitRoyaltyBatch(ctx, me, artist, { payoutId: "p1", batchNo: 2, xdr: two!.xdr }),
    ).rejects.toThrow(/already/);
  });

  it("only takes the transaction that was built", async () => {
    const { ctx, chain, result } = await started();
    await expect(
      submitRoyaltyBatch(ctx, me, artist, {
        payoutId: "p1",
        batchNo: 1,
        xdr: result.batches[1]!.xdr,
      }),
    ).rejects.toThrow();
    expect(chain.submit).not.toHaveBeenCalled();
  });

  it("marks the batch failed and the payout partial when a later batch is rejected", async () => {
    let calls = 0;
    const { ctx, result, payouts, lines } = await started({
      submit: () =>
        ++calls === 1 ? Promise.resolve({ hash: "ok" }) : Promise.reject(new Error("rejected")),
    });
    await submitRoyaltyBatch(ctx, me, artist, {
      payoutId: "p1",
      batchNo: 1,
      xdr: result.batches[0]!.xdr,
    });
    await expect(
      submitRoyaltyBatch(ctx, me, artist, {
        payoutId: "p1",
        batchNo: 2,
        xdr: result.batches[1]!.xdr,
      }),
    ).rejects.toThrow("rejected");
    expect(lines.filter((line) => line.status === "FAILED")).toHaveLength(30);
    expect(payouts.get("p1")?.status).toBe("PARTIAL");
  });

  it("belongs to the artist who started it", async () => {
    const { ctx, result } = await started();
    await expect(
      submitRoyaltyBatch(
        ctx,
        me,
        { id: "someone-else" },
        { payoutId: "p1", batchNo: 1, xdr: result.batches[0]!.xdr },
      ),
    ).rejects.toThrow(/not found/i);
  });
});

describe("resumeRoyalty", () => {
  it("never pays a batch twice: one that landed is marked sent, the rest is rebuilt after it", async () => {
    const holders = Array.from({ length: 130 }, () => ({ address: holder(), balance: "0.5" }));
    const env = setup({ holders, supply: 1000 });
    const started = await startRoyalty(env.ctx, me, artist, { ...ask, revenue: "10000", report });
    // Batch 1's answer was lost: the network has it, the database doesn't know.
    const hashOne = env.lines.find((line) => line.batchNo === 1)!.txHash as string;
    env.chain.findTransaction.mockImplementation((hash: string) =>
      Promise.resolve(
        hash === hashOne ? { successful: true, envelopeXdr: "", ledgerAt: "" } : null,
      ),
    );
    env.payouts.get("p1")!.status = "SUBMITTING";
    expect(started.batches).toHaveLength(2);

    const resumed = await resumeRoyalty(env.ctx, me, artist, { payoutId: "p1" });
    expect(env.lines.filter((line) => line.status === "SENT")).toHaveLength(100);
    expect(resumed.batches.map((batch) => batch.batchNo)).toEqual([2]);
    const tx = TransactionBuilder.fromXDR(resumed.batches[0]!.xdr, Networks.TESTNET) as Transaction;
    expect(tx.operations).toHaveLength(30);
    expect(env.lines.filter((line) => line.status === "PENDING")).toHaveLength(30);
  });

  it("has nothing to sign when every batch had landed", async () => {
    const env = setup();
    await startRoyalty(env.ctx, me, artist, { ...ask, report });
    const hash = env.lines[0]!.txHash as string;
    env.chain.findTransaction.mockResolvedValue({
      successful: true,
      envelopeXdr: "",
      ledgerAt: "",
    });
    env.payouts.get("p1")!.status = "SUBMITTING";
    expect(hash).toBeTruthy();
    const resumed = await resumeRoyalty(env.ctx, me, artist, { payoutId: "p1" });
    expect(resumed).toMatchObject({ batches: [], status: "COMPLETE" });
  });

  it("refuses a payout that was never submitted or is already complete", async () => {
    const env = setup();
    await startRoyalty(env.ctx, me, artist, { ...ask, report });
    await expect(resumeRoyalty(env.ctx, me, artist, { payoutId: "p1" })).rejects.toThrow(
      /Nothing was sent/,
    );
    env.payouts.get("p1")!.status = "FAILED";
    await expect(resumeRoyalty(env.ctx, me, artist, { payoutId: "p1" })).rejects.toThrow(
      /canceled/,
    );
    env.payouts.get("p1")!.status = "COMPLETE";
    await expect(resumeRoyalty(env.ctx, me, artist, { payoutId: "p1" })).rejects.toThrow(
      /Everyone was paid/,
    );
  });
});

describe("cancelRoyalty", () => {
  it("drops a payout nothing was sent for", async () => {
    const env = setup();
    await startRoyalty(env.ctx, me, artist, { ...ask, report });
    const result = await cancelRoyalty(env.ctx, artist, { payoutId: "p1" });
    expect(result.status).toBe("FAILED");
    expect(env.lines.every((line) => line.status === "FAILED")).toBe(true);
  });

  it("won't cancel once a batch went out", async () => {
    const env = setup();
    const started = await startRoyalty(env.ctx, me, artist, { ...ask, report });
    await submitRoyaltyBatch(env.ctx, me, artist, {
      payoutId: "p1",
      batchNo: 1,
      xdr: started.batches[0]!.xdr,
    });
    await expect(cancelRoyalty(env.ctx, artist, { payoutId: "p1" })).rejects.toThrow(
      /already paid|Resume/,
    );
  });
});
