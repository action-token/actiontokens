"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { type ReactNode, useEffect, useRef } from "react";

import { Button } from "@actiontokens/ui/components/button";
import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { cn } from "@actiontokens/ui/lib/cn";
import { EmptyState } from "@actiontokens/ui/patterns/empty-state";
import { useConnectWalletDialogStore } from "@actiontokens/wallet";

import { timeAgo } from "~/lib/format";
import { api } from "~/trpc/react";

import { Avatar } from "../shell/context-panel";

/**
 * Every notification, 20 at a time. What was unread when you arrived stays
 * marked while you're here; opening the page marks it all seen.
 */
export function NotificationsView() {
  const { status } = useSession();
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const utils = api.useUtils();
  const list = api.notification.page.useInfiniteQuery(
    {},
    { getNextPageParam: (page) => page.next, enabled: status === "authenticated" },
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

  if (status === "unauthenticated")
    return (
      <EmptyState
        icon={Bell}
        title="Sign in to see your notifications"
        description="New posts from organizations you follow, replies, bounty news and more."
        action={<Button onClick={() => openSignIn(true)}>Sign in</Button>}
      />
    );
  if (status === "loading" || list.isPending)
    return (
      <div className="grid gap-2">
        {[0, 1, 2, 3].map((key) => (
          <Skeleton key={key} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );

  const items = list.data?.pages.flatMap((page) => page.items) ?? [];
  if (items.length === 0)
    return (
      <EmptyState
        icon={Bell}
        title="No notifications yet"
        description="Follow organizations and join bounties: their news shows up here."
        action={
          <Button asChild variant="secondary">
            <Link href="/marketplace">Find organizations</Link>
          </Button>
        }
      />
    );

  return (
    <div className="grid gap-4">
      <ul className="bg-surface divide-y rounded-[1.2rem] border">
        {items.map((entry) => (
          <li key={entry.id}>
            <Row href={entry.href}>
              <Avatar
                name={entry.actorName}
                url={entry.avatarUrl}
                className="bg-surface-3 grid size-10 shrink-0 place-items-center rounded-full object-cover text-xs font-bold"
              />
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className={cn("text-sm leading-snug", !entry.seen && "font-semibold")}>
                  {entry.text}
                </span>
                <span className="text-fg-faint text-xs">{timeAgo(entry.at)}</span>
              </span>
              {!entry.seen && (
                <span aria-label="Unread" className="bg-primary size-2.5 shrink-0 rounded-full" />
              )}
            </Row>
          </li>
        ))}
      </ul>
      {list.hasNextPage && (
        <Button
          variant="secondary"
          className="justify-self-center"
          disabled={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          {list.isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}

function Row({ href, children }: { href: string | null; children: ReactNode }) {
  const className = "flex items-center gap-3 px-4 py-3.5";
  return href ? (
    <Link href={href} className={cn(className, "hover:bg-surface-2 transition-colors")}>
      {children}
    </Link>
  ) : (
    <div className={className}>{children}</div>
  );
}
