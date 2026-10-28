import type { Horizon } from "@stellar/stellar-sdk";

import {
  addSignatures,
  chainConfig,
  type ChainConfig,
  decryptSecret,
  findTransaction,
  liveRates,
  loadAccount,
  type Rates,
  submit,
} from "@bandcoin/chain/server";
import type { Db } from "@bandcoin/db";
import { AppError, ErrorCodes } from "@bandcoin/errors";
import { fetchCustodialAccountSecret } from "@bandcoin/wallet/server";

import { chargeCard, refundCard } from "../payments/square";

/**
 * Everything services need from the outside world: Stellar, keys and the
 * card processor. Services take it from `ctx.chain`, so tests pass a fake and
 * never touch the network.
 */
export type ChainGateway = {
  config: ChainConfig;
  loadAccount(id: string): Promise<Horizon.AccountResponse | null>;
  rates(): Promise<Rates>;
  /** Signs with the platform-held keys (issuer, storage) the builder listed */
  signWithServerKeys(xdr: string, publicKeys: string[]): Promise<string>;
  /** Signs for an email/Google/Apple account, whose key the platform keeps */
  signForCustodialUser(xdr: string, email: string): Promise<string>;
  submit(xdr: string): Promise<{ hash: string }>;
  findTransaction(hash: string): Promise<{ successful: boolean; envelopeXdr: string } | null>;
  card: {
    charge(input: { orderId: string; sourceId: string; cents: number; verificationToken?: string }): Promise<{
      paymentId: string;
    }>;
    refund(input: { orderId: string; paymentId: string; cents: number }): Promise<void>;
  };
};

/** The real gateway: Horizon, the encrypted ChainAccount keys, the accounts service and Square. */
export function createChainGateway(db: Db): ChainGateway {
  return {
    config: chainConfig(),
    loadAccount,
    rates: () => liveRates(),
    async signWithServerKeys(xdr, publicKeys) {
      if (publicKeys.length === 0) return xdr;
      const accounts = await db.chainAccount.findMany({
        where: { publicKey: { in: publicKeys } },
        select: { publicKey: true, secretEncrypted: true },
      });
      const missing = publicKeys.filter((key) => !accounts.some((account) => account.publicKey === key));
      if (missing.length > 0) {
        throw new AppError(ErrorCodes.STORAGE_ACCOUNT_UNAVAILABLE, { details: { missing } });
      }
      return addSignatures(
        xdr,
        accounts.map((account) => decryptSecret(account.secretEncrypted)),
      );
    },
    async signForCustodialUser(xdr, email) {
      return addSignatures(xdr, [await fetchCustodialAccountSecret(email)]);
    },
    submit,
    findTransaction,
    card: { charge: chargeCard, refund: refundCard },
  };
}
