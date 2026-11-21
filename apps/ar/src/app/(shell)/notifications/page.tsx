"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useRef } from "react";

import { AppShell, ScreenHeader } from "~/components/shell/AppShell";
import { ArButton } from "~/components/ui/ArButton";
import { Skeleton } from "~/components/ui/Skeleton";
import { useAuth } from "~/lib/ar/store";
import { cn } from "@actiontokens/ui/lib/cn";
import { site } from "@actiontokens/ar-core/site";
import { api } from "~/trpc/react";

const ago = (value: Date | string) => {
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};

/**
 * ── /notifications ─────────────────────────────────────────────────────────
 *
 * The same notifications as the Bandcoin app's bell: new posts, releases and
 * bounties from artists you follow, replies, prizes. Bounties open here;
 * everything else opens in the Bandcoin app. Opening the screen marks them seen.
 */
export default function NotificationsScreen() {
  const signedIn = useAuth((s) => Boolean(s.user));
  const requireAuth = useAuth((s) => s.requireAuth);
  const utils = api.useUtils();
  const list = api.notification.page.useInfiniteQuery(
    {},
    { enabled: signedIn, getNextPageParam: (page) => page.next ?? undefined },
  );
  const markSeen = api.notification.markSeen.useMutation({
    onSuccess: () => utils.notification.latest.invalidate(),
  });
  const marked = useRef(false);
  const unread = list.data?.pages[0]?.unread ?? 0;

  useEffect(() => {
    if (marked.current || unread === 0) return;
    marked.current = true;
    markSeen.mutate();
  }, [unread, markSeen]);

  const items = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <AppShell>
      <div className="flex h-full flex-col">
        <ScreenHeader back eyebrow="Inbox" title="Notifications" />
        <div className="ar-scroll flex-1 px-5 pb-8">
          {!signedIn ? (
            <Empty text="Sign in to see news from the organizations you follow.">
              <ArButton
                variant="primary"
                size="md"
                className="mt-4"
                onClick={() => requireAuth("profile")}
              >
                Sign in
              </ArButton>
            </Empty>
          ) : list.isLoading ? (
            <div className="grid gap-2">
              {[0, 1, 2, 3].map((key) => (
                <Skeleton key={key} className="h-16 w-full rounded-[14px]" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <Empty text="Follow organizations and join bounties: their news shows up here." />
          ) : (
            <>
              <ul className="ar-bevel rounded-ar divide-ar-line divide-y overflow-hidden">
                {items.map((entry) => (
                  <li key={entry.id}>
                    <Row href={entry.href}>
                      {entry.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- profile photo
                        <img
                          src={entry.avatarUrl}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span className="bg-ar-surface text-ar-dim flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[12px] font-bold">
                          {entry.actorName.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span
                          className={cn(
                            "text-ar-text text-[13px] leading-snug",
                            !entry.seen && "font-semibold",
                          )}
                        >
                          {entry.text}
                        </span>
                        <span className="text-ar-faint text-[11px]">{ago(entry.at)}</span>
                      </span>
                      {!entry.seen && (
                        <span
                          aria-label="New"
                          className="bg-ar-accent-hot h-2.5 w-2.5 shrink-0 rounded-full"
                        />
                      )}
                    </Row>
                  </li>
                ))}
              </ul>
              {list.hasNextPage && (
                <div className="mt-5 flex justify-center">
                  <ArButton
                    variant="outline"
                    size="md"
                    disabled={list.isFetchingNextPage}
                    onClick={() => void list.fetchNextPage()}
                  >
                    {list.isFetchingNextPage ? "Loading…" : "Show more"}
                  </ArButton>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

/** Bounties have their own screen here; everything else opens in the Bandcoin app. */
function Row({ href, children }: { href: string | null; children: ReactNode }) {
  const className = "flex items-center gap-3 px-4 py-3.5";
  if (!href) return <div className={className}>{children}</div>;
  if (href.startsWith("/bounty/"))
    return (
      <Link href={href} className={cn(className, "transition-colors hover:bg-white/[0.04]")}>
        {children}
      </Link>
    );
  return (
    <a
      href={`${site.urls.fanApp}${href}`}
      target="_blank"
      rel="noreferrer"
      className={cn(className, "transition-colors hover:bg-white/[0.04]")}
    >
      {children}
    </a>
  );
}

function Empty({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className="rounded-ar mt-6 border-2 border-dashed border-[hsl(var(--st-line)/0.5)] px-6 py-8 text-center">
      <Bell size={28} strokeWidth={1.7} className="text-ar-accent-hot mx-auto" />
      <p className="text-ar-dim mx-auto mt-3 max-w-[16rem] text-[12.5px] leading-relaxed">{text}</p>
      {children}
    </div>
  );
}
