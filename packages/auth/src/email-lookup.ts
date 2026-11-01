import type { Db } from "@bandcoin/db";
import { isCustodialWallet } from "@bandcoin/wallet/shared";

/** The account already using this email, read from the database only. */
export async function lookupAccountForEmail(db: Db, rawEmail: string) {
  const row = await db.user.findFirst({
    where: { email: { equals: rawEmail.trim(), mode: "insensitive" } },
    select: { id: true, walletAddress: true, signUpMethod: true },
  });
  if (!row?.walletAddress) return null;
  return {
    userId: row.id,
    walletAddress: row.walletAddress,
    custodial: isCustodialWallet(row.signUpMethod),
  };
}
