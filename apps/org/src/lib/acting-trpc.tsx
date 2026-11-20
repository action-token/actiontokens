"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchStreamLink } from "@trpc/client";
import { type ReactNode, useState } from "react";
import superjson from "superjson";

import { api } from "~/trpc/react";

/**
 * Runs everything below it as another artist (plan 45, Admin › All maps): its own query cache,
 * so the artist's data never mixes with the admin's own pages, and a client that sends
 * `x-acting-artist`. The server honours the header only for an admin, only for an approved
 * artist, and only on the pin, hotspot, layer, shape and assistant APIs. Mount it with
 * `key={organizationId}` so each artist gets a fresh cache.
 */
export function ActingTRPCProvider({
  organizationId,
  children,
}: {
  organizationId: string;
  children: ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 15_000 } },
      }),
  );
  const [client] = useState(() =>
    api.createClient({
      links: [
        httpBatchStreamLink({
          url: "/api/trpc",
          transformer: superjson,
          headers: () => ({ "x-acting-artist": organizationId }),
        }),
      ],
    }),
  );
  return (
    <api.Provider client={client} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  );
}
