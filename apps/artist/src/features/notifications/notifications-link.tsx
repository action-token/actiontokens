"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";

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

/** The Notifications entry in the phone menu. */
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
      className={MENU_ROW}
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

/** A quick row in the phone menu (the floating card): an ink chip, yellow when current. */
export const MENU_ROW =
  "bg-side-ink/[0.06] text-side-ink aria-[current=page]:bg-side-mint aria-[current=page]:text-primary-foreground flex h-11 items-center gap-3 rounded-2xl px-3.5 text-sm font-semibold transition-colors hover:bg-side-ink/10";
