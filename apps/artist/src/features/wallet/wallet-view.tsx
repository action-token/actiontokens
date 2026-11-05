"use client";

import {
  Archive,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  Coins,
  Copy,
  ExternalLink,
  Plus,
  ReceiptText,
  Send,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { type ReactNode, useState } from "react";
import QRCode from "react-qr-code";

import { Button } from "@bandcoin/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@bandcoin/ui/components/dialog";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { PageBody } from "@bandcoin/ui/patterns/page-header";
import { SideBalance } from "@bandcoin/ui/patterns/side-frame";
import { StatusPill } from "@bandcoin/ui/patterns/status-pill";
import { TallText } from "@bandcoin/ui/patterns/tall-text";
import {
  WalletAssets,
  WalletHero,
  WalletPanel,
  XlmPanel,
  type WalletAction,
} from "@bandcoin/ui/patterns/wallet-blocks";

import { Money } from "~/components/money";
import { formatAmount, timeAgo } from "~/lib/format";
import { CURRENCY, statusLabel, statusTone } from "~/lib/wallet";
import { api, type RouterOutputs } from "~/trpc/react";

import { RechargeToast } from "../recharge/recharge-toast";
import { RechargeView } from "../recharge/recharge-view";
import { FAN_APP_URL } from "../shell/links";
import { GiftsToClaim } from "./gifts-to-claim";
import { orderStorage, pageList, storagePreview } from "./holdings-order";
import { SendDialog } from "./send-dialog";
import { SwapForm } from "./swap-form";
import { useWalletOrder } from "./use-wallet-order";

type Me = NonNullable<RouterOutputs["account"]["me"]>;
type Assets = RouterOutputs["wallet"]["assets"];
type Token = Assets["tokens"][number];
type Open = { kind: "send"; token?: Token } | { kind: "swap" } | { kind: "receive" } | null;

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
function useMainWallet(enabled = true) {
  return api.account.me.useQuery(undefined, { enabled });
}

/** What the creator storage account holds; null when it isn't open (or you aren't an approved artist). */
function useStorage(enabled = true) {
  const storage = api.profile.storageContents.useQuery(undefined, { retry: false, enabled });
  return { ...storage, data: storage.isError ? null : storage.data };
}

const keyOf = (holding: Holding) => `${holding.code}:${holding.issuer ?? ""}`;

/** `short`: 2 decimals, and millions and up as "25B", for the sidebar card. */
function HoldingAmount({ holding, short }: { holding: Holding; short?: boolean }) {
  if (holding.kind === "bandcoin")
    return <Money amount={holding.amount} currency="BANDCOIN" short={short} />;
  if (holding.kind === "usdc")
    return <Money amount={holding.amount} currency="USDC" short={short} />;
  if (holding.issuer === null)
    return <Money amount={holding.amount} currency="XLM" short={short} />;
  return <Money amount={holding.amount} currency={null} short={short} />;
}

const rowOf = (holding: Holding): Row => ({
  key: keyOf(holding),
  label: holding.title ?? holding.code,
  note: holding.kind === "fanToken" ? "Your fan token" : undefined,
  value: <HoldingAmount holding={holding} />,
});

/**
 * Wallet, laid out like Wadzzo's: the main wallet's balance block with
 * Recharge, Send, Swap and Receive, then every token (each with Send) beside
 * the XLM card, Creator storage and Pending gifts, then the history and
 * Recharge. Moving things between wallet and storage stays in Settings ›
 * Balances.
 */
export function WalletView() {
  const { status } = useSession();
  const me = api.account.me.useQuery(undefined, { enabled: status === "authenticated" });
  const assets = api.wallet.assets.useQuery(undefined, { enabled: status === "authenticated" });
  const flow = useWalletOrder();
  const [open, setOpen] = useState<Open>(null);

  if (status === "loading" || me.isPending || !me.data)
    return (
      <PageBody wide className="grid gap-4">
        <Skeleton className="blob h-64" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-44 rounded-2xl" />
          <Skeleton className="h-44 rounded-2xl" />
        </div>
      </PageBody>
    );

  const active = me.data.activated;
  const sendable = (assets.data?.tokens ?? []).filter((token) => Number(token.amount) > 0);
  const actions: WalletAction[] = [
    { id: "recharge", label: "Recharge", icon: Plus, primary: true, href: "#recharge" },
    ...(active
      ? [
          {
            id: "send",
            label: "Send",
            icon: Send,
            disabled: sendable.length === 0 || flow.busy,
            onClick: () => setOpen({ kind: "send" }),
          },
          {
            id: "swap",
            label: "Swap",
            icon: ArrowLeftRight,
            disabled: flow.busy,
            onClick: () => setOpen({ kind: "swap" }),
          },
        ]
      : []),
    ...(me.data.walletAddress
      ? [
          {
            id: "receive",
            label: "Receive",
            icon: ArrowDownToLine,
            onClick: () => setOpen({ kind: "receive" }),
          },
        ]
      : []),
  ];

  return (
    <PageBody wide className="grid gap-6">
      <h1 className="sr-only">Wallet</h1>
      <Hero me={me.data} actions={actions} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <AssetsPanel
          assets={assets.data}
          loading={assets.isPending}
          onSend={(token) => setOpen({ kind: "send", token })}
        />
        <div className="grid grid-cols-[minmax(0,1fr)] content-start gap-4">
          {assets.data?.active && <XlmCard xlm={assets.data.xlm} />}
          <StorageCard />
          <GiftsToClaim />
        </div>
      </div>

      <WalletPanel title="History">
        <History />
      </WalletPanel>

      <section id="recharge" className="grid scroll-mt-6 gap-4">
        <h2 className="display text-2xl">Recharge</h2>
        <RechargeView />
      </section>

      {open?.kind === "send" && sendable.length > 0 && (
        <SendDialog
          tokens={sendable}
          initial={open.token}
          flow={flow}
          onClose={() => setOpen(null)}
        />
      )}
      {open?.kind === "swap" && (
        <Dialog open onOpenChange={(next) => !next && setOpen(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="display text-3xl">Swap</DialogTitle>
              <DialogDescription>
                BANDCOIN for XLM, or XLM for BANDCOIN, at today&apos;s price.
              </DialogDescription>
            </DialogHeader>
            <SwapForm flow={flow} onStarted={() => setOpen(null)} />
          </DialogContent>
        </Dialog>
      )}
      {open?.kind === "receive" && me.data.walletAddress && (
        <ReceiveDialog address={me.data.walletAddress} onClose={() => setOpen(null)} />
      )}
      <RechargeToast flow={flow} />
    </PageBody>
  );
}

function Hero({ me, actions }: { me: Me; actions: WalletAction[] }) {
  return (
    <WalletHero
      label={me.activated ? "your BANDCOIN balance" : "your wallet"}
      address={me.walletAddress}
      actions={actions}
      balance={
        me.activated ? (
          <TallText className="pb-[0.12em] text-7xl tabular-nums sm:text-8xl">
            {formatAmount(me.balances.BANDCOIN, "BANDCOIN", { short: true })}{" "}
            <span className="text-[0.45em]">BANDCOIN</span>
          </TallText>
        ) : (
          <p className="text-side-ink/80 max-w-md font-semibold">
            Your wallet isn&apos;t on Stellar yet. Activate it below to start.
          </p>
        )
      }
      below={
        me.activated && (
          <p className="text-side-ink/75 flex flex-wrap gap-x-4 text-sm font-semibold">
            {(["XLM", "USDC"] as const).map((currency) => (
              <span key={currency}>
                {formatAmount(me.balances[currency], currency, { short: true })} {currency}
              </span>
            ))}
          </p>
        )
      }
    />
  );
}

function AssetsPanel({
  assets,
  loading,
  onSend,
}: {
  assets: Assets | undefined;
  loading: boolean;
  onSend: (token: Token) => void;
}) {
  const tokens = assets?.tokens ?? [];
  return (
    <WalletPanel title="Assets" aside={assets && `${tokens.length} in your wallet`}>
      {loading ? (
        <div className="grid gap-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-12 rounded-xl" />
          ))}
        </div>
      ) : (
        <WalletAssets
          rows={tokens.map((token) => {
            const main = CURRENCY[token.kind];
            return {
              key: `${token.code}:${token.issuer ?? "native"}`,
              code: token.code,
              title: token.title,
              href: token.itemId ? `${FAN_APP_URL}/item/${token.itemId}` : null,
              amount: (
                <Money
                  amount={token.amount}
                  currency={main}
                  code={main ? undefined : ""}
                  short
                  className="display"
                />
              ),
              onSend: assets?.active && Number(token.amount) > 0 ? () => onSend(token) : null,
            };
          })}
          empty={
            <EmptyState
              icon={Coins}
              title="Nothing here yet"
              description="Your XLM and tokens show up here."
              className="border-0 py-6"
            />
          }
        />
      )}
    </WalletPanel>
  );
}

function XlmCard({ xlm }: { xlm: Assets["xlm"] }) {
  const total = Number(xlm.total);
  return (
    <XlmPanel
      total={<Money amount={xlm.total} currency="XLM" short />}
      spendable={<Money amount={xlm.spendable} currency="XLM" />}
      reserved={<Money amount={xlm.reserved} currency="XLM" />}
      share={total > 0 ? Number(xlm.spendable) / total : 0}
    />
  );
}

function ReceiveDialog({ address, onClose }: { address: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
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
    <ul className="divide-y">
      {history.data.map((entry) => (
        <li key={entry.id} className="flex items-center gap-3 py-3">
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

function StorageCard() {
  const storage = useStorage();
  return (
    <WalletPanel
      title={
        <>
          <Archive className="text-primary-text size-5" /> Creator storage
        </>
      }
    >
      <p className="text-fg-muted text-xs">
        Holds what you give away: gifts, pin rewards and bounty prizes.
      </p>
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
    </WalletPanel>
  );
}

/** The sidebar's summary of both accounts, on the sidebar block; the whole card opens Wallet. `rail`: a wallet blob. */
export function WalletSidebarCard({ rail = false }: { rail?: boolean }) {
  const signedIn = useSession().status === "authenticated";
  const me = useMainWallet(signedIn);
  const storage = useStorage(signedIn && !rail);
  const { shown, more } = storagePreview(storage.data?.holdings ?? []);
  if (!signedIn) return null;
  if (rail) return <SideBalance href="/wallet" icon={Wallet} main={null} rail />;
  const balances = me.data?.balances;

  return (
    <SideBalance
      href="/wallet"
      icon={Wallet}
      title="Main wallet"
      main={
        balances
          ? {
              amount: <Money amount={balances.BANDCOIN} currency="BANDCOIN" short />,
              code: "BANDCOIN",
            }
          : null
      }
      lines={MAIN.slice(1).map((currency) => ({
        label: currency,
        value: balances && <Money amount={balances[currency]} currency={currency} short />,
      }))}
      extra={
        storage.data && (
          <span className="border-side-chip/20 mt-2.5 grid gap-0.5 border-t-2 border-dashed pt-2">
            <span className="text-side-chip/70 text-[10px] font-bold tracking-[0.08em] uppercase">
              Creator storage
            </span>
            {shown.length === 0 ? (
              <span className="text-side-chip/70 text-[11px] font-semibold">Empty</span>
            ) : (
              <>
                {shown.map((holding) => (
                  <span
                    key={keyOf(holding)}
                    className="text-side-chip/70 flex items-center justify-between gap-2 text-[11px] font-semibold"
                  >
                    <span className="min-w-0 truncate">{holding.code}</span>
                    <span className="truncate">
                      <HoldingAmount holding={holding} short />
                    </span>
                  </span>
                ))}
                {more > 0 && <span className="text-side-chip/60 text-[11px]">and {more} more</span>}
              </>
            )}
          </span>
        )
      }
    />
  );
}
