"use client";

import { Check } from "lucide-react";

import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { cn } from "@bandcoin/ui/lib/cn";

import { api } from "~/trpc/react";

export type Choice =
  | { kind: "tokens"; code: string }
  | { kind: "copy"; editionId: string; title: string; tokenId: string };

const tokens = (amount: string) =>
  Number(amount).toLocaleString("en-US", { maximumFractionDigits: 7 });

/**
 * What to give, as one list of cards (Wadzzo's gift page): your fan token,
 * then each NFT copy you own. A copy on sale can't be picked.
 */
export function WhatPicker({
  choice,
  onChoose,
  disabled,
}: {
  choice: Choice | null;
  onChoose: (choice: Choice) => void;
  disabled: boolean;
}) {
  const token = api.catalog.pageAssets.useQuery();
  const copies = api.gifts.copies.useQuery();

  if (token.isPending || copies.isPending)
    return (
      <div className="grid gap-2 sm:grid-cols-2">
        <Skeleton className="h-16 rounded-lg" />
        <Skeleton className="h-16 rounded-lg" />
      </div>
    );

  const fanToken = token.data?.fanToken ?? null;
  const owned = (copies.data ?? []).flatMap((nft) =>
    nft.copies.map((copy) => ({ ...copy, title: nft.title, coverUrl: nft.coverUrl })),
  );

  return (
    <div className="grid gap-2">
      <div role="radiogroup" aria-label="What to give" className="grid gap-2 sm:grid-cols-2">
        {fanToken && (
          <Option
            on={choice?.kind === "tokens"}
            disabled={disabled}
            onClick={() => onChoose({ kind: "tokens", code: fanToken.code })}
            badge={
              <span className="bg-surface-2 flex size-9 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold">
                {fanToken.code.slice(0, 4)}
              </span>
            }
            title={fanToken.code}
            detail="Your fan token"
            side={
              token.data?.held != null
                ? `${tokens(token.data.held)} in storage`
                : token.data?.storageOpen
                  ? null
                  : "Issued when you send"
            }
          />
        )}
        {owned.map((copy) => (
          <Option
            key={copy.editionId}
            on={choice?.kind === "copy" && choice.editionId === copy.editionId}
            disabled={disabled || copy.listed}
            onClick={() =>
              onChoose({
                kind: "copy",
                editionId: copy.editionId,
                title: copy.title,
                tokenId: copy.tokenId,
              })
            }
            badge={
              // eslint-disable-next-line @next/next/no-img-element
              <img src={copy.coverUrl} alt="" className="size-9 shrink-0 rounded-md object-cover" />
            }
            title={`${copy.title} #${copy.tokenId}`}
            detail={
              copy.listed
                ? "On sale. Take it off sale to gift it"
                : copy.unlocked + copy.locked > 0
                  ? `NFT · ${copy.unlocked} of ${copy.unlocked + copy.locked} unlocked`
                  : "NFT"
            }
          />
        ))}
      </div>
      {!fanToken && owned.length === 0 && (
        <p className="text-fg-muted text-sm">
          Nothing to give yet. Create your fan token under Memberships, or buy a copy of one of your
          NFTs in the fan app (the price comes back to you, so you pay only the fees).
        </p>
      )}
      {fanToken && owned.length === 0 && (
        <p className="text-fg-faint text-xs">
          To give an NFT, buy a copy of it in the fan app first. The price comes back to you, so you
          pay only the fees.
        </p>
      )}
    </div>
  );
}

function Option({
  on,
  disabled,
  onClick,
  badge,
  title,
  detail,
  side,
}: {
  on: boolean;
  disabled: boolean;
  onClick: () => void;
  badge: React.ReactNode;
  title: string;
  detail: string;
  side?: string | null;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-lg border p-3 text-left transition-colors disabled:opacity-50",
        on ? "border-primary-text bg-primary-soft" : "hover:border-border-strong",
      )}
    >
      {badge}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{title}</span>
        <span className="text-fg-muted block truncate text-xs">{detail}</span>
      </span>
      {side && <span className="num shrink-0 text-xs font-medium">{side}</span>}
      {on && <Check className="text-primary-text size-4 shrink-0" />}
    </button>
  );
}
