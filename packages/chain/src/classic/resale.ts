import { type Account, Asset, Operation } from "@stellar/stellar-sdk";

import type { AssetRef } from "../currency";
import { toAmount } from "../money";
import { TRUSTLINE_RESERVE_XLM } from "../quote";
import { finish, type NetworkParams, startTransaction } from "../transaction";

/**
 * Resale of classic copies. A holder moves the copies they want to sell into
 * their own resale storage (an account Bandcoin holds the key for), so a sale
 * can pay out of it without the seller signing each time. The seller's wallet
 * is the source and pays the network fee; storage co-signs the one trustline
 * it opens for the token.
 */

/** What a new storage account starts with: its two base reserves. */
export const RESALE_STORAGE_BASE_XLM = "1";

export function buildResaleList(input: {
  seller: Account;
  network: NetworkParams;
  orderId: string;
  storage: string;
  asset: AssetRef;
  /** Copies to list (whole numbers) */
  amount: string;
  /** The storage account doesn't exist yet: the seller creates it */
  openStorage: boolean;
  /** Storage doesn't trust this token yet */
  openTrustline: boolean;
  /** The seller's wallet can't receive this payout asset yet (BANDCOIN): its line opens too */
  openPayoutLine?: AssetRef;
}) {
  if (!(Number(input.amount) > 0)) throw new RangeError("List at least one copy");
  const token = new Asset(input.asset.code, input.asset.issuer);
  const builder = startTransaction(input.seller, input.network, { memo: input.orderId });

  // The payout line is the seller's own, so its reserve comes out of their wallet.
  if (input.openPayoutLine)
    builder.addOperation(
      Operation.changeTrust({
        asset: new Asset(input.openPayoutLine.code, input.openPayoutLine.issuer),
      }),
    );
  if (input.openStorage) {
    // Base reserves plus the first trustline's, so storage can open it without more XLM.
    builder.addOperation(
      Operation.createAccount({
        destination: input.storage,
        startingBalance: toAmount(
          BigInt(Math.round(Number(RESALE_STORAGE_BASE_XLM) * 1e7)) +
            BigInt(Math.round(Number(TRUSTLINE_RESERVE_XLM) * 1e7)),
        ),
      }),
    );
  } else if (input.openTrustline) {
    builder.addOperation(
      Operation.payment({
        destination: input.storage,
        asset: Asset.native(),
        amount: TRUSTLINE_RESERVE_XLM,
      }),
    );
  }
  if (input.openStorage || input.openTrustline)
    builder.addOperation(Operation.changeTrust({ source: input.storage, asset: token }));
  builder.addOperation(
    Operation.payment({ destination: input.storage, asset: token, amount: input.amount }),
  );
  return input.openStorage || input.openTrustline
    ? finish(builder, [input.storage])
    : finish(builder);
}
