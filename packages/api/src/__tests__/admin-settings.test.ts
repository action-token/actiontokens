import {
  Account,
  Keypair,
  Networks,
  type Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import type { Db } from "@bandcoin/db";

import { changeContractFee, readContractFee } from "../services/admin/contract-fee";
import { getSettings, updateSettings } from "../services/admin/settings";
import type { ChainGateway } from "../services/chain-gateway";

const owner = Keypair.random();
const treasury = Keypair.random().publicKey();
const newTreasury = Keypair.random().publicKey();
const contract = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const network = { passphrase: Networks.TESTNET, baseFee: "100" };

type Row = Record<string, unknown>;

function setup(
  opts: {
    row?: Row | null;
    contract?: string | null;
    onChain?: { feeBps: number; treasury: string | null; owner: string | null } | Error;
  } = {},
) {
  const db = {
    appSetting: {
      findUnique: vi.fn().mockResolvedValue(opts.row ?? null),
      upsert: vi.fn().mockResolvedValue({}),
    },
    $transaction: (run: (tx: unknown) => unknown) => run(db),
  };
  const account = Object.assign(new Account(treasury, "5"), {
    subentry_count: 0,
    balances: [{ asset_type: "native", balance: "10", selling_liabilities: "0" }],
  });
  const onChain = opts.onChain ?? { feeBps: 250, treasury, owner: treasury };
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
    signWithServerKeys: vi.fn((xdr: string) => Promise.resolve(`signed:${xdr}`)),
    submit: vi.fn().mockResolvedValue({ hash: "txhash" }),
  };
  const activity = { set: vi.fn(), facts: () => ({}) };
  return {
    ctx: { db: db as unknown as Db, chain: chain as unknown as ChainGateway, activity },
    db,
    chain,
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
      canChange: true,
    });
    await expect(readContractFee(setup({ contract: null }).ctx)).resolves.toMatchObject({
      configured: false,
      onChain: null,
    });
    await expect(
      readContractFee(setup({ onChain: new Error("rpc down") }).ctx),
    ).resolves.toMatchObject({
      onChain: null,
      error: "Couldn't read the contract.",
    });
  });

  it("builds set_platform_fee from the treasury, signs it as the treasury and sends it", async () => {
    const { ctx, chain, activity } = setup();
    const result = await changeContractFee(ctx, { feeBps: 300, treasury: newTreasury });
    expect(result).toEqual({
      txHash: "txhash",
      before: { feeBps: 250, treasury },
      after: { feeBps: 300, treasury: newTreasury },
    });
    const built = chain.prepareContractCall.mock.calls[0]![0];
    const tx = TransactionBuilder.fromXDR(built, Networks.TESTNET) as Transaction;
    expect(tx.source).toBe(treasury);
    expect(chain.signWithServerKeys).toHaveBeenCalledWith(built, [treasury]);
    expect(chain.submit).toHaveBeenCalledWith(`signed:${built}`);
    expect(activity.set).toHaveBeenCalledWith({ txHash: "txhash" });
  });

  it("refuses when nothing changes, or when the treasury isn't the owner", async () => {
    await expect(changeContractFee(setup().ctx, { feeBps: 250, treasury })).rejects.toThrow(
      /already uses/,
    );
    const other = setup({ onChain: { feeBps: 250, treasury, owner: owner.publicKey() } });
    await expect(changeContractFee(other.ctx, { feeBps: 300, treasury })).rejects.toThrow(
      /owner isn't the platform treasury/,
    );
    expect(other.chain.submit).not.toHaveBeenCalled();
  });
});
