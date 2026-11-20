import { Bell } from "lucide-react";
import Link from "next/link";

import { useAuth } from "~/lib/ar/store";
import { cn } from "@actiontokens/ui/lib/cn";
import { api } from "~/trpc/react";

/**
 * ── NotificationsButton ────────────────────────────────────────────────────
 *
 * The bell beside the profile button on root screens, with a dot when there
 * is something new. Signed out there is nothing to show, so it isn't there.
 */
export function NotificationsButton({ className }: { className?: string }) {
  const signedIn = useAuth((s) => Boolean(s.user));
  const latest = api.notification.latest.useQuery(undefined, {
    enabled: signedIn,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  if (!signedIn) return null;
  const unread = latest.data?.unread ?? 0;

  return (
    <Link
      href="/notifications"
      aria-label={unread > 0 ? `Notifications, ${unread} new` : "Notifications"}
      className={cn(
        "ar-glass text-ar-dim relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
        "focus-visible:ring-ar-accent focus-visible:ring-2 focus-visible:outline-hidden",
        className,
      )}
    >
      <Bell size={16} strokeWidth={2.3} />
      {unread > 0 && (
        <span className="bg-ar-accent-hot ring-ar-void absolute top-1.5 right-1.5 h-2 w-2 rounded-full ring-2" />
      )}
    </Link>
  );
}
