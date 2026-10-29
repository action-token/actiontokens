"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { useConnectWalletDialogStore } from "@bandcoin/wallet";

import { api } from "~/trpc/react";

/**
 * Keeps the page in step with who is signed in. When the account changes
 * (sign in, sign out, switch), every cached query is refetched, server-rendered
 * pages are refreshed, and the sign-in dialog closes after a successful sign-in.
 * Without this the page keeps showing what it loaded before signing in.
 */
export function SessionSync() {
  const { data, status } = useSession();
  const userId = status === "loading" ? undefined : (data?.user?.id ?? null);
  const previous = useRef<string | null | undefined>(undefined);
  const utils = api.useUtils();
  const router = useRouter();
  const closeDialog = useConnectWalletDialogStore((state) => state.setIsOpen);

  useEffect(() => {
    if (userId === undefined) return;
    const before = previous.current;
    previous.current = userId;
    if (before === undefined || before === userId) return;
    void utils.invalidate();
    router.refresh();
    if (userId) closeDialog(false);
  }, [userId, utils, router, closeDialog]);

  return null;
}
