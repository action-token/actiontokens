import { type ChainGateway, createChainGateway, createContext, liveSession } from "@bandcoin/api";
import { sessionUserOf } from "@bandcoin/auth";
import { db } from "@bandcoin/db/server";

import { getSession } from "./auth";

let gateway: ChainGateway | null = null;
/** Created on first use, so a missing chain setting fails the request that needs it, not the build. */
const chain = () => (gateway ??= createChainGateway(db));

/** The tRPC context for one request: the session, chain access and request facts for the activity log. */
export async function createStudioContext(requestHeaders: Headers) {
  return createContext({
    db,
    chain: chain(),
    app: "studio",
    session: await liveSession(db, sessionUserOf(await getSession())),
    headers: requestHeaders,
  });
}
