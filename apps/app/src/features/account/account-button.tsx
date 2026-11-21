"use client";

import { Check, Copy, Layers, LogOut, Settings, UserRound, Wallet } from "lucide-react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@actiontokens/ui/components/avatar";
import { Button } from "@actiontokens/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@actiontokens/ui/components/dropdown-menu";
import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { abbreviateAddress } from "@actiontokens/utils/address";
import { useConnectWalletDialogStore } from "@actiontokens/wallet";

import { Money } from "~/components/money";
import { api, type RouterOutputs } from "~/trpc/react";

type Me = NonNullable<RouterOutputs["account"]["me"]>;

/** The phone top bar's sign-in button, or, when signed in, the account menu with balances. */
export function AccountButton() {
  const { status } = useSession();
  const openDialog = useConnectWalletDialogStore((state) => state.setIsOpen);
  const me = api.account.me.useQuery(undefined, { enabled: status === "authenticated" });

  if (status === "loading" || (status === "authenticated" && me.isPending)) {
    return <Skeleton className="h-10 w-36 rounded-full" />;
  }
  if (status === "unauthenticated" || !me.data) {
    return <Button onClick={() => openDialog(true)}>Sign in</Button>;
  }
  return <AccountMenu me={me.data} />;
}

function AccountMenu({ me }: { me: Me }) {
  const name = me.displayName ?? me.username ?? abbreviateAddress(me.walletAddress ?? undefined);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="bg-surface hover:bg-surface-2 flex h-10 items-center gap-2 rounded-full border pr-3 pl-1 text-[13px] font-semibold whitespace-nowrap transition-colors"
        >
          <Avatar className="size-8">
            {me.avatarUrl && <AvatarImage src={me.avatarUrl} alt="" />}
            <AvatarFallback className="text-xs">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <Money
            amount={me.balances.ACTION}
            currency="ACTION"
            short
            className="hidden sm:inline-flex"
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <AccountMenuItems me={me} name={name} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Who you are, your balances and the account links; goes inside a DropdownMenuContent. */
export function AccountMenuItems({ me, name }: { me: Me; name: string }) {
  return (
    <>
      <DropdownMenuLabel className="grid gap-1 font-normal">
        <span className="text-fg truncate text-sm font-semibold">{name}</span>
        {me.walletAddress && <CopyAddress address={me.walletAddress} />}
      </DropdownMenuLabel>
      <dl className="grid grid-cols-3 gap-2 px-2 pb-2">
        {(["ACTION", "XLM", "USDC"] as const).map((currency) => (
          <div key={currency} className="bg-surface-2 grid gap-0.5 rounded-sm px-2 py-1.5">
            <dt className="text-fg-faint text-[11px] font-medium">{currency}</dt>
            <dd className="truncate text-sm font-semibold">
              <Money amount={me.balances[currency]} currency={currency} short />
            </dd>
          </div>
        ))}
      </dl>
      {!me.activated && (
        <p className="text-warning px-2 pb-2 text-xs">
          Your wallet isn&apos;t active yet. Add XLM to start.
        </p>
      )}
      <DropdownMenuSeparator />
      {me.username && (
        <DropdownMenuItem asChild>
          <Link href={`/u/${me.username}`}>
            <UserRound /> Your profile
          </Link>
        </DropdownMenuItem>
      )}
      <DropdownMenuItem asChild>
        <Link href="/collection">
          <Layers /> My collection
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link href="/wallet">
          <Wallet /> Wallet
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link href="/settings">
          <Settings /> Settings
        </Link>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => void signOut({ redirect: false })}>
        <LogOut /> Sign out
      </DropdownMenuItem>
    </>
  );
}

function CopyAddress({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="text-fg-muted hover:text-fg flex w-fit items-center gap-1.5 font-mono text-xs"
      onClick={(event) => {
        event.preventDefault();
        void navigator.clipboard.writeText(address).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {abbreviateAddress(address, 6)}
      {copied ? <Check className="text-success size-3.5" /> : <Copy className="size-3.5" />}
      <span className="sr-only">{copied ? "Copied" : "Copy address"}</span>
    </button>
  );
}
