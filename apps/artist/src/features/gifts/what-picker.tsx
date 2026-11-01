"use client";

import { Check, Coins, Lock, Sparkles, Tag } from "lucide-react";
import type { ReactNode } from "react";

import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { cn } from "@bandcoin/ui/lib/cn";

import { api } from "~/trpc/react";

export type Choice =
  | { kind: "tokens"; code: string }
  | { kind: "copy"; editionId: string; title: string; tokenId: string; coverUrl: string };

const tokens = (amount: string) =>
  Number(amount).toLocaleString("en-US", { maximumFractionDigits: 7 });

/**
 * What to give, as picture cards: your fan token first, then each NFT copy
 * you own. A copy on sale can't be picked.
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
  const fanToken = api.memberships.fanToken.useQuery();
  const stock = api.catalog.pageAssets.useQuery();
  const copies = api.gifts.copies.useQuery();

  if (fanToken.isPending || stock.isPending || copies.isPending)
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="aspect-[4/5] rounded-xl" />
        ))}
      </div>
    );

  const token = fanToken.data ?? null;
  const owned = (copies.data ?? []).flatMap((nft) =>
    nft.copies.map((copy) => ({ ...copy, title: nft.title, coverUrl: nft.coverUrl })),
  );

  return (
    <div className="grid gap-3">
      <div
        role="radiogroup"
        aria-label="What to give"
        className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3"
      >
        {token && (
          <GiftCard
            on={choice?.kind === "tokens"}
            disabled={disabled}
            onClick={() => onChoose({ kind: "tokens", code: token.code })}
            image={token.coverUrl}
            chip={
              <>
                <Coins className="size-3" /> Fan token
              </>
            }
            title={token.code}
            detail={
              stock.data?.held != null
                ? `${tokens(stock.data.held)} in storage`
                : stock.data?.storageOpen
                  ? "Your fan token"
                  : "Issued when you send"
            }
          />
        )}
        {owned.map((copy) => (
          <GiftCard
            key={copy.editionId}
            on={choice?.kind === "copy" && choice.editionId === copy.editionId}
            disabled={disabled || copy.listed}
            onClick={() =>
              onChoose({
                kind: "copy",
                editionId: copy.editionId,
                title: copy.title,
                tokenId: copy.tokenId,
                coverUrl: copy.coverUrl,
              })
            }
            image={copy.coverUrl}
            chip={
              <>
                <Sparkles className="size-3" /> NFT #{copy.tokenId}
              </>
            }
            title={copy.title}
            detail={
              copy.listed ? (
                <>
                  <Tag className="size-3" /> On sale. Take it off sale first
                </>
              ) : copy.unlocked + copy.locked > 0 ? (
                <>
                  <Lock className="size-3" /> {copy.unlocked} of {copy.unlocked + copy.locked}{" "}
                  unlocked
                </>
              ) : (
                "One copy"
              )
            }
          />
        ))}
      </div>
      {!token && owned.length === 0 && (
        <p className="text-fg-muted text-sm">
          Nothing to give yet. Create your fan token under Memberships, or buy a copy of one of your
          NFTs in the fan app (the price comes back to you, so you pay only the fees).
        </p>
      )}
      {token && owned.length === 0 && (
        <p className="text-fg-faint text-xs">
          To give an NFT, buy a copy of it in the fan app first. The price comes back to you, so you
          pay only the fees.
        </p>
      )}
    </div>
  );
}

function GiftCard({
  on,
  disabled,
  onClick,
  image,
  chip,
  title,
  detail,
}: {
  on: boolean;
  disabled: boolean;
  onClick: () => void;
  image: string;
  chip: ReactNode;
  title: string;
  detail: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "group bg-surface relative flex max-w-48 flex-col overflow-hidden rounded-xl border-2 text-left transition-all disabled:cursor-not-allowed disabled:opacity-50",
        on
          ? "border-primary-text ring-primary/40 shadow-sm ring-2"
          : "border-fg/10 hover:border-border-strong enabled:hover:-translate-y-0.5",
      )}
    >
      <span className="bg-surface-2 relative block aspect-square overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={image}
          alt=""
          className="size-full object-cover transition-transform duration-300 group-enabled:group-hover:scale-105"
        />
        <span className="bg-surface/90 absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold backdrop-blur">
          {chip}
        </span>
        <span
          className={cn(
            "absolute top-1.5 right-1.5 flex size-5 items-center justify-center rounded-full border-2 transition-colors",
            on
              ? "bg-primary border-primary text-primary-foreground"
              : "bg-surface/80 border-fg/20 text-transparent",
          )}
        >
          <Check className="size-3" strokeWidth={3} />
        </span>
      </span>
      <span className="grid gap-0.5 p-2.5">
        <span className="truncate text-[13px] font-semibold">{title}</span>
        <span className="text-fg-muted flex items-center gap-1 truncate text-[11px]">{detail}</span>
      </span>
    </button>
  );
}
