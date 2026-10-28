import type { DefaultSession } from "next-auth";

import type { WalletType } from "../wallet-type";

/** What every app's next-auth session carries about the signed-in user. */
export type BandcoinSessionUser = DefaultSession["user"] & {
  /** The user's id (User.id) */
  id: string;
  /** The user's Stellar public key */
  walletAddress: string;
  role: "FAN" | "ARTIST" | "ADMIN";
  walletType: WalletType;
  emailVerified: boolean;
};

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: BandcoinSessionUser;
  }
}
