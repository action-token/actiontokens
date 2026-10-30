"use client";

import { useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { Skeleton } from "@bandcoin/ui/components/skeleton";

import { Money } from "~/components/money";
import { api, type RouterOutputs } from "~/trpc/react";

import { PayToOpen } from "../payments/pay-to-open";
import { useStorageWithdraw } from "./use-storage-withdraw";

type Holding = NonNullable<RouterOutputs["profile"]["storageContents"]>["holdings"][number];

/** What storage holds, one row each, with "Take out" to move some into the wallet. */
export function StorageContents() {
  const contents = api.profile.storageContents.useQuery();
  const [open, setOpen] = useState<string | null>(null);

  if (contents.isPending)
    return (
      <div className="grid gap-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  if (!contents.data) return null;

  return (
    <div className="grid gap-2">
      <p className="text-sm font-semibold">What&apos;s in storage</p>
      <ul className="divide-y rounded-xl border">
        {contents.data.holdings.map((holding) => {
          const key = `${holding.code}:${holding.issuer ?? ""}`;
          const empty = Number(holding.amount) <= 0;
          return (
            <li key={key} className="grid gap-3 p-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{holding.title ?? holding.code}</p>
                  {holding.title && (
                    <p className="text-fg-muted font-mono text-xs">{holding.code}</p>
                  )}
                </div>
                <span className="num text-sm">
                  {holding.issuer === null ? (
                    <Money amount={holding.amount} currency="XLM" />
                  ) : (
                    Number(holding.amount).toLocaleString("en-US", { maximumFractionDigits: 7 })
                  )}
                </span>
                {!empty && open !== key && (
                  <Button size="sm" variant="outline" onClick={() => setOpen(key)}>
                    Take out
                  </Button>
                )}
              </div>
              {open === key && <TakeOut holding={holding} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TakeOut({ holding }: { holding: Holding }) {
  const [amount, setAmount] = useState("");
  const typed = amount.trim();
  const input = { code: holding.code, issuer: holding.issuer, amount: typed || "0" };
  const quote = api.profile.withdrawQuote.useQuery(input, {
    enabled: typed !== "",
    placeholderData: (previous) => previous,
  });
  const flow = useStorageWithdraw(input);

  return (
    <div className="grid gap-3 border-t pt-3">
      <label className="grid gap-1 text-sm">
        How much to move to your wallet
        <span className="flex gap-2">
          <Input
            inputMode="decimal"
            value={amount}
            placeholder="0"
            onChange={(event) => setAmount(event.target.value)}
          />
          <Button type="button" variant="ghost" onClick={() => setAmount(holding.amount)}>
            All
          </Button>
        </span>
      </label>
      {typed !== "" && (
        <PayToOpen
          intro="It goes straight into your own wallet."
          quote={quote.data}
          loading={quote.isPending}
          flow={flow}
          action="move it"
        />
      )}
    </div>
  );
}
