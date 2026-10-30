"use client";

import { LogIn } from "lucide-react";

import { Button } from "@bandcoin/ui/components/button";
import { BrandMark } from "@bandcoin/ui/patterns/boot-screen";
import { copyrightLine, INFO_LINKS } from "@bandcoin/ui/patterns/site-links";
import { useConnectWalletDialogStore } from "@bandcoin/wallet";

import { FAN_APP_URL } from "./links";

/**
 * Signed out, as in Wadzzo's brand portal: no sidebar, one card that says
 * what the portal is for and opens the sign-in dialog (email, Google, Apple
 * or a Stellar wallet). Every portal address shows it until you sign in.
 */
export function SignInScreen() {
  const open = useConnectWalletDialogStore((state) => state.setIsOpen);
  return (
    <div className="bg-bg flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="bg-surface border-fg/10 w-full max-w-sm rounded-[1.6rem] border-2 p-8 text-center shadow-[8px_9px_0_0_var(--color-primary)]">
        <span className="bg-fg text-bg mx-auto mb-5 flex size-14 -rotate-3 items-center justify-center rounded-2xl">
          <BrandMark className="size-7" />
        </span>
        <p className="marker text-primary-text text-sm">artist portal</p>
        <h1 className="display mt-1 text-4xl">Sign in to Bandcoin</h1>
        <p className="text-fg-muted mt-2 text-sm text-pretty">
          Sell songs and collectibles, set up memberships, drop pins and bounties, and keep every
          payout.
        </p>
        <Button size="lg" className="mt-6 w-full" onClick={() => open(true)}>
          <LogIn className="size-5" strokeWidth={2.6} /> Sign in / Sign up
        </Button>
      </div>
      <p className="text-fg-faint flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs">
        {INFO_LINKS.map((info) => (
          <a
            key={info.path}
            href={`${FAN_APP_URL}${info.path}`}
            target="_blank"
            rel="noreferrer"
            className="hover:text-fg hover:underline"
          >
            {info.label}
          </a>
        ))}
        <span>{copyrightLine()}</span>
      </p>
    </div>
  );
}
