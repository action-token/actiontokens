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
  quoteContractFee,
  readContractFee,
  startContractFee,
  submitContractFee,
} from "../services/admin/contract-fee";
import { getSettings, updateSettings } from "../services/admin/settings";
import type { ChainGateway } from "../services/chain-gateway";

const owner = Keypair.random();
const treasury = Keypair.random().publicKey();
const newTreasury = Keypair.random().publicKey();
const contract = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const network = { passphrase: Networks.TESTNET, baseFee: "100" };
const ORDER = "cmvorder0000000000000009";
const admin: SessionUser = {
  id: "admin1",
  role: "ADMIN",
  walletAddress: owner.publicKey(),
  walletType: "freighter",
};

type Row = Record<string, unknown>;

function setup(
  opts: {
    row?: Row | null;
    contract?: string | null;
    onChain?: { feeBps: number; treasury: string | null; owner: string | null } | Error;
    xlm?: string;
  } = {},
) {
  const orders = new Map<string, Row>();
  const db = {
    appSetting: {
      findUnique: vi.fn().mockResolvedValue(opts.row ?? null),
      upsert: vi.fn().mockResolvedValue({}),
    },
    order: {
      create: vi.fn(({ data }: { data: Row }) => {
        const row = { id: ORDER, status: "QUOTED", buyerId: admin.id, ...data };
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
  const account = Object.assign(new Account(owner.publicKey(), "5"), {
    subentry_count: 0,
    balances: [{ asset_type: "native", balance: opts.xlm ?? "10", selling_liabilities: "0" }],
  });
  const onChain = opts.onChain ?? { feeBps: 250, treasury, owner: owner.publicKey() };
  const chain = {
    config: {
      network,
      assets: {
        bandcoin: { code: "BANDCOIN", issuer: Keypair.random().publicKey() },
        usdc: { code: "USDC", issuer: Keypair.random().publicKey() },
      },
      treasury,
      nftContract: opts.contract === undefined ? contract : opts.contract,
    },
    nftFeeSettings: vi.fn(() =>
      onChain instanceof Error ? Promise.reject(onChain) : Promise.resolve(onChain),
    ),
    loadAccount: vi.fn().mockResolvedValue(account),
    prepareContractCall: vi.fn((xdr: string) => Promise.resolve(xdr)),
    submit: vi.fn().mockResolvedValue({ hash: "txhash" }),
  };
  const activity = { set: vi.fn(), facts: () => ({}) };
  return {
    ctx: { db: db as unknown as Db, chain: chain as unknown as ChainGateway, activity },
    db,
    chain,
    orders,
    activity,
  };
}

const saved = {
  platformFeeBps: 250,
  platformFeeRecipient: null,
  vanityMonthlyBandcoin: null,
  vanityMonthlyUsd: null,
  vanityNameChangeBandcoin: null,
  vanityNameChangeUsd: null,
  nearbyPinRadiusMeters: 500,
};

describe("saved settings", () => {
  it("falls back to the defaults while there's no row, and names the treasury", async () => {
    const { ctx } = setup();
    await expect(getSettings(ctx)).resolves.toEqual({ saved, treasury });
  });

  it("saves the row and says what changed, logging the settings as the target", async () => {
    const { ctx, db, activity } = setup({
      row: { ...saved, vanityMonthlyUsd: { toString: () => "5" } },
    });
    const next = { ...saved, platformFeeBps: 300, vanityMonthlyUsd: "5" };
    const { changes } = await updateSettings(ctx, next);
    expect(changes).toEqual([
      { field: "platformFeeBps", label: "Platform fee", before: 250, after: 300 },
    ]);
    expect(db.appSetting.upsert).toHaveBeenCalledWith({
      where: { id: 1 },
      create: { id: 1, ...next },
      update: next,
    });
    expect(activity.set).toHaveBeenCalledWith({ targetType: "AppSetting", targetId: "1" });
  });
});

describe("contract-NFT fee", () => {
  it("reads what the contract enforces, or says why it can't", async () => {
    await expect(readContractFee(setup().ctx)).resolves.toMatchObject({
      configured: true,
      onChain: { feeBps: 250, treasury },
    });
    await expect(readContractFee(setup({ contract: null }).ctx)).resolves.toMatchObject({
      configured: false,
      onChain: null,
    });
    await expect(
      readContractFee(setup({ onChain: new Error("rpc down") }).ctx),
    ).resolves.toMatchObject({
      configured: true,
      onChain: null,
      error: "Couldn't read the contract.",
    });
  });

  it("shows the network fee before anything is signed", async () => {
    const quote = await quoteContractFee(setup().ctx, admin, { feeBps: 300, treasury });
    expect(quote.ok).toBe(true);
    expect(quote.lines.map((line) => line.key)).toEqual(["networkFee", "total"]);
  });

  it("only lets the contract's owner change it, and only to something new", async () => {
    const stranger = { ...admin, walletAddress: Keypair.random().publicKey() };
    const notOwner = await quoteContractFee(setup().ctx, stranger, { feeBps: 300, treasury });
    expect(notOwner.problems[0]?.message).toMatch(/Only the contract's owner/);
    const same = await quoteContractFee(setup().ctx, admin, { feeBps: 250, treasury });
    expect(same.problems[0]?.message).toMatch(/already uses/);
  });

  it("says when the wallet can't pay the network fee", async () => {
    const quote = await quoteContractFee(setup({ xlm: "0" }).ctx, admin, {
      feeBps: 300,
      treasury,
    });
    expect(quote.problems[0]?.code).toBe("INSUFFICIENT_FUNDS");
  });

  it("builds set_platform_fee from the owner's wallet as an order, then sends the signed call", async () => {
    const { ctx, chain, orders } = setup();
    const started = await startContractFee(ctx, admin, { feeBps: 300, treasury: newTreasury });
    expect(started).toMatchObject({ orderId: ORDER, signer: "wallet" });
    const tx = TransactionBuilder.fromXDR(started.xdr, Networks.TESTNET) as Transaction;
    expect(tx.source).toBe(owner.publicKey());
    expect(orders.get(ORDER)).toMatchObject({
      kind: "NFT_PLATFORM_FEE",
      currency: "XLM",
      status: "AWAITING_SIGNATURE",
      breakdown: expect.objectContaining({ feeBps: 300, treasury: newTreasury }) as unknown,
    });
    expect(chain.submit).not.toHaveBeenCalled();

    await expect(
      submitContractFee(ctx, admin, { orderId: ORDER, xdr: started.xdr }),
    ).resolves.toEqual({ orderId: ORDER, status: "DELIVERED" });
    expect(chain.submit).toHaveBeenCalledWith(started.xdr);
    expect(orders.get(ORDER)).toMatchObject({ status: "DELIVERED" });
  });

  it("refuses to start when the quote has a problem", async () => {
    await expect(startContractFee(setup().ctx, admin, { feeBps: 250, treasury })).rejects.toThrow(
      /already uses/,
    );
  });
});
