"use client";

import { Coins } from "lucide-react";
import { useState } from "react";

import { Button } from "@actiontokens/ui/components/button";
import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { cn } from "@actiontokens/ui/lib/cn";
import { EmptyState } from "@actiontokens/ui/patterns/empty-state";
import { ErrorState } from "@actiontokens/ui/patterns/error-state";
import { PageBody, PageHeader } from "@actiontokens/ui/patterns/page-header";
import { ToastViewport, TransactionToast } from "@actiontokens/ui/patterns/transaction-toast";

import { timeAgo } from "~/lib/format";
import { api } from "~/trpc/react";

import { PayoutForm } from "./payout-form";
import { PayoutHistory } from "./payout-history";
import { useRoyaltyPayout } from "./use-royalty-payout";

/** Royalty: share what a royalty item earned with the fans who hold it. */
export function RoyaltyView() {
  const items = api.royalty.items.useQuery();
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const flow = useRoyaltyPayout(() => setRound((n) => n + 1));

  const item = items.data?.find((entry) => entry.id === (pickedId ?? items.data[0]?.id));

  return (
    <PageBody className="grid gap-6">
      <PageHeader
        eyebrow="Sell"
        title="Pay royalties"
        description="Share what a royalty item earned with the fans who hold it."
      />

      {items.isPending ? (
        <Skeleton className="h-64 w-full rounded-[1.4rem]" />
      ) : items.isError ? (
        <ErrorState
          message="Couldn't load your royalty items."
          onRetry={() => void items.refetch()}
        />
      ) : !item ? (
        <EmptyState
          icon={Coins}
          title="No royalty items yet"
          description="Make one in Items → New → Royalty share. Fans who buy it get a share of what it earns."
        />
      ) : (
        <div className="grid gap-6">
          {items.data.length > 1 && (
            <div role="radiogroup" aria-label="Which item?" className="flex flex-wrap gap-2">
              {items.data.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="radio"
                  aria-checked={entry.id === item.id}
                  disabled={flow.busy}
                  onClick={() => setPickedId(entry.id)}
                  className={cn(
                    "rounded-full border-2 px-3.5 py-1.5 text-sm font-medium transition-colors",
                    entry.id === item.id ? "border-primary bg-primary-soft" : "hover:bg-surface-2",
                  )}
                >
                  {entry.title}
                </button>
              ))}
            </div>
          )}
          <section className="bg-surface grid content-start gap-5 rounded-[1.4rem] border-2 p-5 sm:p-6">
            <div>
              <h2 className="display text-2xl">{item.title}</h2>
              {item.lastPayoutAt && (
                <p className="text-fg-muted text-sm">Last paid {timeAgo(item.lastPayoutAt)}</p>
              )}
            </div>
            <PayoutForm key={`${item.id}-${round}`} item={item} flow={flow} />
          </section>
        </div>
      )}

      <section className="grid gap-3">
        <h2 className="display text-2xl">Past payouts</h2>
        <PayoutHistory onResume={(id) => void flow.resumePayout(id)} busy={flow.busy} />
      </section>

      {flow.step && (
        <ToastViewport>
          <TransactionToast
            key={flow.step.kind}
            step={flow.step}
            onSend={flow.send}
            onCancel={flow.stop}
            actions={
              <Button
                size="sm"
                variant="secondary"
                className="h-8 px-3 text-[13px]"
                onClick={flow.step.kind === "confirm" ? flow.stop : flow.close}
              >
                {flow.step.kind === "confirm" ? "Cancel" : "Close"}
              </Button>
            }
          />
        </ToastViewport>
      )}
    </PageBody>
  );
}
