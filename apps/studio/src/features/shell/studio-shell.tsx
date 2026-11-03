"use client";

import { AudioLines, Coins, LogIn, LogOut, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import type { ReactNode } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { cn } from "@bandcoin/ui/lib/cn";
import { BrandMark } from "@bandcoin/ui/patterns/boot-screen";
import { useConnectWalletDialogStore } from "@bandcoin/wallet";

import { api } from "~/trpc/react";

const NAV = [
  { href: "/", label: "Studio", icon: Sparkles },
  { href: "/music", label: "Music", icon: AudioLines },
  { href: "/coins", label: "Coins", icon: Coins },
];

/** Studio's frame: the name, Studio and Coins, your coin balance and your account. */
export function StudioShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { status } = useSession();
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const balance = api.coins.balance.useQuery(undefined, {
    enabled: status === "authenticated",
    staleTime: 15_000,
  });

  return (
    <div className="min-h-dvh">
      <header className="bg-surface/90 sticky top-0 z-30 border-b backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Studio home">
            <span className="bg-fg text-bg flex size-9 -rotate-3 items-center justify-center rounded-lg">
              <BrandMark className="size-5" />
            </span>
            <span className="hidden leading-none sm:block">
              <span className="display block text-lg">Bandcoin</span>
              <span className="marker text-primary-text mt-0.5 block text-[11px]">studio</span>
            </span>
          </Link>
          <nav aria-label="Main" className="ml-2 flex gap-1">
            {NAV.map((entry) => {
              const active =
                entry.href === "/" ? pathname === "/" : pathname.startsWith(entry.href);
              return (
                <Link
                  key={entry.href}
                  href={entry.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors",
                    active ? "bg-surface-2 text-fg" : "text-fg-muted hover:text-fg",
                  )}
                >
                  <entry.icon className="size-4" /> {entry.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {status === "authenticated" && (
              <Link
                href="/coins"
                className="bg-primary-soft text-primary-text flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-bold tabular-nums"
                title="Your Studio coins"
              >
                <Coins className="size-4" />
                {balance.data ? balance.data.coins.toLocaleString("en-US") : "…"}
              </Link>
            )}
            {status === "loading" ? (
              <Skeleton className="h-9 w-24 rounded-full" />
            ) : status === "authenticated" ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void signOut({ callbackUrl: "/" })}
                aria-label="Sign out"
              >
                <LogOut />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
            ) : (
              <Button size="sm" onClick={() => openSignIn(true)}>
                <LogIn /> Sign in
              </Button>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">{children}</main>
    </div>
  );
}
