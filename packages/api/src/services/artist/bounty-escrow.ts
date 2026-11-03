import {
  Account,
  Address,
  Asset,
  scValToNative,
  type Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import { notify, notifyFollowers } from "../notifications/send";

import {
  buildAssetContractSetup,
  buildBountyFund,
  buildBountySelectWinner,
  toAmount,
  toStroops,
} from "@bandcoin/chain";
import { availableOf, fundsOf, otherAssetsOf } from "@bandcoin/chain/server";
import { AppError, ErrorCodes } from "@bandcoin/errors";

import { type Context, isCustodial, type SessionUser } from "../../context";
import { needsTokenSetup, prizeToken } from "../bounty/prize";
import { ownBounty } from "./bounties";
import { invalid } from "./items";

/**
 * The money side of a bounty, on the deployed `bounty_escrow` contract exactly
 * as the old Bandcoin called it:
 *
 *   fund    create_bounty(bountyId, creator, token, amount, maxWinners)
 *   winner  select_winner(caller, bountyId, winner, amount)
 *
 * The artist pays the prize and the network fee. The "creator" is either their
 * own wallet or, when they chose to fund from storage, their storage account,
 * which the platform signs for. Each step is prepare (build + simulate, the
 * wallet signs it) then submit (check it is the same single call, sign for
 * custodial users or the storage account, send it).
 *
 * A prize in another classic asset (say the artist's fan token) goes through
 * that asset's Stellar Asset Contract. If nobody has deployed it yet, the
 * artist does that first in its own transaction (`createStellarAssetContract`,
 * a standard network operation, once per asset; no contract of ours changes).
 */
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;
type ArtistRef = { id: string; storageAccountId: string | null };

type Expected = { source: string; contract: string; method: string; args: unknown[] };

/** The transaction must be one call to the escrow with exactly these arguments, from this account. */
function assertIsCall(xdr: string, passphrase: string, expected: Expected) {
  const refuse = () =>
    new AppError(ErrorCodes.STELLAR_TX_REJECTED, {
      message: "That transaction isn't the one we prepared.",
    });
  let tx: Transaction;
  try {
    tx = TransactionBuilder.fromXDR(xdr, passphrase) as Transaction;
  } catch {
    throw new AppError(ErrorCodes.STELLAR_TX_REJECTED, {
      message: "That isn't a valid transaction.",
    });
  }
  const op = tx.operations[0];
  const func = op?.type === "invokeHostFunction" ? op.func : null;
  const invoke = func?.type === "hostFunctionTypeInvokeContract" ? func.invokeContract : null;
  if (tx.source !== expected.source || tx.operations.length !== 1 || invoke === null)
    throw refuse();
  if (
    Address.fromScAddress(invoke.contractAddress).toString() !== expected.contract ||
    invoke.functionName.toString() !== expected.method
  )
    throw refuse();
  if (invoke.args.length !== expected.args.length) throw refuse();
  invoke.args.forEach((arg, index) => {
    if (scValToNative(arg) !== expected.args[index]) throw refuse();
  });
}

/** Who the escrow sees as the bounty's creator, and whether the platform signs for them. */
async function creatorOf(
  ctx: Pick<ServiceCtx, "db">,
  artist: ArtistRef,
  user: SessionUser,
  fundedFromStorage: boolean,
) {
  if (fundedFromStorage) {
    const storage = artist.storageAccountId
      ? await ctx.db.chainAccount.findUnique({
          where: { id: artist.storageAccountId },
          select: { publicKey: true },
        })
      : null;
    if (!storage)
      throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
        message: "You don't have a storage account to fund from.",
      });
    return { address: storage.publicKey, signer: "server" as const };
  }
  if (!user.walletAddress) throw new AppError(ErrorCodes.WALLET_NOT_CONNECTED);
  return {
    address: user.walletAddress,
    signer: isCustodial(user) ? ("custodial" as const) : ("wallet" as const),
  };
}

async function signed(
  ctx: ServiceCtx,
  user: SessionUser,
  creator: { address: string; signer: "server" | "custodial" | "wallet" },
  xdr: string,
) {
  if (creator.signer === "server") return ctx.chain.signWithServerKeys(xdr, [creator.address]);
  if (creator.signer === "custodial") {
    if (!user.email) throw new AppError(ErrorCodes.WALLET_NOT_CONNECTED);
    return ctx.chain.signForCustodialUser(xdr, user.email);
  }
  return xdr;
}

async function sourceAccount(ctx: ServiceCtx, address: string) {
  const account = await ctx.chain.loadAccount(address);
  if (!account)
    throw new AppError(ErrorCodes.WALLET_NEEDS_SETUP, {
      message: "That account needs a little XLM before it can send this.",
    });
  return account;
}

/** What each place the artist can fund from holds, so the form can show it before they choose. */
export async function fundingSources(
  ctx: ServiceCtx,
  artist: ArtistRef & { fanTokenItemId: string | null },
  user: Pick<SessionUser, "walletAddress">,
) {
  const read = async (address: string | null | undefined) => {
    if (!address) return null;
    const account = await ctx.chain.loadAccount(address);
    return {
      ...fundsOf(account, ctx.chain.config.assets),
      others: otherAssetsOf(account, ctx.chain.config.assets),
    };
  };
  const storage = artist.storageAccountId
    ? await ctx.db.chainAccount.findUnique({
        where: { id: artist.storageAccountId },
        select: { publicKey: true },
      })
    : null;
  const fanToken = artist.fanTokenItemId
    ? await ctx.db.classicToken.findUnique({
        where: { itemId: artist.fanTokenItemId },
        select: { code: true, issuer: true },
      })
    : null;
  return {
    wallet: await read(user.walletAddress),
    storage: await read(storage?.publicKey),
    /** The artist's fan token (page asset), listed first */
    fanToken,
  };
}

export async function prepareFunding(
  ctx: ServiceCtx,
  artist: ArtistRef,
  user: SessionUser,
  bountyId: string,
) {
  const bounty = await ownBounty(ctx, artist, bountyId);
  if (bounty.fundTxHash)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: "This bounty is already funded." });
  const creator = await creatorOf(ctx, artist, user, bounty.fundedFromStorage);
  const account = await sourceAccount(ctx, creator.address);

  const token = prizeToken(ctx.chain.config, bounty);
  const code = token.asset.getCode();
  if (await needsTokenSetup(ctx.chain, bounty))
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: `Set up ${code} for escrow first.`,
    });
  const amount = toStroops(bounty.prizeAmount.toString());
  const have = toStroops(availableOf(account, token.asset));
  if (have < amount) {
    throw invalid(
      `There isn't enough ${code} to fund it. You have ${toAmount(have)} and the prize is ${toAmount(amount)}.`,
    );
  }

  const built = buildBountyFund({
    source: new Account(account.accountId(), account.sequenceNumber()),
    network: ctx.chain.config.network,
    contract: bounty.escrowContractId,
    bountyId: bounty.id,
    creator: creator.address,
    token: token.address,
    amount,
    maxWinners: bounty.maxWinners,
  });
  const xdr = await ctx.chain.prepareContractCall(
    built.xdr,
    creator.signer === "server" ? [creator.address] : undefined,
  );
  return { xdr, signer: creator.signer, prize: toAmount(amount), code };
}

export async function submitFunding(
  ctx: ServiceCtx,
  artist: ArtistRef,
  user: SessionUser,
  bountyId: string,
  xdr: string,
) {
  const bounty = await ownBounty(ctx, artist, bountyId);
  if (bounty.fundTxHash)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: "This bounty is already funded." });
  const creator = await creatorOf(ctx, artist, user, bounty.fundedFromStorage);
  assertIsCall(xdr, ctx.chain.config.network.passphrase, {
    source: creator.address,
    contract: bounty.escrowContractId,
    method: "create_bounty",
    args: [
      bounty.id,
      creator.address,
      prizeToken(ctx.chain.config, bounty).address,
      toStroops(bounty.prizeAmount.toString()),
      bounty.maxWinners,
    ],
  });

  const { hash } = await ctx.chain.submit(await signed(ctx, user, creator, xdr));
  await ctx.db.bounty.update({ where: { id: bounty.id }, data: { fundTxHash: hash } });
  // Fans see a bounty once its prize is in escrow, so that's when followers hear about it.
  await notifyFollowers(ctx, {
    type: "BOUNTY",
    artist: { id: artist.id, userId: user.id },
    entityId: bounty.id,
    once: true,
  });
  return { txHash: hash };
}

/** Deploys the prize asset's contract (once per asset), paid by whoever funds the bounty. */
export async function prepareTokenSetup(
  ctx: ServiceCtx,
  artist: ArtistRef,
  user: SessionUser,
  bountyId: string,
) {
  const bounty = await ownBounty(ctx, artist, bountyId);
  if (bounty.fundTxHash)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: "This bounty is already funded." });
  if (!(await needsTokenSetup(ctx.chain, bounty)))
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: "This token is already set up." });
  const creator = await creatorOf(ctx, artist, user, bounty.fundedFromStorage);
  const account = await sourceAccount(ctx, creator.address);
  const { asset } = prizeToken(ctx.chain.config, bounty);
  const built = buildAssetContractSetup({
    source: new Account(account.accountId(), account.sequenceNumber()),
    network: ctx.chain.config.network,
    asset,
  });
  const xdr = await ctx.chain.prepareContractCall(
    built.xdr,
    creator.signer === "server" ? [creator.address] : undefined,
  );
  return { xdr, signer: creator.signer, code: asset.getCode() };
}

/** The transaction must deploy exactly this asset's contract, from this account, and nothing else. */
function assertIsSetup(xdr: string, passphrase: string, source: string, asset: Asset) {
  let tx: Transaction;
  try {
    tx = TransactionBuilder.fromXDR(xdr, passphrase) as Transaction;
  } catch {
    throw new AppError(ErrorCodes.STELLAR_TX_REJECTED, {
      message: "That isn't a valid transaction.",
    });
  }
  const op = tx.operations[0];
  const func = op?.type === "invokeHostFunction" ? op.func : null;
  const create = func?.type === "hostFunctionTypeCreateContract" ? func.createContract : null;
  const preimage = create?.contractIdPreimage;
  const ok =
    tx.source === source &&
    tx.operations.length === 1 &&
    create?.executable.type === "contractExecutableStellarAsset" &&
    preimage?.type === "contractIdPreimageFromAsset" &&
    Asset.fromOperation(preimage.fromAsset).equals(asset);
  if (!ok)
    throw new AppError(ErrorCodes.STELLAR_TX_REJECTED, {
      message: "That transaction isn't the one we prepared.",
    });
}

export async function submitTokenSetup(
  ctx: ServiceCtx,
  artist: ArtistRef,
  user: SessionUser,
  bountyId: string,
  xdr: string,
) {
  const bounty = await ownBounty(ctx, artist, bountyId);
  if (bounty.fundTxHash)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: "This bounty is already funded." });
  const creator = await creatorOf(ctx, artist, user, bounty.fundedFromStorage);
  const { asset } = prizeToken(ctx.chain.config, bounty);
  assertIsSetup(xdr, ctx.chain.config.network.passphrase, creator.address, asset);
  const { hash } = await ctx.chain.submit(await signed(ctx, user, creator, xdr));
  return { txHash: hash };
}

/** Everything a winner pick needs checked before any money moves. */
async function checkWinner(
  ctx: ServiceCtx,
  bountyId: string,
  winnerUserId: string,
  amountText: string,
) {
  const bounty = await ctx.db.bounty.findUniqueOrThrow({
    where: { id: bountyId },
    select: {
      prizeAmount: true,
      maxWinners: true,
      winners: { select: { userId: true, prizeAmount: true } },
    },
  });
  if (bounty.winners.length >= bounty.maxWinners)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: "All the winners are already picked.",
    });
  if (bounty.winners.some((winner) => winner.userId === winnerUserId))
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, { message: "That fan is already a winner." });

  let amount: bigint;
  try {
    amount = toStroops(amountText);
  } catch {
    throw invalid("Enter the prize as a number, like 25 or 12.5.");
  }
  if (amount <= 0n) throw invalid("The prize has to be more than 0.");
  const left =
    toStroops(bounty.prizeAmount.toString()) -
    bounty.winners.reduce((sum, winner) => sum + toStroops(winner.prizeAmount.toString()), 0n);
  if (amount > left) throw invalid(`Only ${toAmount(left)} is left in the prize.`);

  const joined = await ctx.db.bountyParticipant.findUnique({
    where: { bountyId_userId: { bountyId, userId: winnerUserId } },
    select: { user: { select: { walletAddress: true } } },
  });
  if (!joined) throw invalid("That fan hasn't joined this bounty.");
  if (!joined.user.walletAddress) throw invalid("That fan has no wallet to pay yet.");
  return { amount, winnerAddress: joined.user.walletAddress };
}

export async function prepareWinner(
  ctx: ServiceCtx,
  artist: ArtistRef,
  user: SessionUser,
  input: { bountyId: string; winnerUserId: string; amount: string },
) {
  const bounty = await ownBounty(ctx, artist, input.bountyId);
  if (!bounty.fundTxHash)
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, { message: "Fund the bounty first." });
  const { amount, winnerAddress } = await checkWinner(
    ctx,
    bounty.id,
    input.winnerUserId,
    input.amount,
  );
  const caller = await creatorOf(ctx, artist, user, bounty.fundedFromStorage);
  const account = await sourceAccount(ctx, caller.address);

  const built = buildBountySelectWinner({
    source: new Account(account.accountId(), account.sequenceNumber()),
    network: ctx.chain.config.network,
    contract: bounty.escrowContractId,
    bountyId: bounty.id,
    caller: caller.address,
    winner: winnerAddress,
    amount,
  });
  const xdr = await ctx.chain.prepareContractCall(
    built.xdr,
    caller.signer === "server" ? [caller.address] : undefined,
  );
  return { xdr, signer: caller.signer, amount: toAmount(amount) };
}

export async function submitWinner(
  ctx: ServiceCtx,
  artist: ArtistRef,
  user: SessionUser,
  input: { bountyId: string; winnerUserId: string; amount: string; xdr: string },
) {
  const bounty = await ownBounty(ctx, artist, input.bountyId);
  if (!bounty.fundTxHash)
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, { message: "Fund the bounty first." });
  const { amount, winnerAddress } = await checkWinner(
    ctx,
    bounty.id,
    input.winnerUserId,
    input.amount,
  );
  const caller = await creatorOf(ctx, artist, user, bounty.fundedFromStorage);
  assertIsCall(input.xdr, ctx.chain.config.network.passphrase, {
    source: caller.address,
    contract: bounty.escrowContractId,
    method: "select_winner",
    args: [caller.address, bounty.id, winnerAddress, amount],
  });

  const { hash } = await ctx.chain.submit(await signed(ctx, user, caller, input.xdr));
  await ctx.db.bountyWinner.create({
    data: {
      bountyId: bounty.id,
      userId: input.winnerUserId,
      prizeAmount: toAmount(amount),
      txHash: hash,
    },
  });
  await notify(ctx, {
    type: "BOUNTY_WINNER",
    actorId: user.id,
    entityId: bounty.id,
    recipients: [{ id: input.winnerUserId }],
  });
  return { txHash: hash };
}
