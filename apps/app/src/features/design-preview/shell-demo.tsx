"use client";

import {
  Heart,
  Home,
  Layers,
  ListMusic,
  MapPin,
  Music,
  Pause,
  Play,
  Search,
  SkipBack,
  SkipForward,
  Store,
  Trophy,
  Volume2,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@actiontokens/ui/components/button";
import { cn } from "@actiontokens/ui/lib/cn";
import { BrandMark } from "@actiontokens/ui/patterns/boot-screen";
import { MediaCarousel } from "@actiontokens/ui/patterns/media-carousel";

import { SampleCover, type CoverName } from "./sample-cover";

const NAV = [
  { icon: Home, label: "Home", current: true },
  { icon: Music, label: "Music" },
  { icon: Store, label: "Marketplace" },
  { icon: Trophy, label: "Bounties" },
  { icon: MapPin, label: "AR pins" },
  { icon: Layers, label: "My collection", gap: true },
  { icon: ListMusic, label: "Playlists" },
];

const TRENDING: [CoverName, string, string, string][] = [
  ["velvet", "Velvet Static", "Mira Okafor", "18,000"],
  ["sunset", "Night Drive", "Lumen Avenue", "25,000"],
  ["harbour", "Glass Harbour", "Lumen Avenue", "30,000"],
  ["green", "Green Room", "The Paper Kites Club", "9,500"],
  ["tape", "Sunday Tape", "Lumen Avenue", "8,000"],
  ["circle", "Circle Line", "DJ Tamsin", "12,000"],
];

const MORE: [CoverName, string, string, string][] = [
  ["tape", "Sunday Tape", "Track", "8,000"],
  ["circle", "Tour poster '26", "Collectible", "12,500"],
  ["green", "Backstage pass", "Tier 2 only", "40,000"],
];

/** Sidebar, top bar, contextual right panel and the persistent player. */
export function ShellDemo() {
  const [playing, setPlaying] = useState(true);

  return (
    <div className="bg-bg shadow-raised grid min-h-[620px] grid-cols-1 grid-rows-[minmax(0,1fr)_auto] overflow-hidden rounded-xl border sm:grid-cols-[64px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)_260px]">
      <nav
        aria-label="Main"
        className="bg-surface hidden content-start gap-1 border-r px-3 py-4 sm:grid"
      >
        <div className="flex items-center justify-center gap-2 pb-4 xl:justify-start xl:px-2">
          <BrandMark className="size-[26px]" />
          <span className="font-display hidden text-[15px] font-extrabold tracking-tight xl:inline">
            Action Tokens
          </span>
        </div>
        {NAV.map(({ icon: Icon, label, current, gap }) => (
          <div key={label} className="contents">
            {gap && <div className="bg-border mx-2 my-3 h-px" />}
            <button
              type="button"
              aria-current={current ? "page" : undefined}
              className={cn(
                "text-fg-muted hover:bg-surface-2 hover:text-fg flex h-[38px] w-full items-center justify-center gap-3 rounded-sm text-sm font-medium xl:justify-start xl:px-3",
                current && "bg-surface-3 text-fg",
              )}
            >
              <Icon className="size-[18px] shrink-0" />
              <span className="hidden xl:inline">{label}</span>
            </button>
          </div>
        ))}
      </nav>

      <div className="grid min-w-0 content-start gap-6 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="bg-surface text-fg-faint flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border px-4 text-sm">
            <Search className="size-4 shrink-0" />
            <span className="truncate">Search songs, artists, items</span>
          </div>
          <div className="bg-surface flex h-10 items-center gap-2 rounded-full border pr-3 pl-1.5 text-[13px] font-semibold whitespace-nowrap">
            <span className="size-7 rounded-full bg-[conic-gradient(var(--color-primary),#3fb5ff,var(--color-primary))]" />
            <span className="num hidden sm:inline">60,000 ACTION</span>
          </div>
        </div>

        <div className="relative isolate grid min-h-[220px] items-end overflow-hidden rounded-xl p-6">
          <SampleCover name="velvet" className="absolute inset-0 -z-20 aspect-auto rounded-none" />
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgb(5_8_9/0.86),rgb(5_8_9/0.5)_55%,transparent)]" />
          <div className="grid max-w-[420px] gap-3 text-white">
            <span className="eyebrow !text-white/70">New drop · 100 editions</span>
            <h2 className="text-[clamp(22px,3vw,32px)] font-bold">Velvet Static</h2>
            <p className="text-sm text-white/80">
              Mira Okafor&apos;s second EP, with a signed digital poster and stems for every holder.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button>
                <Play className="fill-current" /> Play preview
              </Button>
              <Button variant="secondary" className="bg-white/15 text-white hover:bg-white/25">
                View drop
              </Button>
            </div>
          </div>
        </div>

        <MediaCarousel title="Trending this week">
          {TRENDING.map(([cover, title, artist, price]) => (
            <div key={title} className="group grid min-w-0 cursor-pointer gap-2">
              <div className="relative">
                <SampleCover
                  name={cover}
                  className="transition-transform duration-250 group-hover:-translate-y-[3px]"
                />
                <button
                  type="button"
                  aria-label={`Play ${title}`}
                  className="bg-primary text-primary-foreground absolute right-2.5 bottom-2.5 z-10 grid size-10 translate-y-1.5 place-items-center rounded-full opacity-0 transition-all duration-250 group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100"
                >
                  <Play className="size-4 fill-current" />
                </button>
              </div>
              <div className="truncate text-sm font-semibold">{title}</div>
              <div className="text-fg-muted -mt-1.5 flex justify-between gap-2 text-[13px]">
                <span className="truncate">{artist}</span>
                <span className="num text-fg text-xs">{price}</span>
              </div>
            </div>
          ))}
        </MediaCarousel>
      </div>

      <aside
        aria-label="Now playing"
        className="bg-surface hidden content-start gap-5 border-l p-4 xl:grid"
      >
        <div className="grid gap-3">
          <span className="eyebrow">Now playing</span>
          <SampleCover name="sunset" />
          <div>
            <h3 className="text-base font-bold">Night Drive</h3>
            <p className="text-fg-muted text-[13px]">Lumen Avenue · You own this</p>
          </div>
        </div>
        <div className="grid gap-3">
          <span className="eyebrow">More from Lumen Avenue</span>
          {MORE.map(([cover, title, kind, price]) => (
            <div
              key={title}
              className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 text-[13px]"
            >
              <SampleCover name={cover} className="rounded-sm" />
              <div className="min-w-0">
                <b className="block truncate font-semibold">{title}</b>
                <span className="text-fg-muted">{kind}</span>
              </div>
              <span className="num">{price}</span>
            </div>
          ))}
        </div>
      </aside>

      <div
        aria-label="Player"
        className="bg-surface col-span-full grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-t px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)]"
      >
        <div className="flex min-w-0 items-center gap-3">
          <SampleCover name="sunset" className="w-11 shrink-0 rounded-sm" />
          <div className="min-w-0">
            <b className="block truncate text-sm">Night Drive</b>
            <span className="text-fg-muted text-xs">Lumen Avenue</span>
          </div>
        </div>
        <div className="grid justify-items-center gap-1.5">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Previous"
              className="hidden sm:inline-flex"
            >
              <SkipBack className="fill-current" />
            </Button>
            <Button
              size="icon"
              aria-label={playing ? "Pause" : "Play"}
              className="bg-fg text-bg hover:bg-fg/90"
              onClick={() => setPlaying((p) => !p)}
            >
              {playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Next"
              className="hidden sm:inline-flex"
            >
              <SkipForward className="fill-current" />
            </Button>
          </div>
          <div className="num text-fg-faint hidden w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 text-[11px] sm:grid">
            <span>1:12</span>
            <div className="bg-surface-3 relative h-1 overflow-hidden rounded">
              <i className="bg-fg absolute inset-y-0 left-0 w-[34%] rounded" />
            </div>
            <span>3:31</span>
          </div>
        </div>
        <div className="hidden justify-end gap-1 sm:flex">
          <Button variant="ghost" size="icon-sm" aria-label="Like">
            <Heart />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Volume">
            <Volume2 />
          </Button>
        </div>
      </div>
    </div>
  );
}
