"use client";

import { ArrowRight, Coins } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { useConnectWalletDialogStore } from "@bandcoin/wallet";

import { api } from "~/trpc/react";

import { priceLabel, TOOLS } from "./tools";

/** Studio's front page: your coins, and every tool with what one run costs. */
export function HomeView() {
  const { status } = useSession();
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const prices = api.coins.prices.useQuery();
  const balance = api.coins.balance.useQuery(undefined, { enabled: status === "authenticated" });

  return (
    <div className="grid gap-8">
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end">
        <div className="grid gap-3">
          <p className="marker text-primary-text text-sm">*make it with AI*</p>
          <h1 className="display text-4xl leading-tight sm:text-5xl">Bandcoin Studio</h1>
          <p className="text-fg-muted max-w-xl">
            Images, music, video and words for your releases. Every run shows its price before you
            start, in coins: one coin is one cent.
          </p>
        </div>
        <div className="bg-surface grid gap-3 rounded-[1.4rem] border-2 p-5">
          <p className="text-fg-muted flex items-center gap-2 text-sm font-semibold">
            <Coins className="text-primary-text size-4" /> Your coins
          </p>
          {status === "unauthenticated" ? (
            <>
              <p className="text-fg-muted text-sm">Sign in to see your coins and top up.</p>
              <Button onClick={() => openSignIn(true)}>Sign in</Button>
            </>
          ) : balance.data ? (
            <>
              <p className="display text-4xl tabular-nums">
                {balance.data.coins.toLocaleString("en-US")}
              </p>
              <p className="text-fg-faint text-xs">
                Worth ${(balance.data.coins / 100).toFixed(2)}
              </p>
              <Button asChild>
                <Link href="/coins">
                  Top up <ArrowRight />
                </Link>
              </Button>
            </>
          ) : (
            <Skeleton className="h-20 w-full" />
          )}
        </div>
      </section>

      <section aria-label="Tools" className="grid gap-4">
        <h2 className="display text-xl">Tools</h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((tool) => (
            <li key={tool.type} className="bg-surface grid gap-2 rounded-[1.2rem] border p-5">
              <span className="bg-primary-soft text-primary-text grid size-10 place-items-center rounded-xl">
                <tool.icon className="size-5" />
              </span>
              <h3 className="text-base font-semibold">{tool.label}</h3>
              <p className="text-fg-muted text-sm">{tool.hint}</p>
              <div className="text-fg-faint mt-1 flex flex-wrap items-center justify-between gap-2 text-xs">
                {prices.data ? (
                  priceLabel(prices.data[tool.type])
                ) : (
                  <Skeleton className="h-3 w-28" />
                )}
                {tool.href ? (
                  <Link
                    href={tool.href}
                    className="bg-primary text-primary-foreground rounded-full px-2.5 py-0.5 font-semibold"
                  >
                    Open
                  </Link>
                ) : (
                  <span className="bg-surface-2 rounded-full px-2 py-0.5 font-semibold">
                    Coming soon
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
