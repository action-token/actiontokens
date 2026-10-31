import {
  Account,
  Asset,
  FeeBumpTransaction,
  Keypair,
  Networks,
  scValToNative,
  type Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";

import { buildClassicPurchase, classicPurchaseOperations } from "../classic/purchase";
import { buildIssuerSetup, ISSUER_STARTING_XLM } from "../classic/issuer";
import { buildActivation, buildTopUp, buildXlmSwap } from "../classic/recharge";
import { buildIssueTokens, buildStorageGift, buildTransfer } from "../classic/transfer";
import { toStellarError } from "../errors";
import { buildBountyFund } from "../escrow/calls";
import {
  buildNftBuyEdition,
  buildNftBuyListed,
  buildNftKeepUnlockedAlive,
  buildNftSetPlatformFee,
  buildNftUnlockItemFor,
} from "../nft/calls";
import { buildPlatformPayment } from "../payments/platform-payment";
import { buildRoyaltyPayouts } from "../royalty/payout";
import { memoFor, networkFeeXlm, signersNeeded, wrapInFeeBump } from "../transaction";
import { memoText, verifyTransaction } from "../verify";

const network = { passphrase: Networks.TESTNET, baseFee: "100" };
const key = () => Keypair.random().publicKey();
const buyerKey = key();
const seller = key();
const treasury = key();
const issuer = key();
const storage = key();
const creator = key();
const account = (id = buyerKey) => new Account(id, "100");
const parse = (xdr: string) => TransactionBuilder.fromXDR(xdr, Networks.TESTNET) as Transaction;

const item = new Asset("NIGHTDRV", issuer);
const bandcoin = new Asset("BANDCOIN", key());
const orderId = "cm9x2a7f0000abcd1234efgh";

const purchase = () =>
  buildClassicPurchase({
    buyer: account(),
    network,
    orderId,
    item,
    openTrustline: true,
    payment: {
      asset: bandcoin,
      seller: { to: seller, amount: "18" },
      platformFee: { to: treasury, amount: "0.5" },
      royalty: { to: creator, amount: "2" },
    },
    delivery: { fromStock: { account: storage, amount: "1" }, mint: { issuer, amount: "1" } },
  });

describe("buildClassicPurchase", () => {
  it("has the buyer pay everything and receive the copies in one transaction", () => {
    const built = purchase();
    const tx = parse(built.xdr);

    expect(tx.source).toBe(buyerKey);
    expect(memoText(tx)).toBe(orderId);
    expect(tx.operations.map((op) => [op.type, op.source ?? "buyer"])).toEqual([
      ["changeTrust", "buyer"],
      ["payment", "buyer"],
      ["payment", "buyer"],
      ["payment", "buyer"],
      ["payment", storage],
      ["payment", issuer],
    ]);
    expect(built.serverSigners).toEqual([storage, issuer]);
    expect(built.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(
      classicPurchaseOperations({
        card: false,
        openTrustline: true,
        royalty: true,
        fromStock: true,
        mint: true,
      }),
    ).toBe(tx.operations.length);
  });

  it("card order: treasury tops up the reserve, pays the seller in BANDCOIN, and fee-bumps", () => {
    const built = buildClassicPurchase({
      buyer: account(),
      network,
      orderId,
      item,
      openTrustline: true,
      topUp: { from: treasury, amount: "0.5" },
      payment: { asset: bandcoin, from: treasury, seller: { to: seller, amount: "20" } },
      delivery: { mint: { issuer, amount: "2" } },
    });
    const tx = parse(built.xdr);
    expect(tx.source).toBe(buyerKey);
    expect(tx.operations.map((op) => [op.type, op.source ?? "buyer"])).toEqual([
      ["payment", treasury],
      ["changeTrust", "buyer"],
      ["payment", treasury],
      ["payment", issuer],
    ]);
    expect(tx.operations[0]).toMatchObject({ destination: buyerKey, amount: "0.5000000" });
    expect(built.serverSigners).toEqual([treasury, issuer]);

    const bumped = TransactionBuilder.fromXDR(
      wrapInFeeBump(built.xdr, treasury, network),
      Networks.TESTNET,
    );
    expect(bumped).toBeInstanceOf(FeeBumpTransaction);
    const fee = bumped as FeeBumpTransaction;
    expect(fee.feeSource).toBe(treasury);
    expect(Buffer.from(fee.innerTransaction.hash()).toString("hex")).toBe(built.hash);
    expect(Number(fee.fee)).toBe(
      100 *
        classicPurchaseOperations({
          card: true,
          openTrustline: true,
          royalty: false,
          fromStock: false,
          mint: true,
        }),
    );
  });

  it("skips zero payouts and refuses a purchase that delivers nothing", () => {
    const built = buildClassicPurchase({
      buyer: account(),
      network,
      orderId,
      item,
      openTrustline: false,
      payment: {
        asset: bandcoin,
        seller: { to: seller, amount: "5" },
        platformFee: { to: treasury, amount: "0" },
      },
      delivery: { mint: { issuer, amount: "1" } },
    });
    expect(parse(built.xdr).operations).toHaveLength(2);
    expect(() =>
      buildClassicPurchase({
        buyer: account(),
        network,
        orderId,
        item,
        openTrustline: false,
        payment: null,
        delivery: {},
      }),
    ).toThrow();
  });
});

describe("recharge builders", () => {
  const mother = key();

  it("top-up: the buyer is the source, the platform sends the BANDCOIN, trustline opened first if needed", () => {
    const built = buildTopUp({
      buyer: account(),
      network,
      orderId,
      asset: bandcoin,
      from: mother,
      amount: "4994.999",
      openTrustline: true,
    });
    const tx = parse(built.xdr);
    expect(tx.source).toBe(buyerKey);
    expect(tx.operations.map((op) => op.type)).toEqual(["changeTrust", "payment"]);
    expect(tx.operations[1]).toMatchObject({
      source: mother,
      destination: buyerKey,
      amount: "4994.9990000",
    });
    expect(memoText(tx)).toBe(orderId);
    expect(built.serverSigners).toEqual([mother]);
    expect(
      parse(
        buildTopUp({
          buyer: account(),
          network,
          orderId,
          asset: bandcoin,
          from: mother,
          amount: "1",
          openTrustline: false,
        }).xdr,
      ).operations,
    ).toHaveLength(1);
  });

  it("top-up: sends the trustline reserve in XLM first when the card pays for it", () => {
    const tx = parse(
      buildTopUp({
        buyer: account(),
        network,
        orderId,
        asset: bandcoin,
        from: mother,
        amount: "12",
        openTrustline: true,
        reserveXlm: "0.5",
      }).xdr,
    );
    expect(tx.operations.map((op) => op.type)).toEqual(["payment", "changeTrust", "payment"]);
    expect(tx.operations[0]).toMatchObject({
      source: mother,
      destination: buyerKey,
      asset: Asset.native(),
      amount: "0.5000000",
    });
  });

  it("swap: the buyer pays BANDCOIN to the platform and gets exactly the XLM, in one transaction", () => {
    const built = buildXlmSwap({
      buyer: account(),
      network,
      orderId,
      asset: bandcoin,
      platform: mother,
      pay: "51",
      xlm: "1",
    });
    const tx = parse(built.xdr);
    expect(tx.operations.map((op) => op.type)).toEqual(["payment", "payment"]);
    expect(tx.operations[0]).toMatchObject({ destination: mother, amount: "51.0000000" });
    expect(tx.operations[1]).toMatchObject({
      source: mother,
      destination: buyerKey,
      amount: "1.0000000",
    });
    expect(built.serverSigners).toEqual([mother]);
  });

  it("activation: the platform creates the account in one transaction the fan never signs", () => {
    const built = buildActivation({
      platform: new Account(mother, "7"),
      network,
      orderId,
      destination: buyerKey,
      startingBalance: "19.89998",
    });
    const tx = parse(built.xdr);
    expect(tx.source).toBe(mother);
    expect(tx.operations).toHaveLength(1);
    expect(tx.operations[0]).toMatchObject({
      type: "createAccount",
      destination: buyerKey,
      startingBalance: "19.8999800",
    });
    expect(memoText(tx)).toBe(orderId);
    expect(built.serverSigners).toEqual([mother]);
    expect(() =>
      buildActivation({
        platform: new Account(mother, "7"),
        network,
        orderId,
        destination: buyerKey,
        startingBalance: "0",
      }),
    ).toThrow(RangeError);
  });

  it("refuses to send nothing", () => {
    expect(() =>
      buildTopUp({
        buyer: account(),
        network,
        orderId,
        asset: bandcoin,
        from: mother,
        amount: "0",
        openTrustline: false,
      }),
    ).toThrow(RangeError);
    expect(() =>
      buildXlmSwap({
        buyer: account(),
        network,
        orderId,
        asset: bandcoin,
        platform: mother,
        pay: "0",
        xlm: "1",
      }),
    ).toThrow(RangeError);
  });
});

describe("verifyTransaction", () => {
  const expectation = {
    source: buyerKey,
    memo: orderId,
    payments: [
      { to: seller, asset: bandcoin, amount: "18" },
      { to: treasury, asset: bandcoin, amount: "0.5" },
      { from: issuer, to: buyerKey, asset: item, amount: "1" },
    ],
  };

  it("accepts the transaction the order was built with", () => {
    expect(verifyTransaction(purchase().xdr, Networks.TESTNET, expectation)).toEqual({
      ok: true,
      mismatches: [],
    });
  });

  it("rejects a transaction for another order, buyer or amount", () => {
    const other = buildPlatformPayment({
      payer: account(key()),
      network,
      orderId: "another-order",
      to: seller,
      asset: bandcoin,
      amount: "1",
    });
    const result = verifyTransaction(other.xdr, Networks.TESTNET, expectation);
    expect(result.ok).toBe(false);
    expect(result.mismatches).toHaveLength(5);
  });
});

describe("other builders", () => {
  it("opens the artist's one issuer, paid by the artist", () => {
    const artist = key();
    const built = buildIssuerSetup({
      artist: account(artist),
      network,
      issuer,
      homeDomain: "bandcoin.io",
    });
    const tx = parse(built.xdr);
    expect(tx.source).toBe(artist);
    expect(tx.operations[0]).toMatchObject({
      type: "createAccount",
      destination: issuer,
      startingBalance: "1.5000000",
    });
    expect(ISSUER_STARTING_XLM).toBe("1.5");
    expect(built.serverSigners).toEqual([issuer]);
  });

  it("gifts as a claimable balance when the receiver can't hold the asset yet", () => {
    const direct = parse(
      buildTransfer({
        sender: account(),
        network,
        to: seller,
        asset: item,
        amount: "1",
        receiverTrusts: true,
      }).xdr,
    );
    const claimable = parse(
      buildTransfer({
        sender: account(),
        network,
        to: seller,
        asset: item,
        amount: "1",
        receiverTrusts: false,
      }).xdr,
    );
    expect(direct.operations[0]?.type).toBe("payment");
    expect(claimable.operations[0]?.type).toBe("createClaimableBalance");
  });

  it("issues tokens from the issuer to the fan while the artist's wallet is the source and pays the fee", () => {
    const built = buildIssueTokens({
      sender: account(creator),
      network,
      issuer,
      to: seller,
      asset: item,
      amount: "25",
      memo: orderId,
    });
    const tx = parse(built.xdr);
    expect(tx.source).toBe(creator);
    expect(tx.operations).toHaveLength(1);
    expect(tx.operations[0]).toMatchObject({
      type: "payment",
      source: issuer,
      destination: seller,
      amount: "25.0000000",
    });
    expect(built.serverSigners).toEqual([issuer]);
    expect(memoText(tx)).toBe(orderId);
  });

  it("splits royalty payouts into batches of 100 with consecutive sequence numbers", () => {
    const lines = Array.from({ length: 250 }, () => ({ to: key(), amount: "1" }));
    const batches = buildRoyaltyPayouts({
      payer: account(creator),
      network,
      asset: bandcoin,
      lines,
      payoutId: "payout-1",
    });
    const txs = batches.map((batch) => parse(batch.xdr));
    expect(txs.map((tx) => tx.operations.length)).toEqual([100, 100, 50]);
    expect(txs.map((tx) => tx.sequence)).toEqual(["101", "102", "103"]);
  });

  it("encodes nft_oz buys with the buyer as source and the treasury as co-signer", () => {
    const contract = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
    const edition = buildNftBuyEdition({
      source: account(),
      network,
      contract,
      editionRef: "item-1",
      purchaseRef: orderId,
      paymentToken: contract,
      quantity: 3,
      inclusionFee: 0n,
      networkFee: 100n,
      treasury,
    });
    const tx = parse(edition.xdr);
    expect(tx.source).toBe(buyerKey);
    expect(tx.operations[0]?.type).toBe("invokeHostFunction");
    expect(edition.serverSigners).toEqual([treasury]);
    expect(() => buildNftBuyEdition({ ...baseNft(contract), quantity: 21 })).toThrow();

    const batch = buildNftBuyListed({ ...baseNft(contract), tokenIds: [4, 5] });
    expect(parse(batch.xdr).operations).toHaveLength(1);
  });

  it("encodes set_platform_fee from the owner's wallet, within the contract's 10% cap", () => {
    const contract = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
    const owner = key();
    const built = buildNftSetPlatformFee({
      source: account(owner),
      network,
      contract,
      feeBps: 250,
      treasury,
    });
    const tx = parse(built.xdr);
    expect(tx.source).toBe(owner);
    const op = tx.operations[0];
    if (op?.type !== "invokeHostFunction" || op.func.type !== "hostFunctionTypeInvokeContract")
      throw new Error("not a contract call");
    const call = op.func.invokeContract;
    expect(String(call.functionName)).toBe("set_platform_fee");
    expect(call.args.map((value) => scValToNative(value) as unknown)).toEqual([250, treasury]);
    expect(built.serverSigners).toEqual([]);
    const base = { source: account(owner), network, contract, treasury };
    expect(() => buildNftSetPlatformFee({ ...base, feeBps: 1001 })).toThrow(/0 to 10%/);
    expect(() => buildNftSetPlatformFee({ ...base, feeBps: 2.5 })).toThrow();
  });

  it("encodes unlock_item_for, sent and signed by the unlock authority", () => {
    const contract = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
    const built = buildNftUnlockItemFor({
      source: account(treasury),
      network,
      contract,
      caller: treasury,
      tokenId: 40,
      mediaIndex: 1,
    });
    const op = parse(built.xdr).operations[0];
    if (op?.type !== "invokeHostFunction" || op.func.type !== "hostFunctionTypeInvokeContract")
      throw new Error("not a contract call");
    expect(String(op.func.invokeContract.functionName)).toBe("unlock_item_for");
    expect(op.func.invokeContract.args.map((value) => scValToNative(value) as unknown)).toEqual([
      treasury,
      40,
      1,
    ]);
    expect(built.serverSigners).toEqual([treasury]);
  });

  it("encodes keep_unlocked_alive as (token, piece) pairs, 1 to 80 at a time", () => {
    const contract = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
    const base = { source: account(treasury), network, contract };
    const op = parse(
      buildNftKeepUnlockedAlive({
        ...base,
        unlocked: [
          { tokenId: 40, mediaIndex: 1 },
          { tokenId: 41, mediaIndex: 0 },
        ],
      }).xdr,
    ).operations[0];
    if (op?.type !== "invokeHostFunction" || op.func.type !== "hostFunctionTypeInvokeContract")
      throw new Error("not a contract call");
    expect(scValToNative(op.func.invokeContract.args[0]!)).toEqual([
      [40, 1],
      [41, 0],
    ]);
    expect(() => buildNftKeepUnlockedAlive({ ...base, unlocked: [] })).toThrow();
  });

  it("encodes the bounty escrow deposit", () => {
    const built = buildBountyFund({
      source: account(creator),
      network,
      contract: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
      bountyId: "bounty-1",
      creator,
      token: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
      amount: 500_000_000n,
      maxWinners: 3,
    });
    expect(parse(built.xdr).operations[0]?.type).toBe("invokeHostFunction");
  });

  it("refuses a memo that doesn't fit and prices the network fee per operation", () => {
    expect(() => memoFor("x".repeat(29))).toThrow();
    expect(networkFeeXlm(6, "100")).toBe("0.0000600");
  });
});

const baseNft = (contract: string) => ({
  source: account(),
  network,
  contract,
  editionRef: "item-1",
  purchaseRef: orderId,
  paymentToken: contract,
  quantity: 1,
  inclusionFee: 0n,
  networkFee: 0n,
  treasury,
});

describe("signersNeeded", () => {
  it("is the source and every operation's own source, nobody else", () => {
    const issuerKey = key();
    const opening = buildIssuerSetup({ artist: account(creator), network, issuer: issuerKey });
    expect([...signersNeeded(opening.xdr, Networks.TESTNET)]).toEqual([creator]);
    const withDomain = buildIssuerSetup({
      artist: account(creator),
      network,
      issuer: issuerKey,
      homeDomain: "bandcoin.io",
    });
    expect([...signersNeeded(withDomain.xdr, Networks.TESTNET)]).toEqual([creator, issuerKey]);
  });

  it("is the fee payer for a fee bump", () => {
    const inner = buildIssuerSetup({ artist: account(creator), network, issuer: key() });
    const bumped = wrapInFeeBump(inner.xdr, treasury, network);
    expect([...signersNeeded(bumped, Networks.TESTNET)]).toEqual([treasury]);
  });
});

describe("toStellarError", () => {
  const horizonFailure = (operations: string[], transaction = "tx_failed") => ({
    response: { data: { extras: { result_codes: { transaction, operations } } } },
  });

  it("turns Stellar result codes into plain messages", () => {
    expect(toStellarError(horizonFailure(["op_success", "op_underfunded"])).code).toBe(
      "STELLAR_INSUFFICIENT_BALANCE",
    );
    expect(toStellarError(horizonFailure(["op_no_trust"])).code).toBe("STELLAR_TRUSTLINE_MISSING");
    expect(toStellarError(horizonFailure([], "tx_too_late")).code).toBe("STELLAR_QUOTE_EXPIRED");
    expect(toStellarError(horizonFailure(["op_weird"])).code).toBe("STELLAR_TX_REJECTED");
    expect(toStellarError(new Error("socket hang up")).code).toBe("STELLAR_TX_SUBMIT_FAILED");
  });

  it("explains a busy network and a wrong signer, and names any other code", () => {
    expect(toStellarError(horizonFailure([], "tx_insufficient_fee")).message).toMatch(/busy/);
    expect(toStellarError(horizonFailure([], "tx_bad_auth")).message).toMatch(/right wallet/);
    expect(toStellarError(horizonFailure(["op_weird"])).message).toBe(
      "The Stellar network rejected that transaction (tx_failed, op_weird).",
    );
  });
});

describe("buildStorageGift", () => {
  const sender = Keypair.random().publicKey();
  const storage = Keypair.random().publicKey();
  const fan = Keypair.random().publicKey();
  const asset = new Asset("LUNA", Keypair.random().publicKey());
  const net = { passphrase: Networks.TESTNET, baseFee: "100" };
  const ops = (xdr: string) => TransactionBuilder.fromXDR(xdr, Networks.TESTNET).operations;

  it("pays a fan who trusts the token straight from storage", () => {
    const built = buildStorageGift({
      sender: new Account(sender, "1"),
      network: net,
      storage,
      to: fan,
      asset,
      amount: "25",
      claimable: false,
    });
    expect(ops(built.xdr)).toMatchObject([
      { type: "payment", source: storage, destination: fan, amount: "25.0000000" },
    ]);
    expect(built.serverSigners).toEqual([storage]);
  });

  it("otherwise funds the 1 XLM reserve and leaves a claimable balance storage can take back", () => {
    const built = buildStorageGift({
      sender: new Account(sender, "1"),
      network: net,
      storage,
      to: fan,
      asset,
      amount: "25",
      claimable: true,
    });
    const [reserve, balance] = ops(built.xdr) as unknown as [
      { type: string; destination: string; amount: string },
      { type: string; source: string; claimants: { destination: string }[] },
    ];
    expect(reserve).toMatchObject({ type: "payment", destination: storage, amount: "1.0000000" });
    expect(balance).toMatchObject({ type: "createClaimableBalance", source: storage });
    expect(balance.claimants.map((claimant) => claimant.destination)).toEqual([fan, storage]);
  });
});
