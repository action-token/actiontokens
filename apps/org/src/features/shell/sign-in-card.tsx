"use client";

import { LogIn } from "lucide-react";

import { Button } from "@actiontokens/ui/components/button";
import { BrandMark } from "@actiontokens/ui/patterns/boot-screen";
import { useConnectWalletDialogStore } from "@actiontokens/wallet";

/**
 * Signed out: the page beside the sidebar is one card that says what the
 * portal is for and opens the sign-in dialog (email, Google, Apple or a
 * Stellar wallet). Every portal address shows it until you sign in.
 */
export function SignInCard() {
  const open = useConnectWalletDialogStore((state) => state.setIsOpen);
  return (
    <div className="flex min-h-[calc(100dvh-7rem)] flex-col items-center justify-center gap-6 px-4 py-10 sm:min-h-dvh">
      <div className="bg-surface border-fg/10 w-full max-w-sm rounded-[1.6rem] border-2 p-8 text-center shadow-[8px_9px_0_0_var(--color-primary)]">
        <span className="bg-fg text-bg mx-auto mb-5 flex size-14 -rotate-3 items-center justify-center rounded-2xl">
          <BrandMark className="size-7" />
        </span>
        <p className="marker text-primary-text text-sm">artist portal</p>
        <h1 className="display mt-1 text-5xl">Sign in to Action Tokens</h1>
        <p className="text-fg-muted mt-2 text-sm text-pretty">
          Sell songs and collectibles, set up memberships, drop pins and bounties, and keep every
          payout.
        </p>
        <Button size="lg" className="mt-6 w-full" onClick={() => open(true)}>
          <LogIn className="size-5" strokeWidth={2.6} /> Sign in / Sign up
        </Button>
      </div>
    </div>
  );
}
