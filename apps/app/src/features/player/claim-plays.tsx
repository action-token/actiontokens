"use client";

import { useSession } from "next-auth/react";
import { useEffect, useRef } from "react";

import { api } from "~/trpc/react";

import { existingListeningSession } from "./listening-id";

/** On sign-in, once per page load: the plays this browser made as a guest move onto the account. */
export function ClaimPlays() {
  const { status } = useSession();
  const utils = api.useUtils();
  const claim = api.music.claimPlays.useMutation({
    onSuccess: ({ claimed }) => {
      if (claimed > 0) void utils.music.recent.invalidate();
    },
  });
  const done = useRef(false);
  useEffect(() => {
    if (status !== "authenticated" || done.current) return;
    done.current = true;
    const sessionId = existingListeningSession();
    if (sessionId) claim.mutate({ sessionId });
  }, [status, claim]);
  return null;
}
