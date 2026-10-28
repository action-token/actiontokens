import Link from "next/link";

import { BrandMark } from "@bandcoin/ui/patterns/boot-screen";

import { AccountButton } from "~/features/account/account-button";

/** Top bar until the full shell (sidebar, search, player) lands. */
export function AppHeader() {
  return (
    <header className="bg-bg/85 sticky top-0 z-30 border-b backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex items-center gap-2">
          <BrandMark className="size-7" />
          <span className="font-display text-[15px] font-extrabold tracking-tight">Bandcoin</span>
        </Link>
        <AccountButton />
      </div>
    </header>
  );
}
