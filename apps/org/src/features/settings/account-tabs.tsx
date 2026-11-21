"use client";

import { Check, Coins, Copy, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@actiontokens/ui/components/button";
import { EmptyState } from "@actiontokens/ui/patterns/empty-state";
import { abbreviateAddress } from "@actiontokens/utils/address";
import { stellarExpertAccountUrl } from "@actiontokens/wallet/config";

import { api, type RouterOutputs } from "~/trpc/react";

import { OpenIssuer } from "../onboarding/open-issuer";

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
 * and storage (where fan tokens and copies wait, as in bandfan). The artist
 * pays for the issuer when applying; the platform opens storage at approval,
 * or here for artists approved before that.
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
        tag="Free"
        note="Holds your fan tokens and copies. Sales, pin claims and gifts take from it first."
        account={profile.storageAccount}
        open={<OpenStorage />}
      />
      {profile.storageAccount && (
        <p className="text-fg-muted text-xs">
          See what&apos;s in it, and move things in or out, under Balances. Add copies of an item
          from its page.
        </p>
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
  const utils = api.useUtils();
  const open = api.profile.openStorage.useMutation({
    onSuccess: (opened) => {
      toast.success(
        opened.supply
          ? `Storage is open, holding ${Number(opened.supply).toLocaleString("en-US")} of your fan token`
          : "Storage is open",
      );
      void utils.profile.overview.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <div className="grid gap-3 text-sm">
      <p className="text-fg-muted">
        Storage is a Stellar account of your own, apart from your wallet. It holds your fan tokens
        and copies, and gifts, pin rewards and bounty prizes can come from it. Action Tokens pays to
        open it and adds your starting fan tokens. It costs you nothing.
      </p>
      <Button
        className="justify-self-start"
        disabled={open.isPending}
        onClick={() => open.mutate()}
      >
        {open.isPending ? "Opening…" : "Open my storage account"}
      </Button>
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
