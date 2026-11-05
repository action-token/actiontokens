"use client";

import { Coins, Library, Plus, Sparkles } from "lucide-react";
import { useSession } from "next-auth/react";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { TallText } from "@bandcoin/ui/patterns/tall-text";
import { WalletHero } from "@bandcoin/ui/patterns/wallet-blocks";
import { useConnectWalletDialogStore } from "@bandcoin/wallet";

import { api } from "~/trpc/react";

import { CoinHistory } from "./history";
import { TopUp } from "./top-up";

/**
 * Your coins, laid out like the wallet: the balance block (Top up, Create,
 * Library), then topping up and the history. One coin is one cent.
 */
export function CoinsView() {
  const { status } = useSession();
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const balance = api.coins.balance.useQuery(undefined, { enabled: status === "authenticated" });

  if (status === "unauthenticated")
    return (
      <div className="px-4 py-10 sm:px-8">
        <EmptyState
          icon={Coins}
          title="Sign in to buy coins"
          description="Studio coins pay for each run. One coin is one cent."
          action={<Button onClick={() => openSignIn(true)}>Sign in</Button>}
        />
      </div>
    );

  const coins = balance.data?.coins;
  return (
    <div className="mx-auto grid max-w-5xl gap-8 px-4 py-8 sm:px-8">
      <h1 className="sr-only">Coins</h1>
      <WalletHero
        label="your Studio coins"
        address={null}
        balance={
          coins === undefined ? (
            <Skeleton className="bg-side-ink/15 h-20 w-64" />
          ) : (
            <TallText className="pb-[0.12em] text-7xl tabular-nums sm:text-8xl">
              {coins.toLocaleString("en-US")} <span className="text-[0.45em]">coins</span>
            </TallText>
          )
        }
        below={
          coins !== undefined && (
            <p className="text-side-ink/75 text-sm font-semibold">
              Worth ${(coins / 100).toFixed(2)} · one coin is one cent · coins stay in Studio
            </p>
          )
        }
        actions={[
          { id: "top-up", label: "Top up", icon: Plus, primary: true, href: "#top-up" },
          { id: "create", label: "Create", icon: Sparkles, href: "/" },
          { id: "library", label: "Library", icon: Library, href: "/library" },
        ]}
      />
      <div id="top-up" className="scroll-mt-6">
        <TopUp />
      </div>
      <CoinHistory />
    </div>
  );
}
