"use client";

import { Check, Copy, Send, Wallet, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";

import { cn } from "../lib/cn";

/**
 * The Wallet page's pieces, as in Wadzzo's wallet: the brand-colour balance
 * block with its action buttons, plain cards for the rest, the asset list and
 * the XLM card. They only lay out what the app passes; no money math here.
 */

export type WalletAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** The one dark button; the rest are pale */
  primary?: boolean;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
};

const short = (address: string) => `${address.slice(0, 4)}…${address.slice(-4)}`;

/** The wallet address as a small chip; tapping it copies the full address. */
export function CopyAddress({ address, className }: { address: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () =>
    void navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? "Copied" : `Copy ${address}`}
      aria-label={copied ? "Address copied" : "Copy your wallet address"}
      className={cn(
        "bg-side-ink text-side-chip inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-xs transition-transform hover:scale-105",
        className,
      )}
    >
      {short(address)}
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}

/**
 * The big block on top: a handwritten label and the address, the balance
 * huge, then the action buttons (Recharge, Send, Swap, Receive). Chartreuse in
 * dark mode, ink in light, like the sidebar.
 */
export function WalletHero({
  label,
  address,
  balance,
  below,
  actions,
}: {
  label: string;
  address: string | null;
  /** The big number, or a note when the wallet isn't on Stellar yet */
  balance: ReactNode;
  below?: ReactNode;
  actions: WalletAction[];
}) {
  return (
    <section className="side-scope blob bg-side text-side-ink relative overflow-hidden p-6 sm:p-8">
      <Wallet
        aria-hidden
        className="text-side-ink/10 absolute -right-6 -bottom-8 size-48 rotate-12"
        strokeWidth={1.6}
      />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="marker -rotate-2 text-lg">*{label}*</p>
            {address && <CopyAddress address={address} />}
          </div>
          {balance}
          {below}
        </div>
        <div
          className={cn(
            "grid gap-2 sm:flex sm:flex-wrap",
            actions.length >= 4
              ? "grid-cols-4"
              : actions.length === 3
                ? "grid-cols-3"
                : "grid-cols-2",
          )}
        >
          {actions.map((action) => {
            const className = cn(
              "blob flex h-14 flex-col items-center justify-center gap-0.5 px-5 transition-transform duration-200 hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50 sm:flex-row sm:gap-2",
              action.primary ? "bg-side-ink text-side" : "bg-side-mint text-primary-foreground",
            );
            const content = (
              <>
                <action.icon className="size-4" strokeWidth={2.6} />
                <span className="marker text-sm sm:text-lg">{action.label}</span>
              </>
            );
            return action.href ? (
              <Link key={action.id} href={action.href} className={className}>
                {content}
              </Link>
            ) : (
              <button
                key={action.id}
                type="button"
                onClick={action.onClick}
                disabled={action.disabled}
                className={className}
              >
                {content}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/** A plain card with a big title, as Wadzzo's wallet cards. */
export function WalletPanel({
  title,
  aside,
  children,
  className,
}: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("bg-surface space-y-3 rounded-[1.6rem] border-2 p-5", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="display flex items-center gap-2 text-xl">{title}</h2>
        {aside && <span className="text-fg-muted text-xs">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

export type WalletAssetRow = {
  key: string;
  code: string;
  title: string;
  amount: ReactNode;
  href?: string | null;
  /** Null when there's nothing to send */
  onSend: (() => void) | null;
};

/** Every token in the wallet, each with Send. */
export function WalletAssets({ rows, empty }: { rows: WalletAssetRow[]; empty: ReactNode }) {
  if (rows.length === 0) return <>{empty}</>;
  return (
    <ul className="divide-border divide-y-2 divide-dashed">
      {rows.map((row) => {
        const body = (
          <>
            <span className="bg-surface-3 grid size-10 shrink-0 place-items-center rounded-xl text-[11px] font-bold">
              {row.code.slice(0, 4)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{row.code}</span>
              <span className="text-fg-muted block truncate text-xs">{row.title}</span>
            </span>
          </>
        );
        return (
          <li key={row.key} className="flex items-center gap-3 py-2.5">
            {row.href ? (
              <Link
                href={row.href}
                className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-80"
              >
                {body}
              </Link>
            ) : (
              <span className="flex min-w-0 flex-1 items-center gap-3">{body}</span>
            )}
            <span className="display truncate text-base tabular-nums">{row.amount}</span>
            <button
              type="button"
              disabled={!row.onSend}
              onClick={row.onSend ?? undefined}
              aria-label={`Send ${row.code}`}
              className="text-fg-muted hover:bg-surface-2 hover:text-fg flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors disabled:pointer-events-none disabled:opacity-40"
            >
              <Send className="size-3.5" /> <span className="hidden sm:inline">Send</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** XLM: the total, what's spendable and what Stellar keeps reserved, with a bar. */
export function XlmPanel({
  total,
  spendable,
  reserved,
  share,
}: {
  total: ReactNode;
  spendable: ReactNode;
  reserved: ReactNode;
  /** Spendable ÷ total, 0 to 1 */
  share: number;
}) {
  const rows = [
    { label: "Spendable", value: spendable, hint: "For network fees, sends and swaps" },
    { label: "Reserved", value: reserved, hint: "Kept by Stellar for your account and tokens" },
  ];
  return (
    <WalletPanel
      title="XLM"
      aside={<span className="display text-primary-text text-lg">{total}</span>}
    >
      <ul className="space-y-2">
        {rows.map((row) => (
          <li
            key={row.label}
            className="bg-surface-2 flex items-center justify-between gap-3 rounded-xl px-3.5 py-3"
          >
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{row.label}</span>
              <span className="text-fg-muted block truncate text-xs">{row.hint}</span>
            </span>
            <span className="display shrink-0 text-base tabular-nums">{row.value}</span>
          </li>
        ))}
      </ul>
      <div className="h-3 overflow-hidden rounded-full border-2" aria-hidden>
        <div
          className="bg-primary h-full rounded-full"
          style={{ width: `${Math.max(2, Math.min(100, share * 100))}%` }}
        />
      </div>
    </WalletPanel>
  );
}
