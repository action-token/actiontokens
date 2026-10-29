"use client";

import { ExternalLink, LogIn, LogOut } from "lucide-react";
import { signOut, useSession } from "next-auth/react";

import { Avatar, AvatarFallback, AvatarImage } from "@bandcoin/ui/components/avatar";
import { Button } from "@bandcoin/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@bandcoin/ui/components/dropdown-menu";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { cn } from "@bandcoin/ui/lib/cn";
import { abbreviateAddress } from "@bandcoin/utils/address";
import { useConnectWalletDialogStore } from "@bandcoin/wallet";

import { api } from "~/trpc/react";

import { FAN_APP_URL } from "../shell/links";

/** Sign in, or the account menu when signed in. `rail` keeps only the avatar on the narrow sidebar. */
export function AccountButton({ rail = false }: { rail?: boolean }) {
  const { status } = useSession();
  const openDialog = useConnectWalletDialogStore((state) => state.setIsOpen);
  const me = api.account.me.useQuery(undefined, { enabled: status === "authenticated" });

  if (status === "loading" || (status === "authenticated" && me.isPending)) {
    return <Skeleton className="h-10 w-full rounded-full" />;
  }
  if (status === "unauthenticated" || !me.data) {
    return (
      <Button className="w-full" title="Sign in" onClick={() => openDialog(true)}>
        {rail && <LogIn className="xl:hidden" />}
        <span className={cn(rail && "hidden xl:inline")}>Sign in</span>
      </Button>
    );
  }

  const name =
    me.data.displayName ??
    me.data.username ??
    abbreviateAddress(me.data.walletAddress ?? undefined);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account menu"
          className={cn(
            "bg-surface hover:bg-surface-2 flex h-10 w-full items-center gap-2 rounded-full border pl-1 text-[13px] font-semibold transition-colors",
            rail ? "justify-center pr-1 xl:justify-start xl:pr-3" : "pr-3",
          )}
        >
          <Avatar className="size-8">
            {me.data.avatarUrl && <AvatarImage src={me.data.avatarUrl} alt="" />}
            <AvatarFallback className="text-xs">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <span className={cn("min-w-0 truncate", rail && "hidden xl:inline")}>{name}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={rail ? "right" : "top"} align="end" className="w-60">
        <DropdownMenuLabel className="grid gap-0.5 font-normal">
          <span className="text-fg truncate text-sm font-semibold">{name}</span>
          {me.data.artist && (
            <span className="text-fg-muted truncate text-xs">Artist: {me.data.artist.name}</span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={FAN_APP_URL}>
            <ExternalLink /> Open Bandcoin
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void signOut({ redirect: false })}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
