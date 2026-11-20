import { randomUUID } from "node:crypto";

import type { Currency, Db, UserRole } from "@actiontokens/db";
import { isCustodialWallet } from "@actiontokens/wallet/shared";

import type { ChainGateway } from "./services/chain-gateway";

/** The five apps that call the API, written to every activity log row. */
export type AppName = "app" | "org" | "ar" | "worker";

/** The signed-in user, from the NextAuth session (`@actiontokens/auth` `sessionUserOf`). */
export type SessionUser = {
  id: string;
  role: UserRole;
  walletAddress: string;
  /** A `WalletType`: Freighter, Albedo… sign themselves; email/Google/Apple are custodial */
  walletType: string;
  email?: string | null;
  /** An admin suspended the account: every signed-in call is refused */
  suspended?: boolean;
};

export const isCustodial = (user: Pick<SessionUser, "walletType">) =>
  isCustodialWallet(user.walletType);

/** Facts a procedure adds to its own activity log row (`ctx.activity.set`). */
export type ActivityFacts = {
  targetType?: string;
  targetId?: string;
  txHash?: string;
  amount?: string;
  currency?: Currency;
};

export type Context = {
  db: Db;
  chain: ChainGateway;
  session: { user: SessionUser } | null;
  app: AppName;
  ip: string | null;
  userAgent: string | null;
  requestId: string;
  /**
   * The artist an admin asks to act as (the `x-acting-artist` header, sent only by Admin › All
   * maps). Only `actingArtistProcedure` reads it, and only an admin may use it.
   */
  actAs: string | null;
  activity: { set(facts: ActivityFacts): void; facts(): ActivityFacts };
};

export function createActivityRecorder(): Context["activity"] {
  let collected: ActivityFacts = {};
  return {
    set: (facts) => {
      collected = { ...collected, ...facts };
    },
    facts: () => collected,
  };
}

/**
 * Marks the session's user as suspended when an admin suspended them since
 * they signed in. Their JWT stays valid until it refreshes, so this is read
 * on every request (one lookup by id).
 */
export async function liveSession(
  db: Db,
  session: { user: SessionUser } | null,
): Promise<{ user: SessionUser } | null> {
  if (!session) return null;
  const row = await db.user.findUnique({
    where: { id: session.user.id },
    select: { suspendedAt: true },
  });
  if (!row) return null;
  return row.suspendedAt ? { user: { ...session.user, suspended: true } } : session;
}

/** One context per request. Each app's route handler passes its session and headers. */
export function createContext(input: {
  db: Db;
  chain: ChainGateway;
  app: AppName;
  session: { user: SessionUser } | null;
  headers?: Headers;
}): Context {
  const headers = input.headers ?? new Headers();
  return {
    db: input.db,
    chain: input.chain,
    app: input.app,
    session: input.session,
    ip: headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? headers.get("x-real-ip"),
    userAgent: headers.get("user-agent"),
    requestId: headers.get("x-request-id") ?? randomUUID(),
    actAs: headers.get("x-acting-artist")?.trim() || null,
    activity: createActivityRecorder(),
  };
}
