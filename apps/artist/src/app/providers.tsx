"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

import { ConnectWalletPopups } from "@bandcoin/wallet";

import { SessionSync } from "~/features/account/session-sync";
import { TRPCReactProvider } from "~/trpc/react";

/** Client providers shared by every page. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem disableTransitionOnChange>
      <SessionProvider>
        <TRPCReactProvider>
          {children}
          {/* the connect dialog and the toaster every wallet and payment toast uses */}
          <ConnectWalletPopups className="" />
          <SessionSync />
        </TRPCReactProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
