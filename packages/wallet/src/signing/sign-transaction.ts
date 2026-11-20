"use client";

import { AppError, ErrorCodes } from "@actiontokens/errors";

import { getWalletProvider } from "../providers/registry";
import type { WalletType } from "../wallet-type";

/**
 * Asks the user's wallet to sign `xdr` and returns the signed XDR, without
 * submitting it: the server checks and submits (purchases, orders).
 * Throws `WALLET_SIGNING_REJECTED` when the user declines, and
 * `WALLET_UNSUPPORTED_ACTION` for wallets that can't sign here (custodial
 * accounts, which the server signs for).
 */
export async function signTransaction(input: {
  xdr: string;
  publicKey: string;
  walletType: WalletType | string;
}): Promise<string> {
  const provider = getWalletProvider(input.walletType);
  if (!provider?.sign) {
    throw new AppError(ErrorCodes.WALLET_UNSUPPORTED_ACTION, {
      message: `Signing isn't supported for "${input.walletType}" wallets.`,
      details: { walletType: input.walletType },
    });
  }
  return provider.sign(input.xdr, input.publicKey);
}
