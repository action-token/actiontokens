"use client";

import { ChevronDown, Coins, FileText, RotateCw } from "lucide-react";
import { useState } from "react";

import { Badge } from "@actiontokens/ui/components/badge";
import { Button } from "@actiontokens/ui/components/button";
import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { cn } from "@actiontokens/ui/lib/cn";
import { EmptyState } from "@actiontokens/ui/patterns/empty-state";
import { ErrorState } from "@actiontokens/ui/patterns/error-state";

import { Money } from "~/components/money";
import { timeAgo } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

type Payout = RouterOutputs["royalty"]["history"][number];

const STATUS: Record<
  Payout["status"],
  { label: string; tone: "default" | "secondary" | "destructive" }
> = {
  DRAFT: { label: "Not sent", tone: "secondary" },
  SUBMITTING: { label: "Sending", tone: "secondary" },
  PARTIAL: { label: "Partly paid", tone: "destructive" },
  COMPLETE: { label: "Paid", tone: "default" },
  FAILED: { label: "Not paid", tone: "destructive" },
};

const short = (address: string) => `${address.slice(0, 5)}…${address.slice(-5)}`;

/** Every payout, newest first: who was paid, the report that went with it, and Resume for one that stopped halfway. */
export function PayoutHistory({
  onResume,
  busy,
}: {
  onResume: (payoutId: string) => void;
  busy: boolean;
}) {
  const history = api.royalty.history.useQuery();

  if (history.isPending) return <Skeleton className="h-24 w-full rounded-xl" />;
  if (history.isError)
    return (
      <ErrorState message="Couldn't load your payouts." onRetry={() => void history.refetch()} />
    );
  if (history.data.length === 0)
    return (
      <EmptyState
        icon={Coins}
        title="No payouts yet"
        description="Each payout and its report shows up here."
      />
    );

  return (
    <ul className="bg-surface divide-y overflow-hidden rounded-[1.4rem] border-2">
      {history.data.map((payout) => (
        <PayoutRow key={payout.id} payout={payout} onResume={onResume} busy={busy} />
      ))}
    </ul>
  );
}

function PayoutRow({
  payout,
  onResume,
  busy,
}: {
  payout: Payout;
  onResume: (payoutId: string) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const status = STATUS[payout.status];
  const unfinished =
    payout.status === "PARTIAL" ||
    payout.status === "SUBMITTING" ||
    (payout.status === "FAILED" && payout.paid > 0);

  return (
    <li>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left text-sm"
        >
          <ChevronDown
            className={cn(
              "text-fg-muted size-4 shrink-0 transition-transform",
              open && "rotate-180",
            )}
          />
          <span className="min-w-0">
            <span className="block truncate font-medium">{payout.item}</span>
            <span className="text-fg-muted text-xs">
              {timeAgo(payout.createdAt)} · {payout.paid} of {payout.holders} fans paid
            </span>
          </span>
        </button>
        <Money amount={payout.total} currency={payout.currency} className="text-sm font-semibold" />
        <Badge variant={status.tone}>{status.label}</Badge>
        {payout.report && (
          <a
            href={payout.report.fileUrl}
            target="_blank"
            rel="noreferrer"
            className="text-fg-muted hover:text-fg"
            aria-label={`Open report ${payout.report.fileName}`}
            title={payout.report.fileName}
          >
            <FileText className="size-4" />
          </a>
        )}
        {unfinished && (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => onResume(payout.id)}>
            <RotateCw /> Finish paying
          </Button>
        )}
      </div>
      {open && <Lines payoutId={payout.id} currency={payout.currency} />}
    </li>
  );
}

function Lines({ payoutId, currency }: { payoutId: string; currency: Payout["currency"] }) {
  const lines = api.royalty.lines.useQuery({ payoutId });
  if (lines.isPending) return <Skeleton className="m-4 h-16" />;
  if (lines.isError)
    return <p className="text-fg-muted px-4 pb-3 text-sm">Couldn&apos;t load the list.</p>;
  return (
    <ul className="bg-surface-2/40 max-h-72 divide-y overflow-y-auto border-t text-sm">
      {lines.data.map((line) => (
        <li key={line.id} className="flex items-center gap-3 px-4 py-2">
          <span className="num flex-1" title={line.holderAddress}>
            {short(line.holderAddress)}
          </span>
          <Money amount={line.amount} currency={currency} />
          <span
            className={cn(
              "w-14 text-right text-xs",
              line.status === "SENT"
                ? "text-success"
                : line.status === "FAILED"
                  ? "text-danger"
                  : "text-fg-muted",
            )}
          >
            {line.status === "SENT" ? "Paid" : line.status === "FAILED" ? "Failed" : "Waiting"}
          </span>
        </li>
      ))}
    </ul>
  );
}
