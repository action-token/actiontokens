import type { Db } from "@actiontokens/db";
import { findOrCreateFirebaseUserByEmail } from "@actiontokens/wallet/server";
import { WalletType } from "@actiontokens/wallet/shared";

import { custodialPublicKey, findOrCreateUser } from "./authorize-credentials";
import { lookupAccountForEmail } from "./email-lookup";

export { lookupAccountForEmail };

export type EmailAccount = {
  userId: string;
  walletAddress: string;
  /** The platform keeps its key (email/Google/Apple), so it can sign for it */
  custodial: boolean;
  /** Made just now for this email */
  created: boolean;
};

/**
 * The Bandcoin account for an email, made when there is none: a Firebase user,
 * its custodial Stellar key (from the accounts service, as at sign-in) and the
 * user row. An email already on an account (a wallet one too) returns that.
 *
 * Only a gift being sent or a guest order whose card was charged may call
 * this. Quotes use `lookupAccountForEmail`, because asking the accounts
 * service can open an account on Stellar as a side effect.
 */
export async function resolveAccountForEmail(db: Db, rawEmail: string): Promise<EmailAccount> {
  const existing = await lookupAccountForEmail(db, rawEmail);
  if (existing) return { ...existing, created: false };

  const email = rawEmail.trim().toLowerCase();
  const { user, created } = await findOrCreateFirebaseUserByEmail(email);
  const publicKey = await custodialPublicKey({
    uid: user.uid,
    email: user.email ?? email,
    fromAppSign: undefined,
  });
  const row = await findOrCreateUser(db, {
    publicKey,
    email: user.email ?? email,
    method: WalletType.emailPass,
    emailVerified: user.emailVerified,
  });
  return { userId: row.id, walletAddress: row.walletAddress!, custodial: true, created };
}
