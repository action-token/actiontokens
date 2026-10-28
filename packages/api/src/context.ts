import { randomUUID } from "node:crypto";

import type { Currency, Db, UserRole } from "@bandcoin/db";

import type { ChainGateway } from "./services/chain-gateway";

/** The five apps that call the API, written to every activity log row. */
export type AppName = "app" | "artist" | "ar" | "studio" | "worker";

/** What NextAuth puts in the JWT session (built in phase 4's auth package). */
export type SessionUser = {
  id: string;
  role: UserRole;
  walletAddress: string;
  /** "wallet" for Freighter/xBull/Albedo…; anything else is custodial (email, google, apple) */
  walletType: string;
  email?: string | null;
};

export const isCustodial = (user: Pick<SessionUser, "walletType">) => user.walletType !== "wallet";

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
    activity: createActivityRecorder(),
  };
}
