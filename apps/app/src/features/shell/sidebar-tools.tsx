"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { type ReactNode, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@bandcoin/ui/components/popover";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { cn } from "@bandcoin/ui/lib/cn";
import { sideIconButton } from "@bandcoin/ui/patterns/side-frame";

import { timeAgo } from "~/lib/format";
import { api } from "~/trpc/react";

import { Avatar } from "./context-panel";

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
          className={sideIconButton}
        >
          <Bell className="size-4" strokeWidth={2.6} />
          {unread > 0 && (
            <span className="bg-danger border-side absolute -top-1 -right-1 grid h-[18px] min-w-[18px] place-items-center rounded-full border-2 px-1 text-[10px] font-bold text-white">
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
