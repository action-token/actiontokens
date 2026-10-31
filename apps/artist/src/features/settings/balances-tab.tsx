"use client";

import { useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { Skeleton } from "@bandcoin/ui/components/skeleton";

import { Money } from "~/components/money";
import { api, type RouterOutputs } from "~/trpc/react";

import { useWalletPayment } from "../payments/use-wallet-payment";
import { PayToOpen } from "../payments/pay-to-open";
import { StorageContents } from "./storage-contents";

type Holding = NonNullable<RouterOutputs["profile"]["walletContents"]>["holdings"][number];

/** Settings › Balances: the wallet and storage side by side, moving things either way. */
export function BalancesTab({ storageOpen }: { storageOpen: boolean }) {
  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <WalletContents storageOpen={storageOpen} />
      {storageOpen ? (
        <StorageContents />
      ) : (
        <p className="text-fg-muted bg-surface rounded-xl border p-4 text-sm">
          Storage isn&apos;t open yet. Open it under Accounts. Bandcoin pays for it.
        </p>
      )}
    </div>
  );
}

function WalletContents({ storageOpen }: { storageOpen: boolean }) {
  const contents = api.profile.walletContents.useQuery();
  const [open, setOpen] = useState<string | null>(null);

  if (contents.isPending)
    return (
      <div className="grid gap-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  if (!contents.data)
    return <p className="text-fg-muted text-sm">Connect a wallet to see what it holds.</p>;

  return (
    <div className="grid content-start gap-2">
      <p className="text-sm font-semibold">In your wallet</p>
      <ul className="divide-y rounded-xl border">
        {contents.data.holdings.map((holding) => {
          const key = `${holding.code}:${holding.issuer ?? ""}`;
          const empty = Number(holding.amount) <= 0;
          return (
            <li key={key} className="grid gap-3 p-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-sm font-medium">{holding.code}</p>
                  {holding.fanToken && <p className="text-fg-muted text-xs">Your fan token</p>}
                </div>
                <span className="num text-sm">
                  {holding.issuer === null ? (
                    <Money amount={holding.amount} currency="XLM" />
                  ) : (
                    Number(holding.amount).toLocaleString("en-US", { maximumFractionDigits: 7 })
                  )}
                </span>
                {storageOpen && !empty && open !== key && (
                  <Button size="sm" variant="outline" onClick={() => setOpen(key)}>
                    Move to storage
                  </Button>
                )}
              </div>
              {open === key && <MoveIn holding={holding} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function MoveIn({ holding }: { holding: Holding }) {
  const [amount, setAmount] = useState("");
  const typed = amount.trim();
  const input = { code: holding.code, issuer: holding.issuer, amount: typed || "0" };
  const quote = api.profile.depositQuote.useQuery(input, {
    enabled: typed !== "",
    placeholderData: (previous) => previous,
  });
  const flow = useStorageDeposit(input);

  return (
    <div className="grid gap-3 border-t pt-3">
      <label className="grid gap-1 text-sm">
        How much to move to storage
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
          intro="It goes into your storage account, ready for gifts, pin rewards and bounties."
          quote={quote.data}
          loading={quote.isPending}
          flow={flow}
          action="move it"
        />
      )}
    </div>
  );
}

/** Paying to move something from the wallet into storage (see services/artist/storage-deposit). */
function useStorageDeposit(input: { code: string; issuer: string | null; amount: string }) {
  const utils = api.useUtils();
  const start = api.profile.depositStart.useMutation();
  const submit = api.profile.depositSubmit.useMutation();
  const cancel = api.profile.depositCancel.useMutation();

  return useWalletPayment({
    start: () => start.mutateAsync(input),
    submit: (sent) => submit.mutateAsync(sent),
    cancel: (sent) => cancel.mutateAsync(sent),
    preparing: "Preparing your payment…",
    sending: "Moving it to storage. This takes a few seconds.",
    success: { title: "Moved to storage", body: "It's in your storage account now." },
    onDone: () =>
      Promise.all([
        utils.profile.walletContents.invalidate(),
        utils.profile.storageContents.invalidate(),
        utils.account.me.invalidate(),
      ]),
  });
}
