"use client";

import { ExternalLink, LogIn, LogOut } from "lucide-react";
import { signOut, useSession } from "next-auth/react";

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
import { cn } from "@actiontokens/ui/lib/cn";
import { abbreviateAddress } from "@actiontokens/utils/address";
import { useConnectWalletDialogStore } from "@actiontokens/wallet";

import { api } from "~/trpc/react";

import { FAN_APP_URL } from "../shell/links";

/** Sign in, or the account menu when signed in. `rail` keeps only the avatar on the narrow sidebar. */
export function AccountButton({
  rail = false,
  compact = false,
}: {
  rail?: boolean;
  /** Phone header: just the round avatar (or a Sign in icon), no name */
  compact?: boolean;
}) {
  const { status } = useSession();
  const openDialog = useConnectWalletDialogStore((state) => state.setIsOpen);
  const me = api.account.me.useQuery(undefined, { enabled: status === "authenticated" });

  if (status === "loading" || (status === "authenticated" && me.isPending)) {
    return <Skeleton className={compact ? "size-9 rounded-full" : "h-10 w-full rounded-full"} />;
  }
  if (status === "unauthenticated" || !me.data) {
    if (compact)
      return (
        <Button
          size="sm"
          aria-label="Sign in"
          title="Sign in"
          onClick={() => openDialog(true)}
          className="h-9 shrink-0"
        >
          Sign in
        </Button>
      );
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
            "bg-surface hover:bg-surface-2 flex items-center gap-2 rounded-full border pl-1 text-[13px] font-semibold transition-colors",
            compact ? "h-9 pr-1" : "h-10 w-full",
            !compact && (rail ? "justify-center pr-1 xl:justify-start xl:pr-3" : "pr-3"),
          )}
        >
          <Avatar className={compact ? "size-7" : "size-8"}>
            {me.data.avatarUrl && <AvatarImage src={me.data.avatarUrl} alt="" />}
            <AvatarFallback className="text-xs">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          {!compact && (
            <span className={cn("min-w-0 truncate", rail && "hidden xl:inline")}>{name}</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={compact ? "bottom" : rail ? "right" : "top"}
        align="end"
        className="w-60"
      >
        <DropdownMenuLabel className="grid gap-0.5 font-normal">
          <span className="text-fg truncate text-sm font-semibold">{name}</span>
          {me.data.organization && (
            <span className="text-fg-muted truncate text-xs">
              Organization: {me.data.organization.name}
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={FAN_APP_URL}>
            <ExternalLink /> Open Action Tokens
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void signOut({ redirect: false })}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
