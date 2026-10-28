import type { Db } from "@bandcoin/db";
import { ErrorCodes, isAppError } from "@bandcoin/errors";

import type { AuthenticatedUser } from "./authorize-credentials";

type App = "app" | "artist" | "ar" | "studio";

/**
 * Writes one ActivityLog row per sign-in attempt, so admins see sign-ins and
 * repeated failures next to everything else a person did. The credential
 * itself is never stored: only the wallet type and, for wallets, the public key.
 * A failed write is reported and swallowed; it never blocks a sign-in.
 */
export async function recordSignIn(
  db: Db,
  input: {
    app: App;
    walletType: unknown;
    publicKey?: unknown;
    headers: Headers;
    result: { user: AuthenticatedUser } | { error: unknown };
  },
) {
  const user = "user" in input.result ? input.result.user : null;
  const error = "error" in input.result ? input.result.error : null;
  try {
    await db.activityLog.create({
      data: {
        actorId: user?.id ?? null,
        actorRole: user?.role ?? "GUEST",
        action: "auth.signIn",
        targetType: user ? "User" : null,
        targetId: user?.id ?? null,
        input: {
          walletType: typeof input.walletType === "string" ? input.walletType : null,
          ...(typeof input.publicKey === "string" ? { publicKey: input.publicKey } : {}),
        },
        status: user ? "SUCCESS" : "FAILED",
        errorCode: error ? (isAppError(error) ? error.code : firebaseCode(error)) : null,
        app: input.app,
        ip: input.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? input.headers.get("x-real-ip"),
        userAgent: input.headers.get("user-agent"),
      },
    });
  } catch (logError) {
    console.error("[auth] couldn't record the sign-in", logError);
  }
}

/** "Firebase: Error (auth/wrong-password)." → "auth/wrong-password" */
function firebaseCode(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /\((auth\/[\w-]+)\)/.exec(message)?.[1] ?? ErrorCodes.WALLET_AUTH_FAILED;
}
