"use client";

import { Play } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { cn } from "@bandcoin/ui/lib/cn";

import { Money } from "~/components/money";
import type { RouterOutputs } from "~/trpc/react";

import { TYPE_LABEL } from "~/lib/item-types";
import { usePlayer } from "../player/player-store";

type HeroItem = RouterOutputs["catalog"]["home"]["hero"][number];

const ROTATE_MS = 7000;

/** The featured drops, one at a time, rotating until someone interacts. */
export function Hero({ items }: { items: HeroItem[] }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const playQueue = usePlayer((state) => state.playQueue);

  useEffect(() => {
    if (paused || items.length < 2) return;
    const timer = setInterval(() => setActive((index) => (index + 1) % items.length), ROTATE_MS);
    return () => clearInterval(timer);
  }, [paused, items.length]);

  const item = items[active];
  if (!item) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      className="relative isolate grid min-h-[260px] items-end overflow-hidden rounded-xl p-6 sm:min-h-[300px] sm:p-8"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts */}
      <img key={item.id} src={item.coverUrl} alt="" className="animate-in fade-in absolute inset-0 -z-20 size-full object-cover duration-500" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgb(5_8_9/0.88),rgb(5_8_9/0.55)_55%,rgb(5_8_9/0.15))]" />
      <div className="grid max-w-[460px] gap-3 text-white">
        <span className="text-[11px] font-semibold tracking-[0.18em] text-white/70 uppercase">
          {TYPE_LABEL[item.type] ?? item.type} · {item.artistName}
        </span>
        <h2 className="font-display text-[clamp(24px,3.4vw,38px)] leading-[1.05] font-extrabold tracking-tight">{item.title}</h2>
        {item.description && <p className="line-clamp-2 text-sm text-white/80">{item.description}</p>}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {item.playable && (
            <Button onClick={() => playQueue([item])}>
              <Play className="fill-current" /> Play preview
            </Button>
          )}
          <Button asChild variant="secondary" className="bg-white/15 text-white hover:bg-white/25">
            <Link href={`/item/${item.slug}`}>
              {item.price ? (
                <>
                  Buy · <Money amount={item.price.bandcoin} currency="BANDCOIN" />
                </>
              ) : (
                "View"
              )}
            </Link>
          </Button>
        </div>
      </div>
      {items.length > 1 && (
        <div className="absolute right-6 bottom-6 flex gap-1.5" role="tablist" aria-label="Choose a featured drop">
          {items.map((entry, index) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={index === active}
              aria-label={entry.title}
              onClick={() => setActive(index)}
              className={cn("h-1.5 rounded-full bg-white/40 transition-all", index === active ? "w-6 bg-white" : "w-1.5")}
            />
          ))}
        </div>
      )}
    </section>
  );
}
