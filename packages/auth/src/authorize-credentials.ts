import { verifyMessageSignature } from "@albedo-link/signature-verification";
import axios from "axios";
import { sendEmailVerification, signInWithEmailAndPassword } from "firebase/auth";

import type { Db, UserRole } from "@bandcoin/db";
import { AppError, ErrorCodes } from "@bandcoin/errors";
import { PLATFORM_ASSET, USER_ACCOUNT_URL } from "@bandcoin/wallet/config";
import { firebaseAuth } from "@bandcoin/wallet/firebase";
import { getOrCreateFirebaseUserFromApple, verifyFirebaseIdToken, verifyLoginChallenge } from "@bandcoin/wallet/server";
import { accountServiceResponseSchema, authCredentialSchema, WalletType } from "@bandcoin/wallet/shared";

/** What a successful sign-in resolves to (the shape NextAuth keeps in the JWT). */
export type AuthenticatedUser = {
  id: string;
  walletAddress: string;
  role: UserRole;
  name: string | null;
  email: string | null;
  image: string | null;
  walletType: WalletType;
  emailVerified: boolean;
};

/** Wallets that sign a server-issued challenge transaction to prove ownership. */
const SIGNED_CHALLENGE_WALLETS: readonly WalletType[] = [
  WalletType.rabet,
  WalletType.freighter,
  WalletType.walletConnect,
  WalletType.metamask,
  WalletType.xBull,
  WalletType.hana,
  WalletType.hotWallet,
];

/**
 * Turns a credential into a user: the one implementation every app's NextAuth
 * uses. `input` is whatever the browser sent, so it's validated here.
 *
 * Throws `WALLET_AUTH_FAILED` for a bad credential (Firebase error strings like
 * "Firebase: Error (auth/unverified-email)." are meant to reach the client).
 */
export async function authorizeCredentials(db: Db, input: unknown): Promise<AuthenticatedUser> {
  const parsed = authCredentialSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError(ErrorCodes.WALLET_AUTH_FAILED, { message: "That sign-in request is incomplete or malformed." });
  }
  const credential = parsed.data;

  switch (credential.walletType) {
    case WalletType.emailPass: {
      const { email, password, fromAppSign } = credential;
      const { user } = await signInWithEmailAndPassword(firebaseAuth, email, password);
      if (!user.emailVerified) {
        await sendEmailVerification(user);
        throw new AppError(ErrorCodes.WALLET_AUTH_FAILED, { message: "Firebase: Error (auth/unverified-email)." });
      }
      const publicKey = await custodialPublicKey({ email, uid: user.uid, fromAppSign });
      return signedIn(await findOrCreateUser(db, { publicKey, email, fromAppSign, method: credential.walletType }), credential.walletType);
    }

    case WalletType.albedo: {
      const { pubkey, signature, token, fromAppSign } = credential;
      if (!verifyMessageSignature(pubkey, token, signature)) throw invalidSignature();
      return signedIn(await findOrCreateUser(db, { publicKey: pubkey, fromAppSign, method: credential.walletType }), credential.walletType);
    }

    case WalletType.google:
    case WalletType.facebook: {
      const { token, email, fromAppSign } = credential;
      const { uid } = await verifyFirebaseIdToken(token);
      const publicKey = await custodialPublicKey({ uid, email, fromAppSign });
      return signedIn(await findOrCreateUser(db, { publicKey, email, fromAppSign, method: credential.walletType }), credential.walletType);
    }

    case WalletType.apple: {
      const { appleToken, token, fromAppSign } = credential;
      let uid: string;
      let email = credential.email;
      if (token) {
        ({ uid } = await verifyFirebaseIdToken(token));
      } else if (appleToken) {
        // The account comes from the Apple token itself, not from the email the client sent.
        const firebaseUser = await getOrCreateFirebaseUserFromApple(appleToken);
        uid = firebaseUser.uid;
        email = firebaseUser.email ?? email;
      } else {
        throw new AppError(ErrorCodes.WALLET_AUTH_FAILED, { message: "Apple sign-in sent no token." });
      }
      const publicKey = await custodialPublicKey({ uid, email, fromAppSign });
      return signedIn(await findOrCreateUser(db, { publicKey, email, fromAppSign, method: credential.walletType }), credential.walletType);
    }

    default: {
      if (!SIGNED_CHALLENGE_WALLETS.includes(credential.walletType)) {
        throw new AppError(ErrorCodes.WALLET_AUTH_FAILED, { message: "That wallet can't sign in here." });
      }
      const { pubkey, signedXDR, fromAppSign } = credential;
      if (!verifyLoginChallenge({ publicKey: pubkey, xdr: signedXDR })) throw invalidSignature();
      return signedIn(await findOrCreateUser(db, { publicKey: pubkey, fromAppSign, method: credential.walletType }), credential.walletType);
    }
  }
}

const invalidSignature = () => new AppError(ErrorCodes.WALLET_AUTH_FAILED, { message: "Invalid signature" });

type UserRow = Awaited<ReturnType<typeof findOrCreateUser>>;

function signedIn(user: UserRow, walletType: WalletType): AuthenticatedUser {
  return {
    id: user.id,
    walletAddress: user.walletAddress!,
    role: user.role,
    name: user.displayName ?? user.username,
    email: user.email,
    image: user.avatarUrl,
    walletType,
    // Custodial sign-ins only get here with a verified email; wallets have none to verify.
    emailVerified: true,
  };
}

/** The user for a wallet: created on first sign-in, email and sign-up method filled in later if missing. */
async function findOrCreateUser(
  db: Db,
  input: { publicKey: string; email?: string; fromAppSign?: string; method: WalletType },
) {
  const { publicKey, email, method } = input;
  const existing = await db.user.findUnique({ where: { walletAddress: publicKey } });
  if (!existing) {
    return db.user.create({
      data: {
        walletAddress: publicKey,
        email,
        emailVerifiedAt: email ? new Date() : null,
        signUpMethod: method,
        signedUpFromApp: input.fromAppSign === "true",
      },
    });
  }
  const missing = {
    ...(!existing.email && email ? { email, emailVerifiedAt: new Date() } : {}),
    ...(!existing.signUpMethod ? { signUpMethod: method } : {}),
  };
  return Object.keys(missing).length > 0 ? db.user.update({ where: { id: existing.id }, data: missing }) : existing;
}

/** Asks the accounts service for (and, the first time, creates) a Firebase user's Stellar account. */
async function custodialPublicKey(input: { uid: string; email: string; fromAppSign: string | undefined }) {
  const response = await axios.get<unknown>(USER_ACCOUNT_URL, {
    params: {
      uid: input.uid,
      email: input.email,
      from: PLATFORM_ASSET.code,
      fromAppSign: input.fromAppSign ? "true" : "false",
    },
  });
  return accountServiceResponseSchema.parse(response.data).publicKey;
}
