"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchStreamLink, loggerLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { type ReactNode, useState } from "react";
import superjson from "superjson";

import type { PortalRouter } from "@bandcoin/api";

export const api = createTRPCReact<PortalRouter>();

export type RouterInputs = inferRouterInputs<PortalRouter>;
export type RouterOutputs = inferRouterOutputs<PortalRouter>;

/** Query client and tRPC client, created once per browser tab (never at module scope). */
export function TRPCReactProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 15_000 } },
      }),
  );
  const [trpcClient] = useState(() =>
    api.createClient({
      links: [
        loggerLink({
          enabled: (op) =>
            process.env.NODE_ENV === "development" &&
            op.direction === "down" &&
            op.result instanceof Error,
        }),
        httpBatchStreamLink({ url: "/api/trpc", transformer: superjson }),
      ],
    }),
  );
  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  );
}
