import { headers } from "next/headers";
import { cache } from "react";

import {
  type ChainGateway,
  agentRouter,
  createCallerFactory,
  createChainGateway,
  createContext,
  liveSession,
  type SessionUser,
  portalRouter,
} from "@bandcoin/api";
import { sessionUserOf } from "@bandcoin/auth";
import { db } from "@bandcoin/db/server";

import { getSession } from "./auth";

let gateway: ChainGateway | null = null;
/** Created on first use, so a missing chain setting fails the request that needs it, not the build. */
const chain = () => (gateway ??= createChainGateway(db));

/** The tRPC context for one request: the session, chain access and request facts for the activity log. */
export async function createPortalContext(requestHeaders: Headers) {
  return createContext({
    db,
    chain: chain(),
    app: "artist",
    session: await liveSession(db, sessionUserOf(await getSession())),
    headers: requestHeaders,
  });
}

/** Calls the API from server components, once per request. */
export const serverApi = cache(async () =>
  createCallerFactory(portalRouter)(await createPortalContext(new Headers(await headers()))),
);

/** The agent API as the person an MCP token stands for (no browser session: the token is the sign-in). */
export const agentCallerFor = (user: SessionUser, requestHeaders: Headers) =>
  createCallerFactory(agentRouter)(
    createContext({
      db,
      chain: chain(),
      app: "artist",
      session: { user },
      headers: requestHeaders,
    }),
  );
