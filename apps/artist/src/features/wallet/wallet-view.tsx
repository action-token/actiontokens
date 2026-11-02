"use client";

import { ArrowRight, Archive, ChevronRight, Plus, Wallet } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";

import { Money } from "~/components/money";
import { api } from "~/trpc/react";

import { RechargeView } from "../recharge/recharge-view";

const MAIN = ["BANDCOIN", "XLM", "USDC"] as const;
/** How many storage holdings the sidebar card lists before "and n more". */
const STORAGE_PREVIEW = 3;

/** The main wallet's balances (the account you sign in with). */
function useMainWallet() {
  return api.account.me.useQuery();
}

/** What the creator storage account holds; null when it isn't open (or you aren't an approved artist). */
function useStorage() {
  const storage = api.profile.storageContents.useQuery(undefined, { retry: false });
  return { ...storage, data: storage.isError ? null : storage.data };
}

type Holding = { code: string; issuer: string | null; amount: string; title?: string | null };

function HoldingAmount({ holding }: { holding: Holding }) {
  return holding.issuer === null ? (
    <Money amount={holding.amount} currency="XLM" />
  ) : (
    <>{Number(holding.amount).toLocaleString("en-US", { maximumFractionDigits: 7 })}</>
  );
}

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

function Rows({ rows }: { rows: { key: string; label: string; value: ReactNode }[] }) {
  return (
    <dl className="divide-y rounded-xl border">
      {rows.map((row) => (
        <div key={row.key} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
          <dt className="text-fg-muted min-w-0 truncate">{row.label}</dt>
          <dd className="num font-semibold">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function MainWalletCard() {
  const me = useMainWallet();
  return (
    <Card icon={Wallet} title="Main wallet" note="The account you sign in with. You pay from here.">
      {!me.data ? (
        <Skeleton className="h-28 w-full" />
      ) : (
        <Rows
          rows={MAIN.map((currency) => ({
            key: currency,
            label: currency,
            value: <Money amount={me.data!.balances[currency]} currency={currency} />,
          }))}
        />
      )}
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
        <Rows
          rows={storage.data.holdings.map((holding) => ({
            key: `${holding.code}:${holding.issuer ?? ""}`,
            label: holding.title ?? holding.code,
            value: <HoldingAmount holding={holding} />,
          }))}
        />
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
  const held = storage.data?.holdings.filter((holding) => Number(holding.amount) > 0) ?? [];

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
          {held.length === 0 ? (
            <span className="text-fg-muted text-[12px]">Empty</span>
          ) : (
            <dl className="grid gap-0.5">
              {held.slice(0, STORAGE_PREVIEW).map((holding) => (
                <div
                  key={`${holding.code}:${holding.issuer ?? ""}`}
                  className="flex items-center justify-between gap-2 text-[12px]"
                >
                  <dt className="text-fg-muted min-w-0 truncate">{holding.code}</dt>
                  <dd className="num truncate font-semibold">
                    <HoldingAmount holding={holding} />
                  </dd>
                </div>
              ))}
              {held.length > STORAGE_PREVIEW && (
                <span className="text-fg-faint text-[11px]">
                  and {held.length - STORAGE_PREVIEW} more
                </span>
              )}
            </dl>
          )}
        </div>
      )}
    </Link>
  );
}
