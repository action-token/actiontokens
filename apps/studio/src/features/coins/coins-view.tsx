"use client";

import { Coins } from "lucide-react";
import { useSession } from "next-auth/react";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { useConnectWalletDialogStore } from "@bandcoin/wallet";

import { api } from "~/trpc/react";

import { CoinHistory } from "./history";
import { TopUp } from "./top-up";

/** Your coins: the balance, topping up, and the history. One coin is one cent. */
export function CoinsView() {
  const { status } = useSession();
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const balance = api.coins.balance.useQuery(undefined, { enabled: status === "authenticated" });

  if (status === "unauthenticated")
    return (
      <EmptyState
        icon={Coins}
        title="Sign in to buy coins"
        description="Studio coins pay for each run. One coin is one cent."
        action={<Button onClick={() => openSignIn(true)}>Sign in</Button>}
      />
    );

  return (
    <div className="mx-auto grid max-w-4xl gap-8">
      <header className="grid gap-2">
        <p className="marker text-primary-text text-sm">*coins*</p>
        <h1 className="display flex items-baseline gap-3 text-4xl">
          {balance.data ? (
            <span className="tabular-nums">{balance.data.coins.toLocaleString("en-US")}</span>
          ) : (
            <Skeleton className="h-10 w-28" />
          )}
          <span className="text-fg-muted text-xl">coins</span>
        </h1>
        <p className="text-fg-muted text-sm">
          One coin is one cent
          {balance.data ? `: worth $${(balance.data.coins / 100).toFixed(2)}` : ""}. Coins stay in
          Studio and can&apos;t be withdrawn.
        </p>
      </header>
      <TopUp />
      <CoinHistory />
    </div>
  );
}
