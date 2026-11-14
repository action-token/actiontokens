"use client";

import { ArrowRight, ChevronLeft, ChevronRight, Play, Zap } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { cn } from "@bandcoin/ui/lib/cn";

import { Money } from "~/components/money";
import { TYPE_LABEL } from "~/lib/item-types";
import type { RouterOutputs } from "~/trpc/react";

import { usePlayer } from "../player/player-store";

type HeroItem = RouterOutputs["catalog"]["home"]["hero"][number];

const ROTATE_MS = 7000;

/**
 * Featured drops across the full width (after Wadzzo's home): the name in
 * huge type, the price as a tilted sticker, chunky buttons, and the cover as
 * a tilted sticker with a hand-written tag. Dots fill up until the next
 * slide; hovering pauses, swiping changes slides on phones.
 */
export function Hero({ items }: { items: HeroItem[] }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [touchX, setTouchX] = useState<number | null>(null);
  const playQueue = usePlayer((state) => state.playQueue);
  const count = items.length;
  const go = useCallback((to: number) => setActive(((to % count) + count) % count), [count]);

  useEffect(() => {
    if (paused || count < 2) return;
    const timer = setTimeout(() => go(active + 1), ROTATE_MS);
    return () => clearTimeout(timer);
  }, [active, paused, count, go]);

  const item = items[active];
  if (!item) return null;
  const label = TYPE_LABEL[item.type] ?? item.type;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured drops"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(event) => setTouchX(event.touches[0]?.clientX ?? null)}
      onTouchEnd={(event) => {
        const end = event.changedTouches[0]?.clientX;
        if (touchX !== null && end !== undefined && Math.abs(end - touchX) > 40)
          go(active + (end < touchX ? 1 : -1));
        setTouchX(null);
      }}
      className="relative isolate overflow-hidden border-b"
    >
      {/* the cover, blurred, as a soft wash behind everything */}
      {/* eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts */}
      <img
        key={`wash-${item.id}`}
        src={item.coverUrl}
        alt=""
        aria-hidden
        className="animate-in fade-in absolute inset-0 -z-10 size-full scale-125 object-cover opacity-25 blur-3xl duration-700"
      />

      <div className="grid max-w-[var(--page-max,96rem)] px-4 pt-6 sm:px-8 lg:pt-8">
        <div
          key={item.id}
          role="group"
          aria-roledescription="slide"
          aria-label={`${active + 1} of ${count}: ${item.title}`}
          className="animate-in fade-in slide-in-from-bottom-3 grid items-center gap-8 duration-500 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] md:gap-10"
        >
          <div className="relative order-first flex justify-center md:order-last">
            <div className="relative w-[min(52vw,12rem)] rotate-3 sm:w-[14rem] md:w-full md:max-w-[17rem]">
              <Link href={`/item/${item.slug}`} tabIndex={-1} className="group block">
                <div className="border-fg bg-surface overflow-hidden rounded-[1.6rem] border-[3px] shadow-[10px_12px_0_0_var(--color-primary)] transition-transform duration-300 group-hover:-translate-y-1 group-hover:-rotate-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts */}
                  <img
                    src={item.coverUrl}
                    alt={item.title}
                    className="aspect-square w-full object-cover"
                  />
                </div>
              </Link>
              <span className="marker bg-primary text-primary-foreground pointer-events-none absolute -top-5 -left-4 -rotate-12 rounded-lg px-2.5 py-1 text-base sm:-left-8">
                {label.toLowerCase()} drop!
              </span>
            </div>
          </div>

          <div className="grid min-w-0 content-center gap-4">
            <div className="grid gap-2">
              <p className="marker text-fg-muted -rotate-2 text-lg">
                *by{" "}
                {item.artistSlug ? (
                  <Link
                    href={`/artist/${item.artistSlug}`}
                    className="text-primary-text hover:underline"
                  >
                    {item.artistName}
                  </Link>
                ) : (
                  item.artistName
                )}
                *
              </p>
              <h2 className="display line-clamp-2 text-5xl break-words sm:text-6xl">
                {item.title}
              </h2>
              {item.description && (
                <p className="text-fg-muted line-clamp-2 max-w-xl text-[15px]">
                  {item.description}
                </p>
              )}
            </div>

            {item.price && (
              <div className="bg-primary text-primary-foreground inline-grid w-fit -rotate-2 gap-0.5 rounded-2xl px-4 py-2">
                <Money
                  amount={item.price.bandcoin}
                  currency="BANDCOIN"
                  short
                  onBrand
                  className="display text-4xl leading-none"
                />
                <p className="marker text-sm">
                  ≈ <Money amount={item.price.usd} currency="USD" /> · to own it
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`/item/${item.slug}`}
                className="bg-primary text-primary-foreground inline-flex h-12 -rotate-1 items-center gap-2 rounded-2xl px-6 transition-transform duration-200 hover:scale-[1.03] hover:rotate-0"
              >
                <Zap className="size-5 fill-current" />
                <span className="marker text-lg">Buy now</span>
              </Link>
              {item.playable ? (
                <button
                  type="button"
                  onClick={() => playQueue([item])}
                  className="bg-surface-3 inline-flex h-12 rotate-1 items-center gap-2 rounded-2xl px-5 transition-transform duration-200 hover:scale-[1.03] hover:rotate-0"
                >
                  <Play className="size-5 fill-current" />
                  <span className="marker text-lg">Play preview</span>
                </button>
              ) : (
                <Link
                  href="/marketplace"
                  className="bg-surface-3 inline-flex h-12 rotate-1 items-center gap-2 rounded-2xl px-5 transition-transform duration-200 hover:scale-[1.03] hover:rotate-0"
                >
                  <span className="marker text-lg">Explore market</span>
                  <ArrowRight className="size-5" strokeWidth={2.6} />
                </Link>
              )}
            </div>
          </div>
        </div>

        {count > 1 && (
          <div className="flex items-center justify-between gap-3 pt-5 pb-6">
            <div className="flex items-center gap-2" role="tablist" aria-label="Featured drops">
              {items.map((entry, index) => (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={index === active}
                  aria-label={`Show ${entry.title}`}
                  onClick={() => go(index)}
                  className={cn(
                    "relative h-3 overflow-hidden rounded-full transition-[width,background-color] duration-300",
                    index === active ? "bg-fg/20 w-12" : "bg-fg/30 hover:bg-fg/60 w-3",
                  )}
                >
                  {index === active && (
                    <span
                      key={`${active}-${paused}`}
                      className={cn(
                        "bg-primary absolute inset-0 origin-left rounded-full",
                        !paused && "animate-[hero-progress_7s_linear]",
                      )}
                    />
                  )}
                </button>
              ))}
            </div>
            <div className="hidden gap-2 sm:flex">
              <button
                type="button"
                onClick={() => go(active - 1)}
                aria-label="Previous slide"
                className="bg-surface hover:border-border-strong grid size-11 place-items-center rounded-full border"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                onClick={() => go(active + 1)}
                aria-label="Next slide"
                className="bg-surface hover:border-border-strong grid size-11 place-items-center rounded-full border"
              >
                <ChevronRight className="size-5" />
              </button>
            </div>
          </div>
        )}
      </div>
      <style>{"@keyframes hero-progress{from{transform:scaleX(0)}to{transform:scaleX(1)}}"}</style>
    </section>
  );
}
