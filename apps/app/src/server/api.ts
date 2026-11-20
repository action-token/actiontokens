import { headers } from "next/headers";
import { cache } from "react";

import {
  appRouter,
  type ChainGateway,
  createCallerFactory,
  createChainGateway,
  createContext,
  liveSession,
} from "@actiontokens/api";
import { sessionUserOf } from "@actiontokens/auth";
import { db } from "@actiontokens/db/server";

import { getSession } from "./auth";

let gateway: ChainGateway | null = null;
/** Created on first use, so a missing chain setting fails the request that needs it, not the build. */
const chain = () => (gateway ??= createChainGateway(db));

/** The tRPC context for one request: the session, chain access and request facts for the activity log. */
export async function createAppContext(requestHeaders: Headers) {
  return createContext({
    db,
    chain: chain(),
    app: "app",
    session: await liveSession(db, sessionUserOf(await getSession())),
    headers: requestHeaders,
  });
}

/** Calls the API from server components, once per request: `const api = await serverApi(); await api.account.me()`. */
export const serverApi = cache(async () =>
  createCallerFactory(appRouter)(await createAppContext(new Headers(await headers()))),
);
