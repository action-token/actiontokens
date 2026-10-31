"use client";

import {
  ArrowDownToLine,
  Check,
  Copy,
  ExternalLink,
  Layers,
  Plus,
  ReceiptText,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useState } from "react";
import QRCode from "react-qr-code";

import { Button } from "@bandcoin/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@bandcoin/ui/components/dialog";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@bandcoin/ui/components/tabs";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { StatusPill } from "@bandcoin/ui/patterns/status-pill";
import { useConnectWalletDialogStore } from "@bandcoin/wallet";

import { Money } from "~/components/money";
import { timeAgo } from "~/lib/format";
import { statusLabel, statusTone } from "~/lib/wallet";
import { api, type RouterOutputs } from "~/trpc/react";

import { ItemCard } from "../catalog/item-card";
import { ActivateWallet } from "../recharge/activate-wallet";

type Me = NonNullable<RouterOutputs["account"]["me"]>;

const CURRENCIES = ["BANDCOIN", "XLM", "USDC"] as const;
const ASSET_PREVIEW = 10;

/** Balances up top, then what went in and out, then what you own. */
export function WalletView() {
  const { status } = useSession();
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const me = api.account.me.useQuery(undefined, { enabled: status === "authenticated" });

  if (status === "unauthenticated") {
    return (
      <EmptyState
        icon={Wallet}
        title="Sign in to see your wallet"
        description="Your balances, payments and everything you own live here."
        action={<Button onClick={() => openSignIn(true)}>Sign in</Button>}
      />
    );
  }
  if (status === "loading" || me.isPending || !me.data)
    return <Skeleton className="h-48 rounded-2xl" />;

  return (
    <div className="grid gap-8">
      <Balances me={me.data} />
      {!me.data.activated && me.data.walletAddress && (
        <ActivateWallet address={me.data.walletAddress} />
      )}
      <Tabs defaultValue="history">
        <TabsList className="grid w-full max-w-sm grid-cols-2">
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
        </TabsList>
        <TabsContent value="history" className="pt-5">
          <History />
        </TabsContent>
        <TabsContent value="assets" className="pt-5">
          <Assets />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Balances({ me }: { me: Me }) {
  return (
    <section aria-label="Balances" className="bg-surface grid gap-5 rounded-2xl border p-5 sm:p-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {CURRENCIES.map((currency) => (
          <div key={currency} className="grid gap-1">
            <span className="eyebrow">{currency}</span>
            <Money
              amount={me.balances[currency]}
              currency={currency}
              short
              className="display text-[26px] leading-tight font-semibold"
            />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/recharge">
            <Plus /> Recharge
          </Link>
        </Button>
        {me.walletAddress && <ReceiveDialog address={me.walletAddress} />}
      </div>
    </section>
  );
}

function ReceiveDialog({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary">
          <ArrowDownToLine /> Receive
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Receive</DialogTitle>
          <DialogDescription>
            Send BANDCOIN, XLM or USDC on the Stellar network to this address.
          </DialogDescription>
        </DialogHeader>
        <div className="grid justify-items-center gap-4">
          <div className="rounded-xl bg-white p-3">
            <QRCode value={address} size={176} />
          </div>
          <code className="bg-surface-2 w-full rounded-md p-3 font-mono text-xs break-all">
            {address}
          </code>
          <Button
            variant="secondary"
            onClick={() =>
              void navigator.clipboard.writeText(address).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              })
            }
          >
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy address"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function History() {
  const history = api.wallet.history.useQuery();
  if (history.isPending) {
    return (
      <div className="grid gap-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-16 rounded-xl" />
        ))}
      </div>
    );
  }
  if (history.isError)
    return (
      <p className="text-danger text-sm">Couldn&apos;t load your history. Try again in a moment.</p>
    );
  if (history.data.length === 0) {
    return (
      <EmptyState
        icon={ReceiptText}
        title="No payments yet"
        description="Purchases, top-ups, swaps and bounty prizes show up here."
        action={
          <Button asChild variant="secondary">
            <Link href="/marketplace">Browse the marketplace</Link>
          </Button>
        }
      />
    );
  }
  return (
    <ul className="bg-surface divide-y rounded-2xl border">
      {history.data.map((entry) => (
        <li key={entry.id} className="flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{entry.title}</p>
            <p className="text-fg-faint text-xs">{timeAgo(entry.at)}</p>
          </div>
          <StatusPill tone={statusTone(entry.status)}>{statusLabel(entry.status)}</StatusPill>
          <span className="flex w-28 shrink-0 justify-end gap-1 text-sm font-semibold">
            <span aria-hidden>{entry.direction === "received" ? "+" : "−"}</span>
            <Money amount={entry.amount} currency={entry.currency} code={entry.code} />
          </span>
          {entry.explorerUrl ? (
            <a
              href={entry.explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="text-fg-muted hover:text-fg shrink-0"
              aria-label="View on Stellar Expert"
            >
              <ExternalLink className="size-4" />
            </a>
          ) : (
            <span className="size-4 shrink-0" />
          )}
        </li>
      ))}
    </ul>
  );
}

function Assets() {
  const collection = api.collection.mine.useQuery({});
  if (collection.isPending) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="aspect-[3/4] rounded-[1.4rem]" />
        ))}
      </div>
    );
  }
  const items = collection.data?.items ?? [];
  if (items.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="Nothing here yet"
        description="Songs, tickets, fan tokens and merch you own show up here."
        action={
          <Button asChild variant="secondary">
            <Link href="/marketplace">Browse the marketplace</Link>
          </Button>
        }
      />
    );
  }
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {items.slice(0, ASSET_PREVIEW).map((item) => (
          <ItemCard key={item.id} item={item} queue={items} />
        ))}
      </div>
      <Button asChild variant="secondary" className="w-fit">
        <Link href="/collection">
          See all {collection.data?.total.toLocaleString()} in your collection
        </Link>
      </Button>
    </div>
  );
}
