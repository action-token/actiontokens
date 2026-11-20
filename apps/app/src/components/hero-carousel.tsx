"use client";

import { ChevronLeft, ChevronRight, Share2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import toast from "react-hot-toast";

import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { cn } from "@actiontokens/ui/lib/cn";

const ROTATE_MS = 7000;

/**
 * A full-width carousel above a page (the Artists and Songs heroes): one slide at a
 * time over a background image, arrows at the slide's sides, dots under it that fill
 * until the next slide. Hovering pauses; swiping changes slides on phones.
 */
export function HeroCarousel<T>({
  label,
  items,
  keyOf,
  nameOf,
  backgroundOf,
  renderSlide,
}: {
  label: string;
  items: T[];
  keyOf: (item: T) => string;
  nameOf: (item: T) => string;
  /** The image behind the slide; null for the plain page background. */
  backgroundOf: (item: T) => string | null;
  renderSlide: (item: T, index: number) => ReactNode;
}) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [touchX, setTouchX] = useState<number | null>(null);
  const count = items.length;
  const go = useCallback((to: number) => setActive(((to % count) + count) % count), [count]);

  useEffect(() => {
    if (paused || count < 2) return;
    const timer = setTimeout(() => go(active + 1), ROTATE_MS);
    return () => clearTimeout(timer);
  }, [active, paused, count, go]);

  const item = items[Math.min(active, count - 1)];
  if (item === undefined) return null;
  const background = backgroundOf(item);

  return (
    <section
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(event) => setTouchX(event.touches[0]?.clientX ?? null)}
      onTouchEnd={(event) => {
        const end = event.changedTouches[0]?.clientX;
        if (touchX !== null && end !== undefined && Math.abs(end - touchX) > 40)
          go(active + (end < touchX ? 1 : -1));
        setTouchX(null);
      }}
      className="bleed relative isolate overflow-hidden border-b"
    >
      {background && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts */}
          <img
            key={`bg-${keyOf(item)}`}
            src={background}
            alt=""
            aria-hidden
            className={cn(
              "animate-in fade-in absolute inset-0 -z-20 size-full object-cover duration-700",
              "opacity-60",
            )}
          />
          <div
            aria-hidden
            className="from-bg via-bg/70 to-bg/35 absolute inset-0 -z-10 bg-gradient-to-t"
          />
        </>
      )}

      <div className="grid max-w-[var(--page-max,96rem)] px-4 pt-6 sm:px-8 lg:pt-8">
        {/* The slide, with the arrows at its sides, level with its middle */}
        <div
          className="relative"
          role="group"
          aria-roledescription="slide"
          aria-label={`${active + 1} of ${count}: ${nameOf(item)}`}
        >
          <div key={keyOf(item)} className="animate-in fade-in slide-in-from-bottom-3 duration-500">
            {renderSlide(item, active)}
          </div>
          {count > 1 && (
            <>
              <Arrow dir={-1} onClick={() => go(active - 1)} />
              <Arrow dir={1} onClick={() => go(active + 1)} />
            </>
          )}
        </div>

        {count > 1 ? (
          <div
            className="flex items-center justify-center gap-2 pt-5 pb-6"
            role="tablist"
            aria-label={label}
          >
            {items.map((entry, index) => (
              <button
                key={keyOf(entry)}
                type="button"
                role="tab"
                aria-selected={index === active}
                aria-label={`Show ${nameOf(entry)}`}
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
        ) : (
          <div className="pb-6" />
        )}
      </div>
      <style>{"@keyframes hero-progress{from{transform:scaleX(0)}to{transform:scaleX(1)}}"}</style>
    </section>
  );
}

/** Previous / next, on the slide's left and right edge. Hidden on phones (swipe instead). */
function Arrow({ dir, onClick }: { dir: -1 | 1; onClick: () => void }) {
  const Icon = dir === -1 ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={dir === -1 ? "Previous slide" : "Next slide"}
      className={cn(
        "bg-surface/80 hover:bg-surface hover:border-border-strong absolute top-1/2 hidden size-11 -translate-y-1/2 place-items-center rounded-full border backdrop-blur-sm transition-colors sm:grid",
        dir === -1 ? "left-0" : "right-0",
      )}
    >
      <Icon className="size-5" />
    </button>
  );
}

/**
 * A hero slide's layout: the round image (with a hand-written tag) on the left, and
 * everything else centred beside it, as one block in the middle. Stacked on phones.
 */
export function HeroSlide({
  href,
  image,
  ringed = false,
  tag,
  children,
}: {
  href: string;
  /** The round picture (an <img>, or a placeholder of the same size) */
  image: ReactNode;
  /** Accent ring (e.g. a live story) instead of the plain one */
  ringed?: boolean;
  tag: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-[21rem] flex-col items-center justify-center gap-6 md:flex-row md:gap-12 md:px-16">
      <div className="relative shrink-0">
        <Link href={href} tabIndex={-1} className="group block">
          <span
            className={cn(
              "block rounded-full p-1.5 shadow-[0_0_0_3px_var(--color-fg),10px_12px_0_3px_var(--color-primary)] transition-transform duration-300 group-hover:-translate-y-1",
              ringed ? "bg-primary" : "bg-fg",
            )}
          >
            {image}
          </span>
        </Link>
        <span className="marker bg-primary text-primary-foreground pointer-events-none absolute top-1 -left-3 -rotate-12 rounded-lg px-2.5 py-1 text-base sm:-left-6">
          {tag}
        </span>
      </div>
      <div className="grid w-full min-w-0 content-center justify-items-center gap-4 text-center md:w-[32rem]">
        {children}
      </div>
    </div>
  );
}

/** The round image's size, for an <img> or a placeholder inside `HeroSlide`. */
export const HERO_IMAGE = "size-44 rounded-full sm:size-52 md:size-60";

/** A count chip on a hero slide: "6 fans", "1.2K plays". */
export function HeroStat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof ChevronLeft;
  value: ReactNode;
  label: string;
}) {
  return (
    <li className="bg-surface-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
      <Icon className="text-fg-muted size-3.5" />
      <b className="display text-xl leading-none">{value}</b>
      <span className="text-fg-muted">{label}</span>
    </li>
  );
}

/** Share a page: the phone's share sheet, or copy the link. */
export function HeroShare({ name, href }: { name: string; href: string }) {
  const share = async () => {
    const url = new URL(href, window.location.origin).toString();
    if (navigator.share) await navigator.share({ title: name, url }).catch(() => undefined);
    else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    }
  };
  return (
    <button
      type="button"
      onClick={() => void share()}
      aria-label={`Share ${name}`}
      className="bg-surface-3 grid size-10 place-items-center rounded-full transition-transform hover:-rotate-12"
    >
      <Share2 className="size-4" />
    </button>
  );
}

/** Holds the hero's height while its items load, so the page doesn't jump. */
export function HeroCarouselSkeleton() {
  return (
    <section aria-hidden className="bleed border-b">
      <div className="flex min-h-[21rem] max-w-[var(--page-max,96rem)] flex-col items-center justify-center gap-6 px-4 pt-6 pb-6 sm:px-8 md:flex-row md:gap-12 md:px-24 lg:pt-8">
        <Skeleton className={cn(HERO_IMAGE, "shrink-0")} />
        <div className="grid w-full justify-items-center gap-4 md:w-[32rem]">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-16 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-12 w-72 rounded-2xl" />
        </div>
      </div>
    </section>
  );
}
