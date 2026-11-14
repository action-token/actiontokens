"use client";

import { ChevronDown, ListChecks, Music2, Plus, Trophy, Users } from "lucide-react";
import Link from "next/link";

import { Button } from "@bandcoin/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@bandcoin/ui/components/dropdown-menu";
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

  // Pick the kind first, as in the old app; the form can still switch music on or off.
  const add = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>
          <Plus /> New bounty <ChevronDown className="opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuLabel className="text-fg-muted text-xs">
          Choose a bounty type
        </DropdownMenuLabel>
        <BountyKind
          href="/bounties/new?type=general"
          icon={<ListChecks />}
          title="General bounty"
          text="Any task or challenge, with fans' submissions"
        />
        <BountyKind
          href="/bounties/new?type=music"
          icon={<Music2 />}
          title="Music bounty"
          text="Fans listen to your tracks on Last.fm"
        />
      </DropdownMenuContent>
    </DropdownMenu>
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
        <ul className="grid gap-3">
          {bounties.data.map((row) => (
            <li key={row.id}>
              <Link
                href={`/bounties/${row.id}`}
                className="bg-surface hover:bg-surface-2 grid gap-2 rounded-xl border p-4 transition-colors sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="display min-w-0 text-2xl">{row.title}</h3>
                  <StatusPill tone={statusTone(row)}>{statusLabel(row)}</StatusPill>
                </div>
                {row.summary && <p className="text-fg-muted line-clamp-2 text-sm">{row.summary}</p>}
                <p className="text-fg-muted flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="flex items-center gap-1.5">
                    <Trophy className="size-4" />{" "}
                    <Money
                      amount={row.prizeAmount}
                      currency={row.prize.currency}
                      code={row.prize.code}
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

function BountyKind(props: { href: string; icon: React.ReactNode; title: string; text: string }) {
  return (
    <DropdownMenuItem asChild className="py-2.5">
      <Link href={props.href} className="flex items-center gap-3">
        <span className="bg-surface-3 grid size-8 shrink-0 place-items-center rounded-lg [&_svg]:size-4">
          {props.icon}
        </span>
        <span className="min-w-0">
          <b className="block text-sm">{props.title}</b>
          <span className="text-fg-muted block text-xs">{props.text}</span>
        </span>
      </Link>
    </DropdownMenuItem>
  );
}
