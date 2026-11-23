import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";

import { AppError, ErrorCodes } from "@actiontokens/errors";

/** The iOS app's bundle id: the audience of tokens from native "Sign in with Apple". */
export const APPLE_APP_BUNDLE_ID = "com.thebillboardapp.actionToken";

/**
 * The website's Services ID (Firebase's Apple provider). It belongs to a
 * different Apple developer team than the app, so Apple gives the same person a
 * different `sub` (and a different private-relay email) on the web.
 */
export const APPLE_WEB_SERVICE_ID = "com.action-tokens";

/**
 * The client ids whose identity tokens are accepted. White-label apps with their
 * own bundle id set `APPLE_SIGN_IN_AUDIENCE` (comma-separated).
 */
function appleAudiences(): string[] {
  const fromEnv = process.env.APPLE_SIGN_IN_AUDIENCE?.split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  return fromEnv?.length ? fromEnv : [APPLE_APP_BUNDLE_ID, APPLE_WEB_SERVICE_ID];
}

const appleKeys = jwksClient({ jwksUri: "https://appleid.apple.com/auth/keys" });

/** What Apple vouches for in an identity token. */
export interface AppleIdentity {
  /** Stable id of the Apple account for this developer team (the same on every sign-in). */
  sub: string;
  /** The email Apple shares: the real one, or a private relay address. */
  email: string | undefined;
  emailVerified: boolean;
  /** Which client the token was issued to: the app's bundle id or the web's Services ID. */
  audience: string;
}

interface AppleTokenClaims {
  sub: string;
  aud: string;
  email?: string;
  // Apple sends this as the string "true" or as a boolean
  email_verified?: boolean | string;
}

/** Verifies an Apple identity token against Apple's published keys. */
export async function verifyAppleToken(identityToken: string): Promise<AppleIdentity> {
  const decoded = jwt.decode(identityToken, { complete: true });
  const keyId = decoded?.header.kid;
  if (!keyId) {
    throw new AppError(ErrorCodes.WALLET_AUTH_FAILED, { message: "Invalid Apple sign-in token." });
  }

  const key = await appleKeys.getSigningKey(keyId);
  const [firstAudience, ...otherAudiences] = appleAudiences();
  const claims = jwt.verify(identityToken, key.getPublicKey(), {
    algorithms: ["RS256"],
    audience: [firstAudience!, ...otherAudiences],
    issuer: "https://appleid.apple.com",
  }) as unknown as AppleTokenClaims;

  return {
    sub: claims.sub,
    email: claims.email,
    emailVerified: claims.email_verified === true || claims.email_verified === "true",
    audience: claims.aud,
  };
}
