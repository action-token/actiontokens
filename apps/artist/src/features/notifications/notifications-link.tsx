"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";

import { cn } from "@bandcoin/ui/lib/cn";

import { api } from "~/trpc/react";

/** Unread count for the artist's bell; checks again every minute while the portal is open. */
export function useUnreadNotifications() {
  const { status } = useSession();
  const latest = api.notifications.latest.useQuery(undefined, {
    enabled: status === "authenticated",
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  return latest.data?.unread ?? 0;
}

const countLabel = (unread: number) => (unread > 99 ? "99+" : String(unread));

/** The sidebar's Notifications entry: a bell with the unread count (icon and dot on the rail). */
export function NotificationsSideLink({ active }: { active: boolean }) {
  const unread = useUnreadNotifications();
  return (
    <Link
      href="/notifications"
      title={unread > 0 ? `Notifications, ${unread} new` : "Notifications"}
      aria-current={active ? "page" : undefined}
      className={cn(
        "display relative flex h-8 items-center justify-center gap-2 rounded-lg border-2 border-transparent text-[12.5px] transition-[background-color,transform] duration-150 xl:justify-start xl:px-2.5",
        active
          ? "bg-primary text-primary-foreground border-fg -rotate-1 shadow-[2px_3px_0_0_var(--color-fg)]"
          : "text-fg-muted hover:bg-surface-2 hover:text-fg hover:translate-x-0.5",
      )}
    >
      <Bell className="size-4 shrink-0" strokeWidth={2.4} />
      <span className="hidden truncate xl:inline">Notifications</span>
      {unread > 0 && (
        <>
          <span
            aria-hidden
            className="bg-danger ring-surface absolute top-0.5 right-[calc(50%-14px)] size-2 rounded-full ring-2 xl:hidden"
          />
          <span className="bg-danger ml-auto hidden min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5 font-bold text-white xl:inline">
            {countLabel(unread)}
          </span>
        </>
      )}
    </Link>
  );
}

/** The same entry in the phone menu. */
export function NotificationsMenuLink({
  active,
  onNavigate,
}: {
  active: boolean;
  onNavigate: () => void;
}) {
  const unread = useUnreadNotifications();
  return (
    <Link
      href="/notifications"
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className="text-fg-muted aria-[current=page]:bg-surface-2 aria-[current=page]:text-fg flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium"
    >
      <Bell className="size-[18px]" /> Notifications
      {unread > 0 && (
        <span className="bg-danger ml-auto min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5 font-bold text-white">
          {countLabel(unread)}
        </span>
      )}
    </Link>
  );
}
