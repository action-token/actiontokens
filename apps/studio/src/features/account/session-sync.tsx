"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { forgetAccountData, useConnectWalletDialogStore } from "@bandcoin/wallet";

/**
 * Keeps the page in step with who is signed in. When the account changes
 * (sign in, sign out, switch), every cached query is emptied and loaded again for the new account, server-rendered
 * pages are refreshed, and the sign-in dialog closes after a successful sign-in.
 * Without this the page keeps showing what it loaded before signing in.
 */
export function SessionSync() {
  const { data, status } = useSession();
  const userId = status === "loading" ? undefined : (data?.user?.id ?? null);
  const previous = useRef<string | null | undefined>(undefined);
  const queryClient = useQueryClient();
  const router = useRouter();
  const closeDialog = useConnectWalletDialogStore((state) => state.setIsOpen);

  useEffect(() => {
    if (userId === undefined) return;
    const before = previous.current;
    previous.current = userId;
    if (before === undefined || before === userId) return;
    void forgetAccountData(queryClient);
    router.refresh();
    if (userId) closeDialog(false);
  }, [userId, queryClient, router, closeDialog]);

  return null;
}
