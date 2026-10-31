import { Account } from "@stellar/stellar-sdk";

import { buildNftSetPlatformFee } from "@bandcoin/chain";
import { AppError, ErrorCodes, isAppError } from "@bandcoin/errors";

import type { Context } from "../../context";

/**
 * Admin › Settings › contract-NFT fee (main's platformFee router). The shared
 * nft_oz contract keeps its own fee, which every future NFT sale pays. Its
 * owner is the platform treasury, so an admin confirms and the server signs
 * as the treasury, which pays the network fee (decided 2026-10-31). The
 * mutation is in the activity log with the transaction hash.
 */
type ServiceCtx = Pick<Context, "db" | "chain" | "activity">;
export type ContractFeeInput = { feeBps: number; treasury: string };

/** What the contract enforces now, or why it can't be read. */
export async function readContractFee(ctx: Pick<Context, "chain">) {
  if (!ctx.chain.config.nftContract)
    return { configured: false as const, onChain: null, error: "NFT_CONTRACT isn't set." };
  try {
    const onChain = await ctx.chain.nftFeeSettings();
    return {
      configured: true as const,
      onChain,
      /** The server can sign for the owner: it is the platform treasury */
      canChange: onChain.owner === ctx.chain.config.treasury,
      error: null,
    };
  } catch (error) {
    return {
      configured: true as const,
      onChain: null,
      error: isAppError(error) ? error.message : "Couldn't read the contract.",
    };
  }
}

export async function changeContractFee(ctx: ServiceCtx, input: ContractFeeInput) {
  const { chain } = ctx;
  ctx.activity.set({ targetType: "NftContract", targetId: chain.config.nftContract ?? "none" });
  const current = await readContractFee(ctx);
  const contract = chain.config.nftContract;
  if (!current.onChain || !contract)
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: current.error ?? "Couldn't read the contract.",
    });
  if (!current.canChange)
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: "The contract's owner isn't the platform treasury, so the server can't sign.",
    });
  if (current.onChain.feeBps === input.feeBps && current.onChain.treasury === input.treasury)
    throw new AppError(ErrorCodes.RESOURCE_CONFLICT, {
      message: "The contract already uses this fee and account.",
    });

  const owner = await chain.loadAccount(chain.config.treasury);
  if (!owner)
    throw new AppError(ErrorCodes.PRECONDITION_NOT_MET, {
      message: "The treasury account isn't on the network.",
    });
  const built = buildNftSetPlatformFee({
    source: new Account(owner.accountId(), owner.sequenceNumber()),
    network: chain.config.network,
    contract,
    ...input,
  });
  let prepared: string;
  try {
    prepared = await chain.prepareContractCall(built.xdr);
  } catch {
    throw new AppError(ErrorCodes.STELLAR_TX_BUILD_FAILED, {
      message: "The contract rejected this fee. Check the account and try again.",
    });
  }
  const signed = await chain.signWithServerKeys(prepared, [chain.config.treasury]);
  const { hash } = await chain.submit(signed);
  ctx.activity.set({ txHash: hash });
  return {
    txHash: hash,
    before: { feeBps: current.onChain.feeBps, treasury: current.onChain.treasury },
    after: input,
  };
}
