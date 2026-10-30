"use client";

import { ListChecks } from "lucide-react";

import { abbreviateAddress } from "@bandcoin/utils/address";
import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { StatusPill } from "@bandcoin/ui/patterns/status-pill";

import { timeAgo } from "~/lib/format";
import { api, type RouterInputs } from "~/trpc/react";

type Filter = Omit<RouterInputs["admin"]["activity"]["list"], "cursor">;

/**
 * Rows from the activity log, newest first, with "Show older": who, what, on
 * what, and whether it worked. The Activity page shows everyone; the person
 * page passes `actorId` for one person's timeline.
 */
export function ActivityList({
  filter,
  emptyText,
  hideActor = false,
}: {
  filter: Filter;
  emptyText: string;
  hideActor?: boolean;
}) {
  const log = api.admin.activity.list.useInfiniteQuery(filter, {
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const items = log.data?.pages.flatMap((page) => page.items) ?? [];

  if (log.isPending)
    return (
      <div className="grid gap-2">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  if (log.isError)
    return (
      <ErrorState message="Couldn't load the activity log." onRetry={() => void log.refetch()} />
    );
  if (items.length === 0)
    return <EmptyState icon={ListChecks} title="Nothing yet" description={emptyText} />;

  return (
    <div className="grid gap-4">
      <ul className="bg-surface divide-y rounded-xl border">
        {items.map((item) => (
          <li
            key={item.id}
            className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4"
          >
            <div className="min-w-0">
              <p className="truncate">
                {!hideActor && (
                  <>
                    <b>{item.actor}</b> <span className="text-fg-muted">·</span>{" "}
                  </>
                )}
                <code className="text-[13px]">{item.action}</code>
              </p>
              <p className="text-fg-faint truncate text-xs">
                {[
                  item.target,
                  item.amount && `${item.amount} ${item.currency ?? ""}`.trim(),
                  item.txHash && `tx ${abbreviateAddress(item.txHash, 6)}`,
                  item.app,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill tone={item.status === "SUCCESS" ? "success" : "danger"}>
                {item.status === "SUCCESS" ? "Done" : (item.errorCode ?? "Failed")}
              </StatusPill>
              <time
                className="text-fg-faint text-xs whitespace-nowrap"
                dateTime={new Date(item.createdAt).toISOString()}
                title={new Date(item.createdAt).toLocaleString()}
              >
                {timeAgo(item.createdAt)}
              </time>
            </div>
          </li>
        ))}
      </ul>
      {log.hasNextPage && (
        <Button
          variant="secondary"
          className="justify-self-center"
          disabled={log.isFetchingNextPage}
          onClick={() => void log.fetchNextPage()}
        >
          {log.isFetchingNextPage ? "Loading…" : "Show older"}
        </Button>
      )}
    </div>
  );
}
