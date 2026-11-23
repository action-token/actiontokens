import { getAuth } from "firebase-admin/auth";

import { AppError, ErrorCodes } from "@actiontokens/errors";

import { initFirebaseAdmin } from "./admin-app";
import { APPLE_WEB_SERVICE_ID, verifyAppleToken } from "./verify-apple-token";

/** Firebase Admin's auth service for this deployment's project. */
const adminAuth = () => getAuth(initFirebaseAdmin());

/** Verifies a Firebase ID token and returns who it belongs to. */
export async function verifyFirebaseIdToken(idToken: string) {
  return adminAuth().verifyIdToken(idToken);
}

/** The Firebase user for an email, or `undefined` when there is none (or Firebase errors). */
export async function findFirebaseUserByEmail(email: string) {
  try {
    return await adminAuth().getUserByEmail(email);
  } catch (error) {
    console.error("[firebase] getUserByEmail failed", error);
    return undefined;
  }
}

/** The email on a Firebase user, falling back to the first linked provider's. */
export async function findEmailByFirebaseUid(uid: string): Promise<string | undefined> {
  try {
    const user = await adminAuth().getUser(uid);
    return user.email ?? user.providerData[0]?.email ?? undefined;
  } catch (error) {
    console.error("[firebase] getUser failed", error);
    return undefined;
  }
}

/**
 * The Firebase user for an email, created (unverified, no password) when there
 * is none. For gifts and guest card orders: the person signs in later with
 * Google/Apple on that email, or sets a password through "Forgot password".
 * Any Firebase error other than "not found" is thrown, never treated as new.
 */
export async function findOrCreateFirebaseUserByEmail(email: string) {
  const auth = adminAuth();
  try {
    return { user: await auth.getUserByEmail(email), created: false };
  } catch (error) {
    if (!isUserNotFound(error)) throw error;
  }
  return { user: await auth.createUser({ email }), created: true };
}

/**
 * The Firebase user behind a "Sign in with Apple" identity token sent to the
 * server (native app sign-in, and the website's fallback when Firebase won't
 * sign the Apple account in itself).
 *
 * Which account you get is decided only by what Apple vouches for in the
 * token, never by an email the client sends alongside it (otherwise anyone
 * with *an* Apple token could ask for someone else's account): the user for
 * the email Apple verified, created if there is none.
 *
 * The Apple account is deliberately **not** linked to that user. The app and
 * the website are under different Apple developer teams, so one person has two
 * Apple ids (`sub`s), and Firebase lets a user hold only one Apple login: an
 * app link would make the website's Apple sign-in fail with
 * `auth/provider-already-linked`. Matching on the verified email every time
 * gives the same user (and wallet) from Google, email, app Apple and web Apple.
 */
export async function getOrCreateFirebaseUserFromApple(appleToken: string) {
  const identity = await verifyAppleToken(appleToken);
  const auth = adminAuth();

  // Accounts signed in before this change still have the app's Apple id linked.
  // Release it so the website's Apple id can attach, then carry on as below.
  const linked = await orUndefinedIfNotFound(() =>
    auth.getUserByProviderUid("apple.com", identity.sub),
  );

  const email = identity.emailVerified ? identity.email : undefined;
  if (!email) {
    // Without an email the old link is the only way to find the account: keep it.
    if (linked) return linked;
    throw new AppError(ErrorCodes.WALLET_AUTH_FAILED, {
      message: "Apple didn't share a verified email address. Use another sign-in method.",
    });
  }

  if (linked && identity.audience !== APPLE_WEB_SERVICE_ID) {
    await auth.updateUser(linked.uid, { providersToUnlink: ["apple.com"] });
  }

  // The verified email wins over an old link: someone who first hid their email
  // and now shares it gets their main account, not the private-relay one.
  const existing = await orUndefinedIfNotFound(() => auth.getUserByEmail(email));
  if (existing) return existing;
  return auth.createUser({ email, emailVerified: true });
}

const isUserNotFound = (error: unknown) =>
  (error as { code?: string }).code === "auth/user-not-found";

/** Runs a Firebase lookup, resolving `undefined` instead of throwing when there is no such user. */
async function orUndefinedIfNotFound<T>(lookup: () => Promise<T>): Promise<T | undefined> {
  try {
    return await lookup();
  } catch (error) {
    if (isUserNotFound(error)) return undefined;
    throw error;
  }
}

/**
 * Deletes the Firebase account for `email`.
 * Resolves `false` when there is none (wallet sign-ups have no Firebase user).
 */
export async function deleteFirebaseUserByEmail(email: string): Promise<boolean> {
  const auth = adminAuth();
  try {
    const user = await auth.getUserByEmail(email);
    await auth.deleteUser(user.uid);
    return true;
  } catch (error) {
    if (isUserNotFound(error)) return false;
    throw error;
  }
}
