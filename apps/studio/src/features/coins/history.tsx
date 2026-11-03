"use client";

import { History } from "lucide-react";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { cn } from "@bandcoin/ui/lib/cn";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";

import { timeAgo } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

type Entry = RouterOutputs["coins"]["ledger"]["entries"][number];

const KIND: Record<Entry["kind"], string> = {
  DEPOSIT: "Top-up",
  BONUS: "Bonus",
  SPEND: "Spent",
  REFUND: "Refund",
  WITHDRAW: "Withdrawn",
  MIGRATED: "Carried over",
};

/** Every top-up, bonus, spend and refund, newest first. */
export function CoinHistory() {
  const ledger = api.coins.ledger.useInfiniteQuery(
    {},
    { getNextPageParam: (page) => page.next ?? undefined },
  );
  const entries = ledger.data?.pages.flatMap((page) => page.entries) ?? [];

  return (
    <section className="grid gap-4">
      <h2 className="display text-xl">History</h2>
      {ledger.isPending ? (
        <div className="grid gap-2">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          icon={History}
          title="No coins yet"
          description="Top-ups, and what each run spends, show up here."
        />
      ) : (
        <>
          <ul className="bg-surface divide-y rounded-xl border">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-4 py-3">
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="text-sm font-semibold">
                    {KIND[entry.kind]}
                    {entry.status === "PENDING" && (
                      <span className="text-fg-faint ml-2 text-xs font-normal">running</span>
                    )}
                  </span>
                  <span className="text-fg-muted truncate text-xs">
                    {entry.note ?? entry.generation?.prompt ?? ""} · {timeAgo(entry.createdAt)}
                  </span>
                </span>
                <span
                  className={cn(
                    "text-sm font-bold tabular-nums",
                    entry.amount > 0 ? "text-success" : "text-fg",
                  )}
                >
                  {entry.amount > 0 ? "+" : ""}
                  {entry.amount.toLocaleString("en-US")}
                </span>
              </li>
            ))}
          </ul>
          {ledger.hasNextPage && (
            <Button
              variant="secondary"
              className="justify-self-center"
              disabled={ledger.isFetchingNextPage}
              onClick={() => void ledger.fetchNextPage()}
            >
              {ledger.isFetchingNextPage ? "Loading…" : "Load more"}
            </Button>
          )}
        </>
      )}
    </section>
  );
}
