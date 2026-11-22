"use client";

import { Crosshair, LogIn, Package, Search } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";

import { BrandMark } from "@actiontokens/ui/patterns/boot-screen";
import { useConnectWalletDialogStore } from "@actiontokens/wallet";

import { Money } from "~/components/money";
import { api, type RouterOutputs } from "~/trpc/react";

import { openSearch } from "../shell/search-dialog";
import { SidebarTools } from "../shell/sidebar-tools";

type Home = RouterOutputs["catalog"]["home"];

type Note = { key: string; href: string; icon: "drop" | "bounty"; title: string; text: string };

/** What the notch shows, newest first: real drops and running bounties from the home data. */
function notesFrom(home: Home): Note[] {
  const drops = home.drops.slice(0, 4).map((drop): Note => ({
    key: `d-${drop.id}`,
    href: `/item/${drop.slug}`,
    icon: "drop",
    title: `New drop · ${drop.artistName}`,
    text: drop.title,
  }));
  const bounties = home.bounties.slice(0, 3).map((bounty): Note => ({
    key: `b-${bounty.id}`,
    href: `/bounty/${bounty.id}`,
    icon: "bounty",
    title: `Bounty live · ${bounty.prize.amount} ${bounty.prize.code}`,
    text: bounty.title,
  }));
  // alternate, so the feed doesn't show four drops in a row
  const out: Note[] = [];
  for (let i = 0; i < Math.max(drops.length, bounties.length); i++) {
    if (drops[i]) out.push(drops[i]!);
    if (bounties[i]) out.push(bounties[i]!);
  }
  return out;
}

/**
 * The marketplace home's notch, after docs/mockups/home.html: the brand, search, your balance (or
 * Sign in) and the bell. Like an iPhone island it grows down every few seconds to show what's new
 * (a drop or a bounty), then folds back. Desktop only; phones have their own top bar.
 */
export function HomeNotch({ home }: { home: Home }) {
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const openWallet = useConnectWalletDialogStore((state) => state.setIsOpen);
  const me = api.account.me.useQuery(undefined, { enabled: signedIn });
  const balances = me.data?.balances;
  const notes = notesFrom(home);
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (notes.length === 0) return;
    let hide = 0;
    const show = () => {
      if (document.hidden) return;
      setOpen(true);
      hide = window.setTimeout(() => setOpen(false), 2600);
    };
    const first = window.setTimeout(show, 1200);
    const id = window.setInterval(() => {
      if (document.hidden) return;
      setIndex((value) => (value + 1) % notes.length);
      show();
    }, 4000);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(hide);
      window.clearInterval(id);
    };
  }, [notes.length]);

  const note = notes[index];
  return (
    <header className="lp-top hm-notch max-sm:!hidden" data-open={(open && !!note) || undefined}>
      <Link href="/" className="flex items-center gap-2" aria-label="Action-Tokens home">
        <span className="gx-logo grid size-9 place-items-center rounded-xl bg-white">
          <BrandMark className="h-6" />
        </span>
        <span className="gx-brand text-[1.2rem]! max-lg:hidden">Action-Tokens</span>
      </Link>
      <button type="button" onClick={openSearch} className="hm-notch-search">
        <Search className="size-4 shrink-0" />
        <span className="truncate">Search drops, bounties, orgs…</span>
        <kbd>⌘K</kbd>
      </button>
      {signedIn ? (
        <>
          <Link href="/wallet" className="hm-notch-bal" aria-label="Wallet">
            <i aria-hidden />
            {balances ? (
              <>
                <Money amount={balances.ACTION} currency="ACTION" short />
                <span className="text-fg-faint max-xl:hidden">
                  · <Money amount={balances.XLM} currency="XLM" short />
                </span>
              </>
            ) : (
              "…"
            )}
          </Link>
          <SidebarTools />
        </>
      ) : (
        <button
          type="button"
          onClick={() => openWallet(true)}
          className="lp-cta !h-10 !px-4 !text-[1.05rem]"
        >
          <LogIn className="size-4" strokeWidth={2.4} /> Sign in
        </button>
      )}

      <div className="lp-feed" data-open={(open && !!note) || undefined} aria-live="polite">
        {note && (
          <Link key={note.key} href={note.href} className="lp-feed-item" tabIndex={open ? 0 : -1}>
            <span className="bg-primary text-primary-ink grid size-9 shrink-0 place-items-center rounded-xl">
              {note.icon === "drop" ? (
                <Package className="size-[18px]" />
              ) : (
                <Crosshair className="size-[18px]" />
              )}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <b className="block truncate text-[12px]">{note.title}</b>
              <span className="text-fg-muted block truncate text-[12px]">{note.text}</span>
            </span>
          </Link>
        )}
      </div>
    </header>
  );
}
