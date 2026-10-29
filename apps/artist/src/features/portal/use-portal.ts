"use client";

import { useSession } from "next-auth/react";

import { api, type RouterOutputs } from "~/trpc/react";

export type PortalStatus = RouterOutputs["portal"]["status"];

/**
 * Where the signed-in person stands in the portal: loading, signed out, or their
 * artist step. `initial` comes from the server render, so callers given it never
 * wait on the session first.
 */
export function usePortal(initial?: PortalStatus) {
  const { status } = useSession();
  const query = api.portal.status.useQuery(undefined, {
    enabled: status !== "loading" || initial !== undefined,
    initialData: initial,
  });
  const data = query.data;
  return {
    loading: !data && (status === "loading" || query.isPending),
    error: query.isError,
    signedIn: data?.signedIn === true,
    isAdmin: data?.signedIn === true && data.isAdmin,
    artist: data?.signedIn === true ? data.artist : null,
    step: data?.signedIn === true ? (data.artist?.step ?? null) : null,
  };
}
