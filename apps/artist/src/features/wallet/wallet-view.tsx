"use client";

import {
  Archive,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Plus,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";

import { Money } from "~/components/money";
import { api } from "~/trpc/react";

import { RechargeView } from "../recharge/recharge-view";
import { orderMain, orderStorage, pageList, storagePreview } from "./holdings-order";

const MAIN = ["BANDCOIN", "XLM", "USDC"] as const;

type Kind = "xlm" | "bandcoin" | "usdc" | "fanToken" | "other";
type Holding = {
  code: string;
  issuer: string | null;
  amount: string;
  kind?: Kind;
  title?: string | null;
};
type Row = { key: string; label: string; note?: string; value: ReactNode };

/** The main wallet's three balances (the account you sign in with). */
function useMainWallet() {
  return api.account.me.useQuery();
}

/** Everything in the main wallet; null when you aren't an approved artist yet. */
function useMainHoldings() {
  const contents = api.profile.walletContents.useQuery(undefined, { retry: false });
  return { ...contents, data: contents.isError ? null : contents.data };
}

/** What the creator storage account holds; null when it isn't open (or you aren't an approved artist). */
function useStorage() {
  const storage = api.profile.storageContents.useQuery(undefined, { retry: false });
  return { ...storage, data: storage.isError ? null : storage.data };
}

const keyOf = (holding: Holding) => `${holding.code}:${holding.issuer ?? ""}`;

function HoldingAmount({ holding }: { holding: Holding }) {
  if (holding.kind === "bandcoin") return <Money amount={holding.amount} currency="BANDCOIN" />;
  if (holding.kind === "usdc") return <Money amount={holding.amount} currency="USDC" />;
  if (holding.issuer === null) return <Money amount={holding.amount} currency="XLM" />;
  return <>{Number(holding.amount).toLocaleString("en-US", { maximumFractionDigits: 7 })}</>;
}

const rowOf = (holding: Holding): Row => ({
  key: keyOf(holding),
  label: holding.title ?? holding.code,
  note: holding.kind === "fanToken" ? "Your fan token" : undefined,
  value: <HoldingAmount holding={holding} />,
});

/**
 * Wallet: the main wallet and the creator storage account side by side, then
 * Recharge (the same as the fan app's). Moving things between the two stays in
 * Settings › Balances.
 */
export function WalletView() {
  return (
    <PageBody className="grid gap-8">
      <PageHeader
        eyebrow="Money"
        title="Wallet"
        description="Your main wallet and your creator storage, and adding funds."
      />
      <div className="grid items-start gap-4 md:grid-cols-2">
        <MainWalletCard />
        <StorageCard />
      </div>
      <section id="recharge" className="grid scroll-mt-6 gap-4">
        <h2 className="display text-xl">Recharge</h2>
        <RechargeView />
      </section>
    </PageBody>
  );
}

function Card({
  icon: Icon,
  title,
  note,
  children,
}: {
  icon: typeof Wallet;
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <section className="bg-surface grid content-start gap-3 rounded-[1.2rem] border-2 p-5">
      <div className="grid gap-0.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="text-primary-text size-4" /> {title}
        </h2>
        <p className="text-fg-muted text-xs">{note}</p>
      </div>
      {children}
    </section>
  );
}

/** The first 10 rows, with "Show all" for the rest. */
function Rows({ rows }: { rows: Row[] }) {
  const [all, setAll] = useState(false);
  const { shown, hidden } = pageList(rows, all);
  return (
    <div className="grid gap-2">
      <dl className="divide-y rounded-xl border">
        {shown.map((row) => (
          <div
            key={row.key}
            className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
          >
            <dt className="min-w-0">
              <span className="text-fg-muted block truncate">{row.label}</span>
              {row.note && <span className="text-fg-faint block text-[11px]">{row.note}</span>}
            </dt>
            <dd className="num shrink-0 font-semibold">{row.value}</dd>
          </div>
        ))}
      </dl>
      {hidden > 0 && (
        <button
          type="button"
          aria-expanded={all}
          onClick={() => setAll(!all)}
          className="text-fg-muted hover:text-fg flex items-center gap-1 justify-self-start text-xs font-semibold"
        >
          {all ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          {all ? "Show fewer" : `Show all (${rows.length})`}
        </button>
      )}
    </div>
  );
}

function MainWalletCard() {
  const me = useMainWallet();
  const holdings = useMainHoldings();
  // Approved artists see everything the wallet holds; anyone else the three balances.
  const rows: Row[] | null = holdings.data
    ? orderMain(holdings.data.holdings).map(rowOf)
    : me.data && !holdings.isPending
      ? MAIN.map((currency) => ({
          key: currency,
          label: currency,
          value: <Money amount={me.data!.balances[currency]} currency={currency} />,
        }))
      : null;

  return (
    <Card icon={Wallet} title="Main wallet" note="The account you sign in with. You pay from here.">
      {rows ? <Rows rows={rows} /> : <Skeleton className="h-28 w-full" />}
      <Button asChild size="sm" className="justify-self-start">
        <a href="#recharge">
          <Plus /> Recharge
        </a>
      </Button>
    </Card>
  );
}

function StorageCard() {
  const storage = useStorage();
  return (
    <Card
      icon={Archive}
      title="Creator storage"
      note="Holds what you give away: gifts, pin rewards and bounty prizes."
    >
      {storage.isPending ? (
        <Skeleton className="h-28 w-full" />
      ) : !storage.data ? (
        <p className="text-fg-muted bg-surface-2 rounded-xl p-3 text-sm">
          Storage isn&apos;t open yet. Open it under Settings › Accounts.
        </p>
      ) : (
        <Rows rows={orderStorage(storage.data.holdings).map(rowOf)} />
      )}
      <Button asChild size="sm" variant="outline" className="justify-self-start">
        <Link href="/settings?tab=balances">
          Move between wallet and storage <ArrowRight />
        </Link>
      </Button>
    </Card>
  );
}

/** The sidebar's summary of both accounts; the whole card opens Wallet. */
export function WalletSidebarCard() {
  const me = useMainWallet();
  const storage = useStorage();
  const { shown, more } = storagePreview(storage.data?.holdings ?? []);

  return (
    <Link
      href="/wallet"
      aria-label="Balances: open Wallet"
      className="group bg-surface-2/60 hover:bg-surface-2 hover:border-border-strong hidden gap-2 rounded-xl border p-3 transition-colors xl:grid"
    >
      <div className="flex items-center justify-between">
        <span className="text-fg-faint text-[11px] font-semibold tracking-wider uppercase">
          Main wallet
        </span>
        <span className="bg-surface text-fg-muted group-hover:text-fg flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold">
          Wallet{" "}
          <ChevronRight className="size-3 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
      {!me.data ? (
        <Skeleton className="h-12 w-full" />
      ) : (
        <dl className="grid gap-0.5">
          {MAIN.map((currency) => (
            <div key={currency} className="flex items-center justify-between gap-2 text-[12px]">
              <dt className="text-fg-muted">{currency}</dt>
              <dd className="num truncate font-semibold">
                <Money amount={me.data!.balances[currency]} currency={currency} />
              </dd>
            </div>
          ))}
        </dl>
      )}
      {storage.data && (
        <div className="grid gap-0.5 border-t pt-2">
          <span className="text-fg-faint text-[11px] font-semibold tracking-wider uppercase">
            Creator storage
          </span>
          {shown.length === 0 ? (
            <span className="text-fg-muted text-[12px]">Empty</span>
          ) : (
            <dl className="grid gap-0.5">
              {shown.map((holding) => (
                <div
                  key={keyOf(holding)}
                  className="flex items-center justify-between gap-2 text-[12px]"
                >
                  <dt className="text-fg-muted min-w-0 truncate">{holding.code}</dt>
                  <dd className="num truncate font-semibold">
                    <HoldingAmount holding={holding} />
                  </dd>
                </div>
              ))}
              {more > 0 && <span className="text-fg-faint text-[11px]">and {more} more</span>}
            </dl>
          )}
        </div>
      )}
    </Link>
  );
}
