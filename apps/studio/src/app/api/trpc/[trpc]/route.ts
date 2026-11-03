import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { studioRouter } from "@bandcoin/api";

import { createStudioContext } from "~/server/api";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: studioRouter,
    createContext: () => createStudioContext(req.headers),
    onError:
      process.env.NODE_ENV === "development"
        ? ({ path, error }) =>
            console.error(`tRPC failed on ${path ?? "<no-path>"}: ${error.message}`)
        : undefined,
  });

export { handler as GET, handler as POST };
