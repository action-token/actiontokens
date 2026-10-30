"use client";

import { Check, Coins, Copy, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { abbreviateAddress } from "@bandcoin/utils/address";
import { stellarExpertAccountUrl } from "@bandcoin/wallet/config";

import { api, type RouterOutputs } from "~/trpc/react";

import { OpenIssuer } from "../onboarding/open-issuer";
import { PayToOpen } from "../payments/pay-to-open";

import { StorageContents } from "./storage-contents";
import { useStorageOpening } from "./use-storage-opening";

type Profile = RouterOutputs["profile"]["overview"];

/** The fan token fans hold for memberships; made and managed on the Memberships page. */
export function FanTokenTab({ profile, onAccounts }: { profile: Profile; onAccounts: () => void }) {
  if (!profile.fanToken)
    return profile.issuerAccount ? (
      <EmptyState
        icon={Coins}
        title="No fan token yet"
        description="Fans hold your fan token to join a membership tier. Make it on the Memberships page."
        action={
          <Button asChild>
            <Link href="/memberships">Set up memberships</Link>
          </Button>
        }
      />
    ) : (
      <EmptyState
        icon={Coins}
        title="Open your issuer first"
        description="Your fan token is issued from your issuer account. Set it up under Accounts, then make the token on the Memberships page."
        action={<Button onClick={onAccounts}>Go to Accounts</Button>}
      />
    );
  return (
    <div className="grid gap-3">
      <Row label="Token" value={<b className="font-mono">{profile.fanToken.code}</b>} />
      <Row
        label="Issued by"
        value={<Address publicKey={profile.fanToken.issuer} />}
        note="Your issuer account"
      />
      <Button asChild variant="outline" className="justify-self-start">
        <Link href="/memberships">Manage tiers</Link>
      </Button>
    </div>
  );
}

/**
 * The Stellar accounts Bandcoin keeps for the artist, each with the way to
 * open it when it's missing: the issuer (needed: every token comes from it)
 * and storage (optional: where copies wait, as in bandfan).
 * The artist pays for both; the price shows in full first.
 */
export function AccountsTab({ profile }: { profile: Profile }) {
  return (
    <div className="grid gap-3">
      <AccountCard
        label="Issuer"
        tag="Needed"
        note="Issues your fan token and every item you sell."
        account={profile.issuerAccount}
        open={<OpenIssuer approved />}
      />
      <AccountCard
        label="Storage"
        tag="Optional"
        note="Holds your copies. Sales, pin claims and gifts take from it first."
        account={profile.storageAccount}
        open={<OpenStorage />}
      >
        <StorageContents />
      </AccountCard>
      {profile.storageAccount && (
        <p className="text-fg-muted text-xs">Add copies to storage from each item&apos;s page.</p>
      )}
    </div>
  );
}

function AccountCard({
  label,
  tag,
  note,
  account,
  open,
  children,
}: {
  label: string;
  tag: string;
  note: string;
  account: Profile["issuerAccount"];
  open: React.ReactNode;
  /** Shown once the account is open */
  children?: React.ReactNode;
}) {
  const [opening, setOpening] = useState(false);
  return (
    <div className="bg-surface grid gap-4 rounded-[1.2rem] border-2 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-semibold">
            {label}
            <span className="text-fg-muted bg-surface-2 rounded-full px-2 py-0.5 text-[11px] font-medium">
              {tag}
            </span>
          </p>
          <p className="text-fg-muted text-xs">{note}</p>
        </div>
        {account ? (
          <Address publicKey={account.publicKey} pending={!account.activatedAt} />
        ) : (
          <span className="flex items-center gap-2">
            <span className="text-fg-muted text-sm">Not set up yet</span>
            {!opening && (
              <Button size="sm" onClick={() => setOpening(true)}>
                Set it up
              </Button>
            )}
          </span>
        )}
      </div>
      {/* The price is fetched only once the artist asks, so the tab opens without a network call. */}
      {!account && opening && <div className="border-t pt-4">{open}</div>}
      {account?.activatedAt && children && <div className="border-t pt-4">{children}</div>}
    </div>
  );
}

function OpenStorage() {
  const quote = api.profile.storageQuote.useQuery(undefined, { refetchInterval: 30_000 });
  const flow = useStorageOpening();
  return (
    <PayToOpen
      intro="Storage is a Stellar account of your own, apart from your wallet, where your copies wait. Sales, pin claims and gifts take from it before making new ones, and it can fund bounty prizes. Without it, copies are made when they're needed. You pay what it starts with; Bandcoin never covers the cost."
      quote={quote.data}
      loading={quote.isPending}
      flow={flow}
      action="open storage"
    />
  );
}

function Row({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="bg-surface flex flex-wrap items-center gap-3 rounded-[1.2rem] border-2 p-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{label}</p>
        {note && <p className="text-fg-muted text-xs">{note}</p>}
      </div>
      {value}
    </div>
  );
}

function Address({ publicKey, pending = false }: { publicKey: string; pending?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="flex items-center gap-1">
      <span className="font-mono text-sm" title={publicKey}>
        {abbreviateAddress(publicKey, 5)}
      </span>
      {pending && <span className="text-warning text-xs">not opened yet</span>}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Copy address"
        onClick={() =>
          void navigator.clipboard.writeText(publicKey).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        }
      >
        {copied ? <Check /> : <Copy />}
      </Button>
      <Button variant="ghost" size="icon" asChild>
        <a
          href={stellarExpertAccountUrl(publicKey)}
          target="_blank"
          rel="noreferrer"
          aria-label="Open on Stellar Expert"
        >
          <ExternalLink />
        </a>
      </Button>
    </span>
  );
}
