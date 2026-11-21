import {
  Account,
  Address,
  scValToNative,
  type Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

import { buildBountyClaim } from "@actiontokens/chain";
import { AppError, ErrorCodes } from "@actiontokens/errors";

import { type Context, isCustodial, type SessionUser } from "../../context";

type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;

/**
 * A winner pulls their prize out of the bounty escrow: the deployed
 * `bounty_escrow` contract's `claim_reward(bounty_id, winner)`, with the
 * winner as transaction source and signer, exactly as on the old Action Tokens.
 *
 *   prepare → the simulated call, for the wallet to sign (custodial accounts
 *             get the countdown and the server signs on submit)
 *   submit  → checks the signed XDR is that one call, submits it, records the claim
 */

async function unclaimedWin(ctx: ServiceCtx, bountyId: string, user: SessionUser) {
  const winner = await ctx.db.bountyWinner.findUnique({
    where: { bountyId_userId: { bountyId, userId: user.id } },
    select: { id: true, claimedAt: true },
  });
  if (!winner)
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: "You're not a winner of this bounty.",
    });
  if (winner.claimedAt)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: "You've already claimed this prize.",
    });
  return winner;
}

function escrowContract(ctx: ServiceCtx) {
  const contract = ctx.chain.config.escrowContract;
  if (!contract)
    throw new AppError(ErrorCodes.CONFIG_MISSING, { message: "Prize claims aren't set up yet." });
  return contract;
}

export async function prepareClaim(ctx: ServiceCtx, user: SessionUser, bountyId: string) {
  await unclaimedWin(ctx, bountyId, user);
  const contract = escrowContract(ctx);
  const account = await ctx.chain.loadAccount(user.walletAddress);
  if (!account)
    throw new AppError(ErrorCodes.WALLET_NEEDS_SETUP, {
      message: "Your wallet needs a little XLM before it can claim.",
    });

  const built = buildBountyClaim({
    source: new Account(account.accountId(), account.sequenceNumber()),
    network: ctx.chain.config.network,
    contract,
    bountyId,
    winner: user.walletAddress,
  });
  const xdr = await ctx.chain.prepareContractCall(built.xdr);
  return { xdr, signer: isCustodial(user) ? ("custodial" as const) : ("wallet" as const) };
}

/** The one call the claim may contain: `claim_reward(bountyId, winner)` on the escrow, from the winner. */
function assertIsClaim(
  xdr: string,
  passphrase: string,
  contract: string,
  bountyId: string,
  winner: string,
) {
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
  const args = invoke?.args ?? [];
  const ok =
    tx.source === winner &&
    tx.operations.length === 1 &&
    invoke !== null &&
    Address.fromScAddress(invoke.contractAddress).toString() === contract &&
    invoke.functionName.toString() === "claim_reward" &&
    args.length === 2 &&
    scValToNative(args[0]!) === bountyId &&
    scValToNative(args[1]!) === winner;
  if (!ok)
    throw new AppError(ErrorCodes.STELLAR_TX_REJECTED, {
      message: "That transaction isn't this prize claim.",
    });
}

export async function submitClaim(
  ctx: ServiceCtx,
  user: SessionUser,
  bountyId: string,
  xdr: string,
) {
  await unclaimedWin(ctx, bountyId, user);
  const contract = escrowContract(ctx);
  assertIsClaim(xdr, ctx.chain.config.network.passphrase, contract, bountyId, user.walletAddress);

  let signed = xdr;
  if (isCustodial(user)) {
    if (!user.email) throw new AppError(ErrorCodes.WALLET_NOT_CONNECTED);
    signed = await ctx.chain.signForCustodialUser(xdr, user.email);
  }
  const { hash } = await ctx.chain.submit(signed);
  await ctx.db.bountyWinner.update({
    where: { bountyId_userId: { bountyId, userId: user.id } },
    data: { claimedAt: new Date(), txHash: hash },
  });
  ctx.activity.set({ targetType: "Bounty", targetId: bountyId });
  return { txHash: hash };
}
