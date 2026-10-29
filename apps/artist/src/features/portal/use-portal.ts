"use client";

import { useSession } from "next-auth/react";

import { api } from "~/trpc/react";

/** Where the signed-in person stands in the portal: loading, signed out, or their artist step. */
export function usePortal() {
  const { status } = useSession();
  const query = api.portal.status.useQuery(undefined, { enabled: status !== "loading" });
  const data = query.data;
  return {
    loading: status === "loading" || query.isPending,
    error: query.isError,
    signedIn: data?.signedIn === true,
    isAdmin: data?.signedIn === true && data.isAdmin,
    artist: data?.signedIn === true ? data.artist : null,
    step: data?.signedIn === true ? (data.artist?.step ?? null) : null,
  };
}
