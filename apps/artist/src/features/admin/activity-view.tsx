"use client";

import { ListChecks } from "lucide-react";
import { useState } from "react";

import { abbreviateAddress } from "@bandcoin/utils/address";
import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";
import { StatusPill } from "@bandcoin/ui/patterns/status-pill";

import { timeAgo } from "~/lib/format";
import { api } from "~/trpc/react";

/** Every change made on the platform, newest first: who, what, on what, and whether it worked. */
export function ActivityView() {
  const [failedOnly, setFailedOnly] = useState(false);
  const log = api.admin.activity.list.useInfiniteQuery(
    { limit: 50, failedOnly: failedOnly || undefined },
    { getNextPageParam: (page) => page.nextCursor ?? undefined },
  );
  const items = log.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <PageBody className="grid gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Activity"
        description="Every change on Bandcoin, from every app."
        actions={
          <Button variant={failedOnly ? "default" : "secondary"} size="sm" onClick={() => setFailedOnly((value) => !value)} aria-pressed={failedOnly}>
            Failed only
          </Button>
        }
      />

      {log.isPending ? (
        <div className="grid gap-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : log.isError ? (
        <ErrorState message="Couldn't load the activity log." onRetry={() => void log.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={ListChecks} title="Nothing yet" description={failedOnly ? "No failed actions." : "Changes will show up here as they happen."} />
      ) : (
        <>
          <ul className="bg-surface divide-y rounded-xl border">
            {items.map((item) => (
              <li key={item.id} className="grid gap-1 px-4 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4">
                <div className="min-w-0">
                  <p className="truncate">
                    <b>{item.actor}</b> <span className="text-fg-muted">·</span> <code className="text-[13px]">{item.action}</code>
                  </p>
                  <p className="text-fg-faint truncate text-xs">
                    {[item.target, item.amount && `${item.amount} ${item.currency ?? ""}`.trim(), item.txHash && `tx ${abbreviateAddress(item.txHash, 6)}`, item.app]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill tone={item.status === "SUCCESS" ? "success" : "danger"}>{item.status === "SUCCESS" ? "Done" : (item.errorCode ?? "Failed")}</StatusPill>
                  <time className="text-fg-faint text-xs whitespace-nowrap" dateTime={new Date(item.createdAt).toISOString()}>
                    {timeAgo(item.createdAt)}
                  </time>
                </div>
              </li>
            ))}
          </ul>
          {log.hasNextPage && (
            <Button variant="secondary" className="justify-self-center" disabled={log.isFetchingNextPage} onClick={() => void log.fetchNextPage()}>
              {log.isFetchingNextPage ? "Loading…" : "Show older"}
            </Button>
          )}
        </>
      )}
    </PageBody>
  );
}
