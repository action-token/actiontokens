"use client";

import { Bell, CheckCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@bandcoin/ui/components/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@bandcoin/ui/components/popover";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { cn } from "@bandcoin/ui/lib/cn";
import { sideIconButton } from "@bandcoin/ui/patterns/side-frame";

import { timeAgo } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

import { useUnreadNotifications } from "./notifications-link";

type Entry = RouterOutputs["notifications"]["latest"]["items"][number];

/** How many the bell's list shows before "View all". */
const SHOWN = 8;

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

/**
 * The bell in the sidebar header, as in Wadzzo's brand portal: an unread
 * badge, and a short list with "Mark all read" and a link to everything.
 */
export function NotificationBell({
  className,
  side = "bottom",
  align = "end",
}: {
  className?: string;
  side?: "bottom" | "right";
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const unread = useUnreadNotifications();
  const utils = api.useUtils();
  const list = api.notifications.latest.useQuery(undefined, { enabled: open });
  const markAllRead = api.notifications.markSeen.useMutation({
    onSuccess: () =>
      Promise.all([utils.notifications.latest.invalidate(), utils.notifications.page.invalidate()]),
  });
  const items = list.data?.items.slice(0, SHOWN) ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(sideIconButton, className)}
        aria-label={unread ? `Notifications (${unread} unread)` : "Notifications"}
      >
        <Bell className="size-[18px]" strokeWidth={2.6} />
        {unread > 0 && (
          <span className="bg-danger ring-side absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ring-2">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent side={side} align={align} className="w-[min(24rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="display text-sm">Notifications</p>
          <button
            type="button"
            disabled={!unread || markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
            className="text-primary-text inline-flex items-center gap-1 text-xs font-medium hover:underline disabled:pointer-events-none disabled:opacity-40"
          >
            <CheckCheck className="size-3.5" />
            {markAllRead.isPending ? "Marking…" : "Mark all read"}
          </button>
        </div>
        <div className="max-h-[min(26rem,70dvh)] overflow-y-auto p-1.5">
          {list.isPending ? (
            <div className="space-y-2 p-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="text-fg-muted px-4 py-10 text-center text-sm">
              You&apos;re all caught up.
            </p>
          ) : (
            items.map((entry) => (
              <BellRow key={entry.id} entry={entry} onNavigate={() => setOpen(false)} />
            ))
          )}
        </div>
        <Link
          href="/notifications"
          onClick={() => setOpen(false)}
          className="text-primary-text hover:bg-surface-2 block border-t px-4 py-2.5 text-center text-sm font-medium"
        >
          View all
        </Link>
      </PopoverContent>
    </Popover>
  );
}

function BellRow({ entry, onNavigate }: { entry: Entry; onNavigate: () => void }) {
  const body = (
    <>
      <Avatar className="size-9 shrink-0">
        {entry.avatarUrl && <AvatarImage src={entry.avatarUrl} alt="" />}
        <AvatarFallback className="text-[11px] font-bold">
          {initials(entry.actorName)}
        </AvatarFallback>
      </Avatar>
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span
          className={cn("line-clamp-2 text-[13px] leading-snug", !entry.seen && "font-semibold")}
        >
          {entry.text}
        </span>
        <span className="text-fg-faint text-[11px]">{timeAgo(entry.at)}</span>
      </span>
      {!entry.seen && <span aria-label="New" className="bg-primary size-2 shrink-0 rounded-full" />}
    </>
  );
  const className = "flex items-center gap-3 rounded-lg px-2.5 py-2";
  return entry.href ? (
    <Link href={entry.href} onClick={onNavigate} className={cn(className, "hover:bg-surface-2")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
