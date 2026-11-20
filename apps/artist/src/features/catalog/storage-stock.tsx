"use client";

import { Archive } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@actiontokens/ui/components/button";
import { Input } from "@actiontokens/ui/components/input";
import { Skeleton } from "@actiontokens/ui/components/skeleton";

import { api } from "~/trpc/react";

import { PayToOpen } from "../payments/pay-to-open";
import { useStorageStock } from "./use-storage-stock";

/**
 * Copies of this item kept ready in the artist's storage, as bandfan did:
 * sales and pin claims take from here before minting new ones. Optional, so
 * it starts folded: how many wait in storage, and one button to add more.
 */
export function StorageStock({ itemId }: { itemId: string }) {
  const profile = api.profile.overview.useQuery();
  const [adding, setAdding] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const valid = Number.isInteger(quantity) && quantity >= 1;
  const quote = api.profile.stockQuote.useQuery(
    { itemId, quantity: valid ? quantity : 1 },
    { enabled: Boolean(profile.data?.storageAccount), placeholderData: (previous) => previous },
  );
  const flow = useStorageStock({ itemId, quantity });

  if (profile.isPending)
    return <Skeleton className="h-28 rounded-[1.4rem]" aria-label="Loading storage copies" />;
  if (!profile.data) return null;
  const stock = quote.data?.stock;

  return (
    <section className="bg-surface border-fg/10 grid gap-3 rounded-[1.4rem] border-2 p-5">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Archive className="size-4" /> Copies in storage
      </p>
      {!profile.data.storageAccount ? (
        <>
          <p className="text-fg-muted text-sm">
            Keep copies ready in your storage account. Without it, copies are made when fans buy.
          </p>
          <Button asChild variant="outline" size="sm" className="justify-self-start">
            <Link href="/settings?tab=accounts">Open storage</Link>
          </Button>
        </>
      ) : (
        <>
          <p className="num text-sm">
            <b>{stock?.inStorage ?? "…"}</b> waiting
            {stock?.mintable != null && (
              <span className="text-fg-muted"> · {stock.mintable} more can be made</span>
            )}
          </p>
          {adding ? (
            <>
              <label className="grid gap-1 text-sm">
                How many to add
                <Input
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={Number.isNaN(quantity) ? "" : quantity}
                  onChange={(event) => setQuantity(event.target.valueAsNumber)}
                />
              </label>
              <PayToOpen
                intro="Your issuer makes the copies straight into storage. Sales and pin claims take from here first."
                quote={valid ? quote.data : undefined}
                loading={!valid || quote.isPending}
                flow={flow}
                action="add them"
              />
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="justify-self-start"
              onClick={() => setAdding(true)}
            >
              Add copies
            </Button>
          )}
        </>
      )}
    </section>
  );
}
