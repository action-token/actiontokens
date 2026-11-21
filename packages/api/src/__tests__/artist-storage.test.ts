import { Keypair, Networks, type Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { beforeAll, describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";
import { AppError } from "@actiontokens/errors";

import type { ChainGateway } from "../services/chain-gateway";
import { openStorage, type StorageArtist } from "../services/artist/storage-account";

const network = { passphrase: Networks.TESTNET, baseFee: "100" };
const mother = Keypair.random().publicKey();
const issuerKey = Keypair.random().publicKey();
const fanToken = { code: "FYRON", issuer: issuerKey };
const approved: StorageArtist = {
  id: "a1",
  userId: "me",
  status: "APPROVED",
  storageAccountId: null,
  fanTokenItemId: "fan",
  issuerAccountId: "issuer1",
};

beforeAll(() => {
  process.env.CHAIN_ACCOUNT_KEY = "ab".repeat(32);
});

type Row = Record<string, unknown>;

function setup(opts: { motherXlm?: string; onChain?: string[]; supply?: string } = {}) {
  const chainAccounts = new Map<string, Row>();
  const artistUpdates: Row[] = [];
  const db = {
    organization: {
      update: vi.fn(({ data }: { data: Row }) => {
        artistUpdates.push(data);
        return Promise.resolve({});
      }),
    },
    chainAccount: {
      findFirst: vi.fn(({ where }: { where: { ownerId: string; kind: string } }) =>
        Promise.resolve(
          [...chainAccounts.values()].find(
            (row) => row.ownerId === where.ownerId && row.kind === where.kind,
          ) ?? null,
        ),
      ),
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(
          where.id === "issuer1" ? { publicKey: issuerKey, activatedAt: new Date() } : null,
        ),
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
    classicToken: {
      findUnique: vi.fn(({ where }: { where: { itemId: string } }) =>
        Promise.resolve(where.itemId === "fan" ? fanToken : null),
      ),
    },
    appSetting: {
      findUnique: vi.fn().mockResolvedValue({
        fanTokenStartSupply: { toString: () => opts.supply ?? "1000000" },
      }),
    },
    $transaction: (run: (tx: unknown) => unknown) => run(db),
  };
  const motherAccount = {
    accountId: () => mother,
    sequenceNumber: () => "5",
    subentry_count: 0,
    balances: [
      { asset_type: "native", balance: opts.motherXlm ?? "100", selling_liabilities: "0" },
    ],
  };
  const actionToken = { code: "ACTION", issuer: Keypair.random().publicKey() };
  const usdc = { code: "USDC", issuer: Keypair.random().publicKey() };
  const chain = {
    config: { name: "testnet", network, mother, assets: { actionToken, usdc } },
    loadAccount: vi.fn((id: string) =>
      Promise.resolve(id === mother ? motherAccount : opts.onChain?.includes(id) ? {} : null),
    ),
    signWithServerKeys: vi.fn((xdr: string) => Promise.resolve(xdr)),
    submit: vi.fn((_xdr: string) => Promise.resolve({ hash: "txhash" })),
  };
  const activity = { set: vi.fn(), facts: () => ({}) };
  const ctx = { db: db as unknown as Db, chain: chain as unknown as ChainGateway, activity };
  return { ctx, chain, chainAccounts, artistUpdates, activity };
}

const parse = (xdr: string) => TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;

describe("opening the storage account (the platform pays)", () => {
  it("creates it from the mother account, trusts three tokens and issues the starting supply", async () => {
    const { ctx, chain, chainAccounts, artistUpdates, activity } = setup();
    const opened = await openStorage(ctx, approved);
    expect(opened.supply).toBe("1000000");
    const storage = [...chainAccounts.values()][0]!;
    expect(storage).toMatchObject({ kind: "STORAGE", ownerId: "me" });

    const xdr = chain.submit.mock.calls[0]![0] as string;
    const tx = parse(xdr);
    expect(tx.source).toBe(mother);
    expect(tx.operations).toMatchObject([
      { type: "createAccount", destination: storage.publicKey, startingBalance: "3.0000000" },
      { type: "changeTrust", source: storage.publicKey },
      { type: "changeTrust", source: storage.publicKey },
      { type: "changeTrust", source: storage.publicKey },
      { type: "payment", source: issuerKey, destination: storage.publicKey },
    ]);
    expect(chain.signWithServerKeys).toHaveBeenCalledWith(expect.any(String), [
      mother,
      storage.publicKey,
      issuerKey,
    ]);
    expect(artistUpdates).toEqual([{ storageAccountId: storage.id }]);
    expect(storage.activatedAt).toBeInstanceOf(Date);
    expect(activity.set).toHaveBeenCalledWith(
      expect.objectContaining({ amount: "3", currency: "XLM", txHash: "txhash" }),
    );
  });

  it("only trusts a fan token made elsewhere, and issues nothing", async () => {
    const { ctx, chain } = setup();
    const outside = { ...approved, issuerAccountId: null };
    await expect(openStorage(ctx, outside)).resolves.toMatchObject({ supply: null });
    const ops = parse(chain.submit.mock.calls[0]![0] as string).operations;
    expect(ops.map((op) => op.type)).not.toContain("payment");
  });

  it("refuses when already open, not approved, or the platform is short of XLM", async () => {
    await expect(openStorage(setup().ctx, { ...approved, storageAccountId: "s1" })).rejects.toThrow(
      /already open/,
    );
    await expect(openStorage(setup().ctx, { ...approved, status: "PENDING" })).rejects.toThrow(
      /approved/,
    );
    const short = setup({ motherXlm: "2" });
    await expect(openStorage(short.ctx, approved)).rejects.toThrow(/short of XLM/);
    expect(short.chain.submit).not.toHaveBeenCalled();
  });

  it("never pays twice: an account that already landed is only linked", async () => {
    const first = setup();
    first.chain.submit.mockRejectedValueOnce(new AppError("STELLAR_TX_SUBMIT_FAILED"));
    await expect(openStorage(first.ctx, approved)).rejects.toThrow();
    expect(first.artistUpdates).toEqual([]);

    // The answer was lost but the account is on the network now.
    const key = [...first.chainAccounts.values()][0]!.publicKey as string;
    first.chain.loadAccount.mockImplementation((id: string) =>
      Promise.resolve(id === key ? ({} as never) : null),
    );
    await expect(openStorage(first.ctx, approved)).resolves.toMatchObject({ publicKey: key });
    expect(first.chain.submit).toHaveBeenCalledTimes(1);
    expect(first.artistUpdates).toHaveLength(1);
  });
});
