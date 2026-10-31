"use client";

import { Music2, Plus, Trophy, Users } from "lucide-react";
import Link from "next/link";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";
import { StatusPill } from "@bandcoin/ui/patterns/status-pill";

import { Money } from "~/components/money";
import { api, type RouterOutputs } from "~/trpc/react";

type Row = RouterOutputs["bounties"]["list"][number];

export const statusLabel = (row: Pick<Row, "funded" | "status" | "hiddenAt">) =>
  row.hiddenAt
    ? "Hidden by admin"
    : !row.funded
      ? "Not funded"
      : row.status === "RUNNING"
        ? "Running"
        : row.status === "PAUSED"
          ? "Paused"
          : "Completed";
export const statusTone = (row: Pick<Row, "funded" | "status" | "hiddenAt">) =>
  row.hiddenAt
    ? "danger"
    : !row.funded
      ? "warning"
      : row.status === "RUNNING"
        ? "success"
        : "neutral";

/** Your bounties, newest first. A draft whose funding never finished says so. */
export function BountiesView() {
  const bounties = api.bounties.list.useQuery();

  const add = (
    <Button asChild>
      <Link href="/bounties/new">
        <Plus /> New bounty
      </Link>
    </Button>
  );

  return (
    <PageBody className="grid gap-6">
      <PageHeader
        eyebrow="Fans"
        title="Bounties"
        description="Challenges with a prize held in escrow. Fans join and submit; you pick the winners."
        actions={bounties.data && bounties.data.length > 0 ? add : undefined}
      />
      {bounties.isPending ? (
        <Skeleton className="h-40 w-full max-w-3xl rounded-xl" />
      ) : bounties.isError ? (
        <ErrorState
          message="Couldn't load your bounties."
          onRetry={() => void bounties.refetch()}
        />
      ) : bounties.data.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No bounties yet"
          description="Set a challenge and a prize, and let your fans compete."
          action={add}
        />
      ) : (
        <ul className="grid max-w-3xl gap-3">
          {bounties.data.map((row) => (
            <li key={row.id}>
              <Link
                href={`/bounties/${row.id}`}
                className="bg-surface hover:bg-surface-2 grid gap-2 rounded-xl border p-4 transition-colors sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="display min-w-0 text-lg">{row.title}</h3>
                  <StatusPill tone={statusTone(row)}>{statusLabel(row)}</StatusPill>
                </div>
                {row.summary && <p className="text-fg-muted line-clamp-2 text-sm">{row.summary}</p>}
                <p className="text-fg-muted flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="flex items-center gap-1.5">
                    <Trophy className="size-4" />{" "}
                    <Money
                      amount={row.prizeAmount}
                      currency={row.prizeCurrency as "BANDCOIN" | "XLM" | "USDC"}
                    />
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Users className="size-4" /> {row.participants} joined · {row.submissions}{" "}
                    report{row.submissions === 1 ? "" : "s"} · {row.winners}/{row.maxWinners}{" "}
                    winners
                  </span>
                  {row.hasMusic && (
                    <span className="flex items-center gap-1.5">
                      <Music2 className="size-4" /> Music
                    </span>
                  )}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageBody>
  );
}
