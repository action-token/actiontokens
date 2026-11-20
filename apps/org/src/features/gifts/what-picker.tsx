"use client";

import { Coins, Lock, RotateCcw, Sparkles } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";

import { Input } from "@actiontokens/ui/components/input";
import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { cn } from "@actiontokens/ui/lib/cn";

import { api } from "~/trpc/react";

export type Choice =
  | { kind: "tokens"; code: string }
  | { kind: "copy"; editionId: string; title: string; tokenId: string; coverUrl: string };

const tokens = (amount: number) => amount.toLocaleString("en-US", { maximumFractionDigits: 7 });

const GRID = "grid grid-cols-[repeat(auto-fill,minmax(8rem,10rem))] gap-3";

/**
 * What to give, as small picture cards: your fan token, then each NFT you
 * own. Clicking a card flips it: the back asks how many (or which copy) and
 * shows what you'll have left.
 */
export function WhatPicker({
  choice,
  onChoose,
  amountText,
  onAmount,
  disabled,
}: {
  choice: Choice | null;
  onChoose: (choice: Choice | null) => void;
  amountText: string;
  onAmount: (value: string) => void;
  disabled: boolean;
}) {
  const fanToken = api.memberships.fanToken.useQuery();
  const stock = api.catalog.pageAssets.useQuery();
  const copies = api.gifts.copies.useQuery();

  if (fanToken.isPending || stock.isPending || copies.isPending)
    return (
      <div className={GRID}>
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="aspect-[3/4] rounded-xl" />
        ))}
      </div>
    );

  const token = fanToken.data ?? null;
  const nfts = copies.data ?? [];
  const held = stock.data?.held != null ? Number(stock.data.held) : null;
  const amount = Number(amountText);
  const validAmount = Number.isInteger(amount) && amount >= 1;

  return (
    <div className="grid gap-3">
      <div role="radiogroup" aria-label="What to give" className={GRID}>
        {token && (
          <FlipCard
            on={choice?.kind === "tokens"}
            disabled={disabled}
            onPick={() => onChoose({ kind: "tokens", code: token.code })}
            onBack={() => onChoose(null)}
            image={token.coverUrl}
            chip={
              <>
                <Coins className="size-3" /> Fan token
              </>
            }
            title={token.code}
            detail={held !== null ? `${tokens(held)} in storage` : "Issued when you send"}
            back={
              <>
                <label htmlFor="gift-amount" className="text-[11px] font-semibold">
                  How many {token.code}
                </label>
                <Input
                  id="gift-amount"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={amountText}
                  aria-invalid={!validAmount || (held !== null && amount > held)}
                  className="num h-8 px-2 text-sm"
                  onChange={(event) => onAmount(event.target.value)}
                />
                <p className="text-fg-muted text-[11px] leading-snug">
                  {!validAmount ? (
                    <span className="text-danger">Whole number from 1</span>
                  ) : held === null ? (
                    "New tokens are issued to them"
                  ) : amount > held ? (
                    <span className="text-danger">Only {tokens(held)} in storage</span>
                  ) : (
                    <>
                      <b className="num text-fg">{tokens(held - amount)}</b> left in storage
                    </>
                  )}
                </p>
              </>
            }
          />
        )}
        {nfts.map((nft) => {
          const free = nft.copies.filter((copy) => !copy.listed);
          const picked =
            choice?.kind === "copy"
              ? nft.copies.find((copy) => copy.editionId === choice.editionId)
              : undefined;
          const pick = (copy: (typeof nft.copies)[number]) =>
            onChoose({
              kind: "copy",
              editionId: copy.editionId,
              title: nft.title,
              tokenId: copy.tokenId,
              coverUrl: nft.coverUrl,
            });
          return (
            <FlipCard
              key={nft.itemId}
              on={Boolean(picked)}
              disabled={disabled || free.length === 0}
              onPick={() => free[0] && pick(free[0])}
              onBack={() => onChoose(null)}
              image={nft.coverUrl}
              chip={
                <>
                  <Sparkles className="size-3" /> NFT
                </>
              }
              title={nft.title}
              detail={
                free.length === 0
                  ? "All on sale"
                  : `You own ${nft.copies.length} ${nft.copies.length === 1 ? "copy" : "copies"}`
              }
              back={
                <>
                  <span className="text-[11px] font-semibold">Which copy</span>
                  <div className="flex max-h-16 flex-wrap gap-1 overflow-y-auto">
                    {nft.copies.map((copy) => (
                      <button
                        key={copy.editionId}
                        type="button"
                        disabled={copy.listed || disabled}
                        title={copy.listed ? "On sale" : undefined}
                        onClick={() => pick(copy)}
                        className={cn(
                          "num max-w-full truncate rounded-md border px-1.5 py-0.5 text-[11px] disabled:opacity-40",
                          picked?.editionId === copy.editionId
                            ? "border-primary-text bg-surface font-semibold"
                            : "hover:border-border-strong",
                        )}
                      >
                        #{copy.tokenId}
                      </button>
                    ))}
                  </div>
                  {picked && picked.unlocked + picked.locked > 0 && (
                    <p className="text-fg-muted flex items-center gap-1 text-[11px]">
                      <Lock className="size-3" /> {picked.unlocked} of{" "}
                      {picked.unlocked + picked.locked} unlocked
                    </p>
                  )}
                  <p className="text-fg-muted text-[11px] leading-snug">
                    You&apos;ll keep{" "}
                    <b className="num text-fg">{Math.max(0, nft.copies.length - 1)}</b>
                  </p>
                </>
              }
            />
          );
        })}
      </div>
      {!token && nfts.length === 0 && (
        <p className="text-fg-muted text-sm">
          Nothing to give yet. Create your fan token under Memberships, or buy a copy of one of your
          NFTs in the fan app (the price comes back to you, so you pay only the fees).
        </p>
      )}
      {token && nfts.length === 0 && (
        <p className="text-fg-faint text-xs">
          To give an NFT, buy a copy of it in the fan app first. The price comes back to you, so you
          pay only the fees.
        </p>
      )}
    </div>
  );
}

/**
 * A card that turns over when picked: the picture on the front, the details
 * on the back. One side shows at a time and a short turn plays on the
 * switch (a true 3D card shows both sides in Safari once anything inside
 * clips or blurs).
 */
function FlipCard({
  on,
  disabled,
  onPick,
  onBack,
  image,
  chip,
  title,
  detail,
  back,
}: {
  on: boolean;
  disabled: boolean;
  onPick: () => void;
  onBack: () => void;
  image: string;
  chip: ReactNode;
  title: string;
  detail: string;
  back: ReactNode;
}) {
  const card = useRef<HTMLDivElement>(null);
  const shown = useRef(on);
  useEffect(() => {
    if (shown.current === on) return;
    shown.current = on;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    card.current?.animate(
      [
        { transform: `perspective(900px) rotateY(${on ? -90 : 90}deg)` },
        { transform: "perspective(900px) rotateY(0deg)" },
      ],
      { duration: 280, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
    );
  }, [on]);

  return (
    <div ref={card} className="aspect-[3/4]">
      {on ? (
        <div className="bg-primary-soft border-primary-text grid size-full content-start gap-1.5 rounded-xl border-2 p-2.5">
          <div className="flex items-start justify-between gap-1">
            <span className="truncate text-xs font-semibold">{title}</span>
            <button
              type="button"
              aria-label="Pick something else"
              onClick={onBack}
              className="text-fg-muted hover:text-fg shrink-0"
            >
              <RotateCcw className="size-3.5" />
            </button>
          </div>
          {back}
        </div>
      ) : (
        <button
          type="button"
          role="radio"
          aria-checked={false}
          aria-label={`${title}, ${detail}`}
          disabled={disabled}
          onClick={onPick}
          className="group bg-surface border-fg/10 hover:border-border-strong flex size-full flex-col overflow-hidden rounded-xl border-2 text-left disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="bg-surface-2 relative block min-h-0 flex-1 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image}
              alt=""
              className="size-full object-cover transition-transform duration-300 group-enabled:group-hover:scale-105"
            />
            <span className="bg-surface/90 absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[9px] font-semibold backdrop-blur">
              {chip}
            </span>
          </span>
          <span className="grid gap-0.5 p-2">
            <span className="truncate text-xs font-semibold">{title}</span>
            <span className="text-fg-muted truncate text-[11px]">{detail}</span>
          </span>
        </button>
      )}
    </div>
  );
}
