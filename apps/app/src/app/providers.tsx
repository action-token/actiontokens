"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

import { SharedThemeSync } from "@bandcoin/ui/patterns/shared-theme-sync";

import { ConnectWalletPopups } from "@bandcoin/wallet";

import { SessionSync } from "~/features/account/session-sync";
import { BootLoader } from "~/features/boot/boot-loader";
import { TRPCReactProvider } from "~/trpc/react";

/** Client providers shared by every page. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="data-theme"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <SharedThemeSync />
      <SessionProvider>
        <TRPCReactProvider>
          {children}
          {/* the connect dialog and the toaster every wallet and payment toast uses */}
          <ConnectWalletPopups className="" />
          <SessionSync />
          {/* the stage loader on every full page load */}
          <BootLoader />
        </TRPCReactProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
