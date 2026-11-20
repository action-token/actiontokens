import {
  Account,
  Asset,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import type { Db } from "@actiontokens/db";

import { createContext, type SessionUser } from "../context";
import { arRouter } from "../root-ar";
import type { ChainGateway } from "../services/chain-gateway";
import { createCallerFactory } from "../trpc";

const fanKey = Keypair.random().publicKey();
const issuer = Keypair.random().publicKey();
const storage = Keypair.random().publicKey();
const network = { passphrase: Networks.TESTNET, baseFee: "100" };
const token = { code: "LUNA", issuer };
const asset = new Asset(token.code, token.issuer);
const CLAIM = "cmvclaim0000000000000001";

const me: SessionUser = { id: "me", role: "FAN", walletAddress: fanKey, walletType: "freighter" };
const custodial: SessionUser = { ...me, walletType: "emailPass", email: "fan@example.com" };

/** A Horizon account with XLM and, optionally, the reward token. */
function horizonAccount(id: string, { xlm = "10", luna }: { xlm?: string; luna?: string } = {}) {
  const account = new Account(id, "100");
  return Object.assign(account, {
    subentry_count: luna === undefined ? 0 : 1,
    balances: [
      { asset_type: "native", balance: xlm, selling_liabilities: "0" },
      ...(luna === undefined
        ? []
        : [
            {
              asset_type: "credit_alphanum4",
              asset_code: token.code,
              asset_issuer: token.issuer,
              balance: luna,
            },
          ]),
    ],
  });
}

function claimRow(
  over: {
    tokenClaimedAt?: Date | null;
    rewardsFanToken?: boolean;
    external?: boolean;
    /** Fan tokens per collect */
    amount?: string;
    /** An artist who never opened storage: the fan token is minted, as before */
    noStorage?: boolean;
  } = {},
) {
  const fanToken = {
    id: "fan-token",
    title: "LUNA",
    coverUrl: "https://cdn/luna.png",
    chainType: "CLASSIC_TOKEN",
    classicToken: {
      ...token,
      isExternal: over.external ?? false,
      issuerAccount: { publicKey: issuer },
    },
  };
  return {
    id: CLAIM,
    userId: "me",
    tokenClaimedAt: over.tokenClaimedAt ?? null,
    spot: {
      pin: {
        id: "pin1",
        title: "Launch",
        rewardsFanToken: over.rewardsFanToken ?? true,
        rewardAmount: over.amount ?? "1",
        rewardItem: null,
        artist: {
          name: "Luna Vale",
          issuerAccount: { publicKey: issuer, activatedAt: new Date() },
          storageAccount: over.noStorage ? null : { publicKey: storage },
          fanTokenItem: fanToken,
        },
      },
    },
  };
}

function setup(
  opts: {
    fan?: ReturnType<typeof horizonAccount> | null;
    stock?: string;
    row?: ReturnType<typeof claimRow>;
    user?: SessionUser;
  } = {},
) {
  const fan = opts.fan === undefined ? horizonAccount(fanKey) : opts.fan;
  const db = {
    pinClaim: {
      findFirst: vi.fn().mockResolvedValue(opts.row ?? claimRow()),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      update: vi.fn().mockResolvedValue({}),
    },
    ownership: { upsert: vi.fn().mockResolvedValue({}) },
    activityLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const chain = {
    config: { network },
    loadAccount: vi.fn((id: string) =>
      Promise.resolve(
        id === fanKey
          ? fan
          : id === storage
            ? horizonAccount(storage, { luna: opts.stock ?? "0" })
            : null,
      ),
    ),
    signForCustodialUser: vi.fn((xdr: string) => Promise.resolve(`${xdr}`)),
    signWithServerKeys: vi.fn((xdr: string) => Promise.resolve(xdr)),
    submit: vi.fn().mockResolvedValue({ hash: "abc123" }),
  };
  const caller = createCallerFactory(arRouter)(
    createContext({
      db: db as unknown as Db,
      chain: chain as unknown as ChainGateway,
      app: "ar",
      session: { user: opts.user ?? me },
    }),
  );
  return { db, chain, caller };
}

/** A hand-built transaction, for the forgery checks. */
function forged(ops: (b: TransactionBuilder) => void, memo = CLAIM) {
  const builder = new TransactionBuilder(new Account(fanKey, "100"), {
    fee: "100",
    networkPassphrase: network.passphrase,
  });
  ops(builder);
  return builder.addMemo(Memo.text(memo)).setTimeout(60).build().toXDR();
}

describe("claim.quote", () => {
  it("charges only the network fee and the trustline reserve, sent from stock", async () => {
    const { caller } = setup({ stock: "5" });
    const quote = await caller.claim.quote({ claimId: CLAIM });
    expect(quote).toMatchObject({
      ok: true,
      currency: "XLM",
      source: "stock",
      total: "0.5000200",
      problems: [],
    });
    expect(quote.lines.map((line) => line.key)).toEqual(["network", "reserve"]);
  });

  it("mints from the artist's issuer when there's no storage, and skips the reserve for a holder", async () => {
    const { caller } = setup({
      fan: horizonAccount(fanKey, { luna: "2" }),
      row: claimRow({ noStorage: true }),
    });
    const quote = await caller.claim.quote({ claimId: CLAIM });
    expect(quote).toMatchObject({ ok: true, source: "mint", total: "0.0000100" });
    expect(quote.lines.map((line) => line.key)).toEqual(["network"]);
  });

  it("reports what stands in the way", async () => {
    expect(
      (await setup({ fan: null, stock: "5" }).caller.claim.quote({ claimId: CLAIM })).problems.map(
        (p) => p.code,
      ),
    ).toEqual(["ACCOUNT_INACTIVE"]);
    expect(
      (
        await setup({ fan: horizonAccount(fanKey, { xlm: "1.2" }), stock: "5" }).caller.claim.quote(
          {
            claimId: CLAIM,
          },
        )
      ).problems.map((p) => p.code),
    ).toEqual(["NOT_ENOUGH_XLM"]);
    expect(
      (
        await setup({ row: claimRow({ external: true, noStorage: true }) }).caller.claim.quote({
          claimId: CLAIM,
        })
      ).problems.map((p) => p.code),
    ).toEqual(["NOT_STOCKED"]);
    expect(
      (
        await setup({ row: claimRow({ tokenClaimedAt: new Date() }) }).caller.claim.quote({
          claimId: CLAIM,
        })
      ).problems.map((p) => p.code),
    ).toContain("ALREADY_CLAIMED");
  });
});

describe("claim.prepare and submit", () => {
  it("builds the claim with the fan as source and the claim id as memo", async () => {
    const { caller } = setup({ stock: "5" });
    const { xdr, signer } = await caller.claim.prepare({ claimId: CLAIM });
    expect(signer).toBe("wallet");
    const tx = TransactionBuilder.fromXDR(xdr, network.passphrase);
    expect("source" in tx && tx.source).toBe(fanKey);
    expect(tx.operations.map((op) => op.type)).toEqual(["changeTrust", "payment"]);
  });

  it("refuses to prepare when a problem stands in the way", async () => {
    await expect(
      setup({ fan: horizonAccount(fanKey, { xlm: "1.2" }), stock: "5" }).caller.claim.prepare({
        claimId: CLAIM,
      }),
    ).rejects.toMatchObject({
      message: "You need 0.5000200 XLM free in your wallet to claim this.",
    });
  });

  it("co-signs with the storage key, submits, and records the ownership once", async () => {
    const { caller, chain, db } = setup({ stock: "5" });
    const { xdr } = await caller.claim.prepare({ claimId: CLAIM });
    await expect(caller.claim.submit({ claimId: CLAIM, xdr })).resolves.toEqual({
      txHash: "abc123",
    });
    expect(chain.signWithServerKeys).toHaveBeenCalledWith(xdr, [storage]);
    expect(chain.signForCustodialUser).not.toHaveBeenCalled();
    expect(db.pinClaim.updateMany).toHaveBeenCalledWith({
      where: { id: CLAIM, tokenClaimedAt: null },
      data: { tokenClaimedAt: expect.any(Date) as Date },
    });
    expect(db.ownership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { userId: "me", itemId: "fan-token", quantity: "1.0000000", source: "PIN_CLAIM" },
      }),
    );
  });

  it("signs for custodial accounts", async () => {
    const { caller, chain } = setup({ user: custodial, row: claimRow({ noStorage: true }) });
    const { xdr, signer } = await caller.claim.prepare({ claimId: CLAIM });
    expect(signer).toBe("custodial");
    await caller.claim.submit({ claimId: CLAIM, xdr });
    expect(chain.signForCustodialUser).toHaveBeenCalledWith(xdr, "fan@example.com");
    expect(chain.signWithServerKeys).toHaveBeenCalledWith(xdr, [issuer]);
  });

  it("rejects a transaction that sends more, sends elsewhere, or does anything else", async () => {
    const stranger = Keypair.random().publicKey();
    const cases = [
      forged((b) =>
        b.addOperation(
          Operation.payment({ source: issuer, destination: fanKey, asset, amount: "50" }),
        ),
      ),
      forged((b) =>
        b.addOperation(
          Operation.payment({ source: issuer, destination: stranger, asset, amount: "1" }),
        ),
      ),
      forged((b) =>
        b.addOperation(
          Operation.payment({ source: stranger, destination: fanKey, asset, amount: "1" }),
        ),
      ),
      forged((b) =>
        b
          .addOperation(
            Operation.payment({ source: issuer, destination: fanKey, asset, amount: "1" }),
          )
          .addOperation(
            Operation.payment({
              source: issuer,
              destination: stranger,
              asset: Asset.native(),
              amount: "100",
            }),
          ),
      ),
      forged(
        (b) =>
          b.addOperation(
            Operation.payment({ source: issuer, destination: fanKey, asset, amount: "1" }),
          ),
        "other-claim",
      ),
    ];
    for (const xdr of cases) {
      const { caller, chain } = setup();
      await expect(caller.claim.submit({ claimId: CLAIM, xdr })).rejects.toMatchObject({
        message: "That transaction isn't this reward claim.",
      });
      expect(chain.signWithServerKeys).not.toHaveBeenCalled();
    }
  });

  it("won't deliver twice, and frees the claim again when Stellar rejects it", async () => {
    const twice = setup({ stock: "5" });
    const { xdr } = await twice.caller.claim.prepare({ claimId: CLAIM });
    twice.db.pinClaim.updateMany.mockResolvedValue({ count: 0 });
    await expect(twice.caller.claim.submit({ claimId: CLAIM, xdr })).rejects.toMatchObject({
      message: "This reward is already in your wallet.",
    });
    expect(twice.chain.submit).not.toHaveBeenCalled();

    const rejected = setup({ stock: "5" });
    rejected.chain.submit.mockRejectedValue(new Error("tx_bad_seq"));
    await expect(rejected.caller.claim.submit({ claimId: CLAIM, xdr })).rejects.toThrow();
    expect(rejected.db.pinClaim.update).toHaveBeenCalledWith({
      where: { id: CLAIM },
      data: { tokenClaimedAt: null },
    });
    expect(rejected.db.ownership.upsert).not.toHaveBeenCalled();
  });
});

describe("fan-token pin rewards from storage", () => {
  it("sends the pin's amount from storage and records it", async () => {
    const { caller, chain, db } = setup({ stock: "25", row: claimRow({ amount: "10" }) });
    const quote = await caller.claim.quote({ claimId: CLAIM });
    expect(quote).toMatchObject({ ok: true, source: "stock" });
    const { xdr } = await caller.claim.prepare({ claimId: CLAIM });
    const tx = TransactionBuilder.fromXDR(xdr, network.passphrase);
    const payment = tx.operations.find((op) => op.type === "payment");
    expect(payment).toMatchObject({ source: storage, destination: fanKey, amount: "10.0000000" });
    await caller.claim.submit({ claimId: CLAIM, xdr });
    expect(chain.signWithServerKeys).toHaveBeenCalledWith(xdr, [storage]);
    expect(db.ownership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ quantity: expect.stringMatching(/^10(\.0+)?$/) }),
      }),
    );
  });

  it("stops with a plain message when storage runs short, and never mints", async () => {
    const { caller } = setup({ stock: "5", row: claimRow({ amount: "10" }) });
    const quote = await caller.claim.quote({ claimId: CLAIM });
    expect(quote.ok).toBe(false);
    expect(quote.problems).toEqual([
      {
        code: "STORAGE_EMPTY",
        message:
          "Luna Vale has run out of LUNA for pin rewards. Your collect is safe; try again later.",
      },
    ]);
    await expect(caller.claim.prepare({ claimId: CLAIM })).rejects.toMatchObject({
      message:
        "Luna Vale has run out of LUNA for pin rewards. Your collect is safe; try again later.",
    });
  });

  it("rejects a claim that delivers less than the reward, or mints it", async () => {
    const cases = [
      forged((b) =>
        b.addOperation(
          Operation.payment({ source: storage, destination: fanKey, asset, amount: "1" }),
        ),
      ),
      forged((b) =>
        b.addOperation(
          Operation.payment({ source: issuer, destination: fanKey, asset, amount: "10" }),
        ),
      ),
    ];
    for (const xdr of cases) {
      const { caller, chain } = setup({ stock: "25", row: claimRow({ amount: "10" }) });
      await expect(caller.claim.submit({ claimId: CLAIM, xdr })).rejects.toMatchObject({
        message: "That transaction isn't this reward claim.",
      });
      expect(chain.signWithServerKeys).not.toHaveBeenCalled();
    }
  });
});
