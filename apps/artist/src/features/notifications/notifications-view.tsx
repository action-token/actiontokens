"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useRef } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@bandcoin/ui/components/avatar";
import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { cn } from "@bandcoin/ui/lib/cn";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";

import { timeAgo } from "~/lib/format";
import { api } from "~/trpc/react";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

/**
 * What fans did that you should know: follows, likes and comments on your
 * posts, sales, memberships, bounty joins and submissions. 20 at a time;
 * opening the page marks them seen, and what was new stays marked while
 * you're here.
 */
export function NotificationsView() {
  const utils = api.useUtils();
  const list = api.notifications.page.useInfiniteQuery(
    {},
    { getNextPageParam: (page) => page.next ?? undefined },
  );
  const markSeen = api.notifications.markSeen.useMutation({
    onSuccess: () => utils.notifications.latest.invalidate(),
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
    <PageBody className="grid gap-6">
      <PageHeader
        eyebrow="Fans"
        title="Notifications"
        description="Follows, likes, comments, sales and bounty activity from your fans."
      />
      {list.isPending ? (
        <div className="grid gap-2">
          {[0, 1, 2, 3].map((key) => (
            <Skeleton key={key} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : list.isError ? (
        <ErrorState
          message="Couldn't load your notifications."
          onRetry={() => void list.refetch()}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Nothing yet"
          description="When fans follow you, like or comment on a post, buy something or join a bounty, it shows up here."
          action={
            <Button asChild variant="secondary">
              <Link href="/posts/new">Write a post</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4">
          <ul className="bg-surface divide-y rounded-xl border">
            {items.map((entry) => (
              <li key={entry.id}>
                <Row href={entry.href}>
                  <Avatar className="size-10 shrink-0">
                    {entry.avatarUrl && <AvatarImage src={entry.avatarUrl} alt="" />}
                    <AvatarFallback className="text-xs font-bold">
                      {initials(entry.actorName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="grid min-w-0 flex-1 gap-0.5">
                    <span className={cn("text-sm leading-snug", !entry.seen && "font-semibold")}>
                      {entry.text}
                    </span>
                    <span className="text-fg-faint text-xs">{timeAgo(entry.at)}</span>
                  </span>
                  {!entry.seen && (
                    <span aria-label="New" className="bg-primary size-2.5 shrink-0 rounded-full" />
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
      )}
    </PageBody>
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
