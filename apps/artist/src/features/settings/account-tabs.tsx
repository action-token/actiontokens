"use client";

import { Check, Coins, Copy, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { abbreviateAddress } from "@bandcoin/utils/address";
import { stellarExpertAccountUrl } from "@bandcoin/wallet/config";

import type { RouterOutputs } from "~/trpc/react";

type Profile = RouterOutputs["profile"]["overview"];

/** The fan token fans hold for memberships; made and managed on the Memberships page. */
export function FanTokenTab({ profile }: { profile: Profile }) {
  if (!profile.fanToken)
    return (
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
 * The Stellar accounts Bandcoin keeps for the artist: the issuer every token
 * comes from, and storage, which holds stock and can fund bounties.
 */
export function AccountsTab({ profile }: { profile: Profile }) {
  const accounts = [
    {
      label: "Issuer",
      note: "Issues your fan token and every item you sell.",
      account: profile.issuerAccount,
    },
    {
      label: "Storage",
      note: "Holds your stock and can pay bounty prizes.",
      account: profile.storageAccount,
    },
  ];
  return (
    <div className="grid gap-3">
      {accounts.map(({ label, note, account }) => (
        <Row
          key={label}
          label={label}
          note={note}
          value={
            account ? (
              <Address publicKey={account.publicKey} pending={!account.activatedAt} />
            ) : (
              <span className="text-fg-muted text-sm">Not set up yet</span>
            )
          }
        />
      ))}
      <p className="text-fg-faint text-xs">
        Bandcoin keeps the keys for these accounts safe; you never need them.
      </p>
    </div>
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
