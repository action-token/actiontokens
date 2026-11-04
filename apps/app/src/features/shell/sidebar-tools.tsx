"use client";

import { Bell, ChevronRight, LogOut, Settings } from "lucide-react";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { type ReactNode, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@bandcoin/ui/components/popover";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { cn } from "@bandcoin/ui/lib/cn";

import { Money } from "~/components/money";
import { timeAgo } from "~/lib/format";
import { api } from "~/trpc/react";

import { Avatar } from "./context-panel";

/** A round dark button in the sidebar header (Search, Notifications). */
export const iconButton =
  "bg-fg text-bg relative flex size-9 shrink-0 items-center justify-center rounded-full transition-transform duration-200 hover:scale-110";

/** The bell, beside the search in the sidebar header. Signed-in only. */
export function SidebarTools({ className }: { className?: string }) {
  const { status } = useSession();
  if (status !== "authenticated") return null;
  return (
    <div className={cn("flex shrink-0 items-center gap-1.5", className)}>
      <NotificationsBell />
    </div>
  );
}

/** Settings and Log out, in the account card at the bottom of the sidebar. */
export function AccountActions({ className }: { className?: string }) {
  const actionClass =
    "text-fg-muted hover:text-fg hover:bg-surface-2 flex size-8 shrink-0 items-center justify-center rounded-full transition-colors";
  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      <Link href="/settings" aria-label="Settings" title="Settings" className={actionClass}>
        <Settings className="size-4" />
      </Link>
      <button
        type="button"
        aria-label="Log out"
        title="Log out"
        onClick={() => void signOut({ redirect: false })}
        className={actionClass}
      >
        <LogOut className="size-4" />
      </button>
    </div>
  );
}

/** The bell: a dot while something is unread; opening it lists the latest and marks them seen. */
function NotificationsBell() {
  const utils = api.useUtils();
  const latest = api.notification.latest.useQuery(undefined, { refetchInterval: 60_000 });
  const markSeen = api.notification.markSeen.useMutation({
    onSuccess: () => utils.notification.latest.invalidate(),
  });
  const unread = latest.data?.unread ?? 0;
  const [open, setOpen] = useState(false);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next && unread > 0 && !markSeen.isPending) markSeen.mutate();
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          title="Notifications"
          className={iconButton}
        >
          <Bell className="size-4" strokeWidth={2.6} />
          {unread > 0 && (
            <span className="bg-primary text-primary-foreground border-surface absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full border-2 px-0.5 text-[9px] font-bold">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" sideOffset={12} className="w-80 p-0">
        <h2 className="display border-b px-4 py-3 text-sm">Notifications</h2>
        <div className="grid max-h-96 overflow-y-auto p-1.5">
          {latest.isPending ? (
            <div className="grid gap-2 p-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !latest.data?.items.length ? (
            <p className="text-fg-muted px-3 py-8 text-center text-sm">No notifications yet.</p>
          ) : (
            latest.data.items.map((entry) => (
              <Row key={entry.id} href={entry.href}>
                <Avatar
                  name={entry.actorName}
                  url={entry.avatarUrl}
                  className="bg-surface-3 grid size-8 shrink-0 place-items-center rounded-full object-cover text-[10px] font-bold"
                />
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className={cn("text-[13px] leading-snug", !entry.seen && "font-semibold")}>
                    {entry.text}
                  </span>
                  <span className="text-fg-faint text-[11px]">{timeAgo(entry.at)}</span>
                </span>
                {!entry.seen && (
                  <span
                    aria-label="Unread"
                    className="bg-primary mt-1.5 size-2 shrink-0 rounded-full"
                  />
                )}
              </Row>
            ))
          )}
        </div>
        <Link
          href="/notifications"
          onClick={() => setOpen(false)}
          className="text-fg-muted hover:text-fg hover:bg-surface-2 block border-t px-4 py-2.5 text-center text-xs font-semibold"
        >
          See all
        </Link>
      </PopoverContent>
    </Popover>
  );
}

function Row({ href, children }: { href: string | null; children: ReactNode }) {
  const className = "flex items-start gap-3 rounded-lg p-2.5";
  return href ? (
    <Link href={href} className={cn(className, "hover:bg-surface-2")}>
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  );
}

/** Your balances, under the library links. Signed-in, wide sidebar only. */
export function BalanceCard() {
  const { status } = useSession();
  const me = api.account.me.useQuery(undefined, { enabled: status === "authenticated" });
  if (status !== "authenticated") return null;
  const balances = me.data?.balances;
  return (
    <Link
      href="/wallet"
      aria-label="Balance: open your wallet"
      className="group bg-surface-2/60 hover:border-border-strong hover:bg-surface-2 mx-1 mt-3 hidden gap-1.5 rounded-xl border p-3 transition-colors xl:grid"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-fg-faint text-[11px] font-semibold tracking-wider uppercase">
          Balance
        </h2>
        <span className="bg-surface text-fg-muted group-hover:text-fg flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-colors">
          Wallet{" "}
          <ChevronRight className="size-3 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
      {!balances ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <dl className="grid gap-1">
          {(["BANDCOIN", "XLM", "USDC"] as const).map((currency) => (
            <div key={currency} className="flex items-center justify-between gap-2 text-[13px]">
              <dt className="text-fg-muted">{currency}</dt>
              <dd className="num truncate font-semibold">
                <Money amount={balances[currency]} currency={currency} short />
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Link>
  );
}
