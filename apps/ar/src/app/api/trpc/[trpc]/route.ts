import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { arRouter } from "@bandcoin/api";

import { createArContext } from "~/server/api";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: arRouter,
    createContext: () => createArContext(req.headers),
    onError:
      process.env.NODE_ENV === "development"
        ? ({ path, error }) =>
            console.error(`tRPC failed on ${path ?? "<no-path>"}: ${error.message}`)
        : undefined,
  });

export { handler as GET, handler as POST };
