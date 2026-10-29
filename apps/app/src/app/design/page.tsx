import type { Metadata } from "next";
import { CircleAlert, Heart, Lock, Play } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@bandcoin/ui/components/badge";
import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { BrandMark } from "@bandcoin/ui/patterns/boot-screen";
import { Skeleton } from "@bandcoin/ui/patterns/skeleton";

import { BootDemo } from "~/features/design-preview/boot-demo";
import { BuyPanelDemo } from "~/features/design-preview/buy-panel-demo";
import { SampleCover } from "~/features/design-preview/sample-cover";
import { ShellDemo } from "~/features/design-preview/shell-demo";
import { ThemeSwitch } from "~/components/theme-switch";

export const metadata: Metadata = { title: "Design preview", robots: { index: false } };

const SWATCHES = [
  ["Background", "bg-bg"],
  ["Surface", "bg-surface"],
  ["Raised", "bg-surface-3"],
  ["Text", "bg-fg"],
  ["Chartreuse", "bg-primary"],
  ["Success", "bg-success"],
  ["Warning", "bg-warning"],
  ["Danger", "bg-danger"],
] as const;

function Block({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="grid gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[clamp(20px,2.6vw,26px)] font-bold">{title}</h2>
        {note && <p className="text-fg-muted max-w-[62ch]">{note}</p>}
      </div>
      {children}
    </section>
  );
}

const panel = "bg-surface grid min-w-0 content-start gap-4 rounded-lg border p-6";

export default function DesignPreviewPage() {
  return (
    <main className="mx-auto grid max-w-[1180px] gap-[72px] px-[max(16px,env(safe-area-inset-left))] py-8 pb-[72px]">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BrandMark className="size-[30px]" />
          <span className="font-display text-lg font-extrabold tracking-tight">Bandcoin</span>
        </div>
        <ThemeSwitch />
      </header>

      <section className="grid items-end gap-8 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div>
          <p className="eyebrow">Design system · live in @bandcoin/ui</p>
          <h1 className="mt-3 text-[clamp(30px,5vw,52px)] leading-[1.05] font-extrabold">
            Music you can own, on a stage that stays out of the way.
          </h1>
          <p className="text-fg-muted mt-4 max-w-[58ch] text-[17px]">
            Every Bandcoin app uses these tokens and components. Album art provides the color; the interface stays calm
            and readable.
          </p>
        </div>
        <dl className="grid gap-3 text-sm">
          {[
            ["Display", "Unbounded: headings and big moments"],
            ["Text", "Onest: everything you read"],
            ["Numbers", "JetBrains Mono: prices, balances, times"],
            ["Accent", "Bandcoin chartreuse, from the guitar-pick logo"],
          ].map(([k, v]) => (
            <div key={k} className="grid grid-cols-[100px_minmax(0,1fr)] gap-3 border-b pb-3">
              <dt className="text-fg-faint">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <Block title="Boot screen" note="First visit only, under 600 ms, over the already-rendered page.">
        <BootDemo />
      </Block>

      <Block title="Color" note="Switch the theme at the top to see the light set.">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
          {SWATCHES.map(([name, cls]) => (
            <div key={name} className="bg-surface overflow-hidden rounded-md border">
              <i className={`block h-16 ${cls}`} />
              <div className="grid gap-0.5 px-3 py-2 text-[13px]">
                <b>{name}</b>
                <code className="num text-fg-muted text-xs">{cls}</code>
              </div>
            </div>
          ))}
        </div>
      </Block>

      <Block title="Type">
        <div className="grid gap-4 md:grid-cols-3">
          <div className={panel}>
            <span className="eyebrow">Display · Unbounded</span>
            <div className="font-display text-[40px] leading-none font-extrabold tracking-tight">Night Drive</div>
          </div>
          <div className={panel}>
            <span className="eyebrow">Text · Onest</span>
            <div className="text-xl font-medium">Hold 10 $NOVA to unlock the studio session and stems.</div>
          </div>
          <div className={panel}>
            <span className="eyebrow">Numbers · JetBrains Mono</span>
            <div className="num text-[26px] font-medium">25,000.00</div>
          </div>
        </div>
      </Block>

      <Block title="Controls">
        <div className="grid gap-4 md:grid-cols-2">
          <div className={panel}>
            <div className="flex flex-wrap gap-3">
              <Button>Buy now</Button>
              <Button variant="secondary">Add to playlist</Button>
              <Button variant="outline">Share</Button>
              <Button variant="destructive">Remove</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" disabled>
                Sold out
              </Button>
              <Button variant="outline" size="icon" aria-label="Like">
                <Heart />
              </Button>
              <Button variant="outline" size="icon" aria-label="Play">
                <Play className="fill-current" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="primary">You own 2</Badge>
              <Badge>Edition 14 / 100</Badge>
              <Badge variant="warning">Preview · 30 s</Badge>
              <Badge variant="destructive">Ends in 2 h</Badge>
            </div>
          </div>
          <div className={panel}>
            <label className="grid gap-1.5">
              <span className="text-[13px] font-semibold">Item name</span>
              <Input defaultValue="Night Drive (Live at Lumen)" />
              <span className="text-fg-faint text-xs">Shown on the item page and in search.</span>
            </label>
            <label className="grid gap-1.5">
              <span className="text-[13px] font-semibold">Price per copy</span>
              <Input className="num" defaultValue="25,000 BANDCOIN" inputMode="decimal" />
            </label>
          </div>
        </div>
      </Block>

      <Block title="App shell" note="Narrow the window: the sidebar turns into icons, then hides, and the right panel folds away.">
        <ShellDemo />
      </Block>

      <Block
        title="Item page and buying"
        note="Pay in the currency you pick; nothing is converted. Try 2 copies in USDC. Sample balances: 60,000 BANDCOIN, 9.8 XLM, 1.50 USDC."
      >
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
          <div className="grid gap-4">
            <SampleCover name="sunset" className="rounded-xl" />
            <span className="eyebrow">Track · Classic token · 100 editions</span>
            <h2 className="text-[clamp(26px,4vw,40px)] font-bold">Night Drive (Live at Lumen)</h2>
            <div className="grid grid-cols-3 gap-3">
              {[
                ["Owners", "64"],
                ["Left", "36 / 100"],
                ["Plays", "12.4k"],
              ].map(([k, v]) => (
                <div key={k} className="bg-surface-2 grid gap-0.5 rounded-md p-3">
                  <span className="text-fg-faint text-xs">{k}</span>
                  <b className="num text-[15px]">{v}</b>
                </div>
              ))}
            </div>
            <div className="bg-surface-2 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 rounded-md border p-4">
              <div className="grid size-14 place-items-center rounded-full bg-[conic-gradient(var(--color-warning)_0_30%,var(--color-surface-3)_30%_100%)]">
                <span className="bg-surface-2 num grid size-11 place-items-center rounded-full text-xs font-semibold">3/10</span>
              </div>
              <div className="grid gap-1">
                <h3 className="text-[15px] font-bold">
                  <Lock className="mr-1 inline size-4" />
                  Stems and studio session are for Tier 2
                </h3>
                <p className="text-fg-muted text-sm">Hold 10 $LUMEN to unlock them. You have 3.</p>
                <div>
                  <Button size="sm" variant="secondary" className="mt-1">
                    Buy 7 $LUMEN
                  </Button>
                </div>
              </div>
            </div>
          </div>
          <BuyPanelDemo />
        </div>
      </Block>

      <Block title="Loading, empty and error">
        <div className="grid gap-4 md:grid-cols-3">
          <div className={panel}>
            <span className="eyebrow">Loading a grid</span>
            <div className="grid grid-cols-3 gap-3">
              {[80, 70, 85].map((w) => (
                <div key={w} className="grid gap-2">
                  <Skeleton className="aspect-square rounded-md" />
                  <Skeleton className="h-3" style={{ width: `${w}%` }} />
                  <Skeleton className="h-2.5 w-1/2" />
                </div>
              ))}
            </div>
          </div>
          <div className={panel}>
            <div className="bg-surface-2 grid size-[72px] place-items-center rounded-full">
              <span className="bg-primary size-[18px] rounded-full" />
            </div>
            <h3 className="text-[15px] font-bold">Your collection is empty</h3>
            <p className="text-fg-muted text-sm">Songs and items you buy, receive or claim at AR pins show up here.</p>
            <div>
              <Button size="sm">Browse the marketplace</Button>
            </div>
          </div>
          <div className={panel}>
            <div className="bg-danger-soft text-danger grid size-11 place-items-center rounded-full">
              <CircleAlert className="size-5" />
            </div>
            <h3 className="text-[15px] font-bold">Couldn&apos;t load your playlists</h3>
            <p className="text-fg-muted text-sm">The connection dropped. Your playlists are safe.</p>
            <div>
              <Button size="sm" variant="secondary">
                Try again
              </Button>
            </div>
          </div>
        </div>
      </Block>
    </main>
  );
}
