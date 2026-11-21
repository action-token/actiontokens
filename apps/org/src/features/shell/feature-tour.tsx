"use client";

import {
  ArrowDownUp,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  Crown,
  Download,
  FileText,
  GripVertical,
  Layers,
  LayoutTemplate,
  MapPin,
  MapPinned,
  Music2,
  Package,
  Pencil,
  Plus,
  QrCode,
  ScanLine,
  Search,
  Send,
  Star,
  Ticket,
  TrendingUp,
  Trophy,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { Button } from "@actiontokens/ui/components/button";
import { Input } from "@actiontokens/ui/components/input";
import { Textarea } from "@actiontokens/ui/components/textarea";
import { Switch } from "@actiontokens/ui/components/switch";
import { cn } from "@actiontokens/ui/lib/cn";
import { PageHeader } from "@actiontokens/ui/patterns/page-header";
import { Person } from "@actiontokens/ui/patterns/person";
import { PinGlyph } from "@actiontokens/ui/patterns/pin-glyph";
import { StatCard } from "@actiontokens/ui/patterns/stat-card";
import { StatusPill } from "@actiontokens/ui/patterns/status-pill";
import { WalletAssets, WalletHero, WalletPanel } from "@actiontokens/ui/patterns/wallet-blocks";

import { MAPBOX_TOKEN } from "../pins/mapbox";
import { CollectionsChart, PeriodPicker, type Period, periodRange } from "../reports/report-kit";

/**
 * "What you can do": a pinned, full-height section that scrolls sideways while you scroll down
 * (the horizontal-scroll pattern). An intro panel, then one screen-wide panel per feature: the
 * details on the side, and the real portal page for it, built from the same shared components the
 * portal uses, with example data. Light on the GPU: scroll moves one track with translate3d (once
 * per frame, only while the section is on screen); a panel's page plays its one-shot rise when it
 * reaches the middle. Nothing runs at rest.
 */

type Chapter = {
  id: string;
  path: string;
  icon: LucideIcon;
  tag: string;
  title: string;
  body: string;
  points: string[];
  Page: () => ReactNode;
};

const CHAPTERS: Chapter[] = [
  {
    id: "map",
    path: "/pins",
    icon: MapPinned,
    tag: "Map & pins",
    title: "Drop it on the real map.",
    body: "Put collectibles at real places. Fans walk there and catch them in the AR app.",
    points: ["Schedule when a drop opens", "Limit how many exist", "A QR code for every pin"],
    Page: MapPage,
  },
  {
    id: "reports",
    path: "/reports",
    icon: BarChart3,
    tag: "Pin reports",
    title: "See who showed up.",
    body: "Every collection is counted, per day and per pin. Export it whenever you like.",
    points: ["Collections over time", "Top pins and places", "CSV export"],
    Page: ReportsPage,
  },
  {
    id: "bounties",
    path: "/bounties",
    icon: Trophy,
    tag: "Bounties",
    title: "The prize, locked in.",
    body: "The prize goes into escrow on Stellar before anyone starts. Fans submit, you pick the winners.",
    points: ["General or music bounties", "Prize held in escrow", "Several winners"],
    Page: BountiesPage,
  },
  {
    id: "items",
    path: "/items",
    icon: Package,
    tag: "Music & items",
    title: "Sell what you make.",
    body: "Songs, art, tickets and merch become collectibles fans own, paid in ACTION or by card.",
    points: ["Limited or open editions", "Songs and albums", "Unlocks for holders"],
    Page: ItemsPage,
  },
  {
    id: "memberships",
    path: "/memberships",
    icon: Crown,
    tag: "Memberships",
    title: "Your token. Their tier.",
    body: "Fans unlock tiers by holding your fan token. Nothing to bill: what they hold decides their tier.",
    points: ["Tiers with perks", "Members-only posts", "Gifts to your fans"],
    Page: MembershipsPage,
  },
  {
    id: "events",
    path: "/events",
    icon: CalendarDays,
    tag: "Events",
    title: "Tell them where to be.",
    body: "Events and announcements go live straight away for fans in the app and on the map.",
    points: ["RSVPs and capacity", "Link pins and bounties", "Posts and stories"],
    Page: EventsPage,
  },
  {
    id: "page",
    path: "/page",
    icon: LayoutTemplate,
    tag: "My page",
    title: "Your page, block by block.",
    body: "Build your organization's page, put it on your own domain, and embed your live map anywhere.",
    points: ["Drag-and-drop blocks", "Custom domain", "Embeddable map"],
    Page: PageBuilderPage,
  },
  {
    id: "wallet",
    path: "/wallet",
    icon: Wallet,
    tag: "Wallet",
    title: "Paid in ACTION.",
    body: "Sales, royalties and gifts land in your wallet on Stellar. Swap, send or keep them.",
    points: ["Royalties on resales", "Swap ACTION, XLM, USDC", "Redeem codes at your door"],
    Page: WalletPage,
  },
];

/** Panels on the track: the intro, then one per chapter. */
const PANELS = CHAPTERS.length + 1;

export function FeatureTour() {
  const section = useRef<HTMLElement>(null);
  const stick = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(-1);
  // the furthest panel reached: panels behind it stay filled in
  const [reached, setReached] = useState(-1);

  useEffect(() => {
    const el = section.current;
    if (!el) return;
    let raf = 0;
    let last = -2;
    let panel = 0;
    let lockedUntil = 0;
    let settle = 0;

    const geometry = () => {
      const rect = el.getBoundingClientRect();
      const span = Math.max(1, rect.height - innerHeight);
      return { rect, span, top: rect.top + scrollY };
    };
    const engaged = () => {
      const { rect } = geometry();
      return rect.top <= 1 && rect.bottom >= innerHeight - 1;
    };
    const goTo = (index: number) => {
      const { span, top } = geometry();
      scrollTo({ top: top + (span * index) / (PANELS - 1), behavior: "smooth" });
    };

    const update = () => {
      raf = 0;
      const { rect, span } = geometry();
      const p = Math.min(1, Math.max(0, -rect.top / span));
      const width = stick.current?.clientWidth ?? innerWidth;
      const x = p * (PANELS - 1);
      if (track.current)
        track.current.style.transform = `translate3d(${(-x * width).toFixed(1)}px,0,0)`;
      stick.current?.style.setProperty("--p", p.toFixed(4));
      panel = Math.round(x);
      const index = panel - 1;
      if (index !== last) {
        last = index;
        setActive(index);
        setReached((prev) => Math.max(prev, index));
      }
      // when scrolling stops between two pages, finish the move to the nearer one
      clearTimeout(settle);
      settle = window.setTimeout(() => {
        if (!engaged() || Date.now() < lockedUntil) return;
        const off = Math.abs(x - panel) * innerHeight;
        if (off > 2) goTo(panel);
      }, 140);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    // one wheel gesture = one page, while the section is pinned
    const onWheel = (event: WheelEvent) => {
      if (!engaged() || Math.abs(event.deltaY) < 4) return;
      const dir = event.deltaY > 0 ? 1 : -1;
      const next = panel + dir;
      if (next < 0 || next > PANELS - 1) return; // let the page carry on past the ends
      event.preventDefault();
      if (Date.now() < lockedUntil) return;
      lockedUntil = Date.now() + 850;
      goTo(next);
    };
    const onKey = (event: KeyboardEvent) => {
      if (!engaged()) return;
      const dir =
        event.key === "ArrowDown" || event.key === "PageDown" || event.key === "ArrowRight"
          ? 1
          : event.key === "ArrowUp" || event.key === "PageUp" || event.key === "ArrowLeft"
            ? -1
            : 0;
      const next = panel + dir;
      if (!dir || next < 0 || next > PANELS - 1) return;
      event.preventDefault();
      lockedUntil = Date.now() + 850;
      goTo(next);
    };

    let listening = false;
    const io = new IntersectionObserver(([entry]) => {
      const on = entry?.isIntersecting ?? false;
      if (on && !listening) {
        addEventListener("scroll", onScroll, { passive: true });
        addEventListener("resize", onScroll);
        addEventListener("wheel", onWheel, { passive: false });
        addEventListener("keydown", onKey);
        onScroll();
      } else if (!on && listening) {
        removeEventListener("scroll", onScroll);
        removeEventListener("resize", onScroll);
        removeEventListener("wheel", onWheel);
        removeEventListener("keydown", onKey);
      }
      listening = on;
    });
    io.observe(el);
    return () => {
      io.disconnect();
      clearTimeout(settle);
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
      removeEventListener("wheel", onWheel);
      removeEventListener("keydown", onKey);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  /** Jump to a page from the tabs. */
  const go = (panel: number) => {
    const el = section.current;
    if (!el) return;
    const span = el.offsetHeight - innerHeight;
    const top = el.getBoundingClientRect().top + scrollY;
    scrollTo({ top: top + (span * panel) / (PANELS - 1), behavior: "smooth" });
  };

  const current = active >= 0 ? CHAPTERS[active] : undefined;

  return (
    <section
      ref={section}
      className="tour bleed"
      style={{ height: `${PANELS * 100}vh` }}
      aria-label="What you can do in the portal"
    >
      <div ref={stick} className="tour-stick">
        {/* the pages as tabs, across the top */}
        <nav className="tour-tabs-bar" aria-label="Tour pages">
          {CHAPTERS.map((chapter, index) => (
            <button
              key={chapter.id}
              type="button"
              onClick={() => go(index + 1)}
              data-on={active === index || undefined}
              aria-current={active === index ? "page" : undefined}
            >
              <chapter.icon className="size-4" />
              <span>{chapter.tag}</span>
            </button>
          ))}
          <span className="tour-tabs-count gx-mono" aria-hidden>
            {String(Math.max(0, active + 1)).padStart(2, "0")} /{" "}
            {String(CHAPTERS.length).padStart(2, "0")}
          </span>
        </nav>

        <div ref={track} className="tour-track">
          <div className="tour-panel tour-intro">
            <p className="lp-tag">Inside the portal</p>
            <h2 className="tour-big lp-chrome">
              What you
              <br />
              can do<em>.</em>
            </h2>
            <p className="text-fg-muted mt-6 max-w-md text-lg text-pretty">
              Every page of the portal, as you&apos;ll see it. One scroll, one page.
            </p>
            <span className="tour-cue" aria-hidden>
              Scroll <ArrowRight className="size-4" />
            </span>
          </div>

          {CHAPTERS.map((chapter, index) => (
            <div
              key={chapter.id}
              className="tour-panel"
              data-on={index <= reached || undefined}
              aria-hidden={active !== index}
            >
              <div className="tour-page" data-full={chapter.id === "map" || undefined}>
                <chapter.Page />
              </div>
            </div>
          ))}
        </div>

        {/* what the page is for, small, bottom right */}
        <aside className="tour-caption" data-on={current ? true : undefined} aria-live="polite">
          {current && (
            <div key={current.id} className="tour-caption-in">
              <span className="tour-tag">
                <current.icon className="size-3.5" strokeWidth={2.4} /> {current.tag}
              </span>
              <p className="tour-caption-title">{current.title}</p>
              <p className="text-fg-muted mt-1.5 text-[13px] leading-relaxed">{current.body}</p>
            </div>
          )}
        </aside>
        <div className="tour-progress" aria-hidden>
          <i />
        </div>
      </div>
    </section>
  );
}
/* ── The pages, as the portal draws them (example data) ─────────────────── */

const ART = {
  sunset: "linear-gradient(160deg,#ff8a3d,#ff3d7f 45%,#6b3dff)",
  ocean: "linear-gradient(160deg,#3ef0ff,#3d7bff 50%,#20124d)",
  acid: "linear-gradient(160deg,#d4ff2a,#0aff54 50%,#04320f)",
  chrome: "linear-gradient(160deg,#f2f2f2,#7a7a7a 45%,#111)",
  violet: "linear-gradient(160deg,#b06bff,#ff3dd8 55%,#3d0b40)",
};

/** Stagger: elements with data-a rise in, in order, when their panel turns on. */
const a = (i: number) => ({ "data-a": "", style: { ["--i" as string]: i } });

/** A real map picture of Banani, Dhaka (Mapbox static images, the same API the map style
 * thumbnails use), one per theme. */
const snapshot = (theme: "dark" | "light") =>
  `https://api.mapbox.com/styles/v1/mapbox/${theme}-v11/static/90.4066,23.7937,14.6,0/1280x760?attribution=false&logo=false&access_token=${MAPBOX_TOKEN ?? ""}`;

const PINS = [
  {
    x: 52,
    y: 30,
    title: "Sunset Sessions poster",
    place: "Rooftop stairs",
    n: "41 / 300",
    look: "active",
    color: "#ff5c8a",
    count: 3,
  },
  {
    x: 63,
    y: 52,
    title: "Rooftop Live entry",
    place: "Banani Rd 11",
    n: "12 / 200",
    look: "active",
    color: "#3d9bff",
  },
  {
    x: 72,
    y: 26,
    title: "Night Drive drop",
    place: "Gulshan 2 circle",
    n: "88 / 500",
    look: "active",
    color: "#7cff5a",
    auto: true,
  },
  {
    x: 46,
    y: 64,
    title: "Chrome skull key",
    place: "Kemal Ataturk Ave",
    n: "Starts Fri",
    look: "scheduled",
    color: "#c9c9c9",
  },
  {
    x: 80,
    y: 68,
    title: "Record tote",
    place: "Gulshan lake",
    n: "150 / 150",
    look: "collected",
    color: "#b06bff",
  },
] as const;

const RING = {
  active: "var(--color-primary)",
  scheduled: "var(--color-info)",
  collected: "var(--color-warning)",
} as const;

/** The map page as the portal draws it: the map edge to edge, the toolbar on top, the New pin
 * card on the left, In view on the right. */
function MapPage() {
  return (
    <div className="tour-map">
      {MAPBOX_TOKEN ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={snapshot("dark")}
            alt=""
            loading="lazy"
            className="tour-map-img"
            data-for="dark"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={snapshot("light")}
            alt=""
            loading="lazy"
            className="tour-map-img"
            data-for="light"
          />
        </>
      ) : null}

      {PINS.map((pin, index) => (
        <span
          key={pin.title}
          className="tour-pin"
          style={{ left: `${pin.x}%`, top: `${pin.y}%`, ["--i" as string]: index + 1 }}
        >
          <PinGlyph
            size={44}
            color={pin.color}
            ringColor={RING[pin.look]}
            ringWidth={2.5}
            badge={"auto" in pin}
          />
          {"count" in pin && (
            <span className="bg-primary text-primary-ink num absolute -right-1.5 -bottom-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold shadow">
              {pin.count}
            </span>
          )}
        </span>
      ))}
      {/* where the new pin goes */}
      <span className="tour-drop" style={{ left: "58%", top: "44%" }} aria-hidden>
        <span className="bg-primary border-surface block size-5 rounded-full border-[3px] shadow-lg ring-2 ring-black/20" />
      </span>

      {/* toolbar */}
      <div
        className="absolute inset-x-4 top-4 z-10 flex flex-wrap items-start gap-2 lg:left-[26rem]"
        {...a(1)}
      >
        <div className="bg-surface flex h-10 w-80 items-center gap-2 rounded-lg border px-3 shadow-sm">
          <Search className="text-fg-faint size-4" />
          <span className="text-fg-faint text-sm">Search a place</span>
        </div>
        <div className="bg-surface flex h-10 items-center gap-2 rounded-lg border px-3 shadow-sm">
          <Switch checked={false} tabIndex={-1} aria-label="Show ended" />
          <span className="text-xs font-medium">Show ended</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" className="shadow-sm" tabIndex={-1}>
            <Layers /> Main map
          </Button>
        </div>
      </div>

      {/* New pin card (left, full height), as the form card draws it */}
      <div className="absolute top-4 bottom-4 left-4 z-20 flex" {...a(2)}>
        <div className="bg-surface border-fg/10 relative flex max-h-full w-[380px] flex-col overflow-hidden rounded-[1.2rem] border-2 shadow-lg">
          <div className="border-fg/10 border-b-2 p-3">
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">New pin</p>
              <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs" tabIndex={-1}>
                Full page
              </Button>
              <span className="text-fg-muted grid size-8 place-items-center" aria-hidden>
                <X className="size-4" />
              </span>
            </div>
            <p className="text-fg-muted mt-1 text-xs">Click the map where the pin goes.</p>
          </div>
          <div data-slot="tabs-list" className="mx-3 mt-3 flex">
            {["Details", "Look", "Collect", "Schedule"].map((tab, index) => (
              <span
                key={tab}
                data-slot="tabs-trigger"
                data-state={index === 0 ? "active" : undefined}
                className="flex-1 py-1.5 text-center text-xs font-semibold"
              >
                {tab}
              </span>
            ))}
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-hidden p-3">
            <CardSection icon={FileText} title="About the pin">
              <Field label="Title">
                <Input readOnly tabIndex={-1} value="Thursday live: first 100" />
              </Field>
              <Field label="Description">
                <Textarea
                  readOnly
                  tabIndex={-1}
                  rows={3}
                  value="Catch it on the stairs before the show. First 100 fans get a free drink."
                />
              </Field>
            </CardSection>
            <CardSection icon={Users} title="Who can collect">
              <Field label="Open to">
                <div
                  data-slot="select-trigger"
                  className="flex h-9 items-center justify-between rounded-md border px-3 text-sm"
                >
                  Everyone <ChevronDown className="text-fg-faint size-4" />
                </div>
              </Field>
            </CardSection>
          </div>
          <div className="border-fg/10 flex items-center justify-end gap-1.5 border-t-2 p-3">
            <Button variant="ghost" size="sm" className="mr-auto h-8 px-3 text-xs" tabIndex={-1}>
              Cancel
            </Button>
            <Button size="sm" className="h-8 px-3 text-xs" tabIndex={-1}>
              Next
            </Button>
          </div>
        </div>
      </div>

      {/* In view (right, under the toolbar) */}
      <section
        className="bg-surface/95 border-fg/10 absolute top-16 right-4 z-10 w-72 overflow-hidden rounded-[1.4rem] border-2 shadow-lg"
        {...a(3)}
      >
        <div className="flex w-full items-center gap-2 px-4 py-3">
          <MapPin className="text-primary-text size-4" />
          <span className="text-sm font-semibold">In view</span>
          <span className="bg-surface-2 num rounded-full px-2 py-0.5 text-xs font-semibold">
            {PINS.length}
          </span>
          <ChevronDown className="text-fg-muted ml-auto size-4" />
        </div>
        <ul className="divide-y border-t">
          {PINS.map((pin) => (
            <li key={pin.title} className="flex items-center gap-3 px-4 py-2.5">
              <span className="size-9 shrink-0 rounded-lg" style={{ background: pin.color }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{pin.title}</span>
                <span className="text-fg-muted block truncate text-xs">
                  {pin.place} · {pin.n}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="bg-primary text-primary-foreground absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full px-4 py-1.5 text-xs font-semibold shadow-lg lg:ml-48">
        Click the map where the pin goes
      </div>
    </div>
  );
}

/** A section inside a form card: a small box with an icon badge and a bold title. */
function CardSection({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="bg-surface-2/50 border-fg/10 rounded-2xl border p-3">
      <div className="mb-3 flex items-start gap-2.5">
        <span className="bg-primary/15 text-primary flex size-7 shrink-0 items-center justify-center rounded-lg">
          <Icon className="size-4" strokeWidth={2.4} aria-hidden />
        </span>
        <h2 className="text-sm leading-7 font-semibold">{title}</h2>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-xs font-semibold">{label}</span>
      {children}
    </div>
  );
}

const DAILY = Array.from({ length: 30 }, (_, index) => {
  const day = new Date(Date.UTC(2026, 9, 23 + index));
  const n = Math.round(18 + 14 * Math.sin(index / 3.2) + index * 1.6 + ((index * 7) % 5) * 3);
  return { day: day.toISOString().slice(0, 10), n };
});

function ReportsPage() {
  const [period, setPeriod] = useState<Period>(() => periodRange("30d", new Date(2026, 10, 21)));
  const collectors = [
    ["m0ss", 64],
    ["velvet.ops", 51],
    ["drift.king", 47],
    ["nadia.r", 39],
    ["sabbir", 31],
  ] as const;
  const top = [
    ["Rooftop stairs", 412],
    ["Lake-side listening", 268],
    ["Gulshan 2 circle", 190],
  ] as const;
  return (
    <div className="grid gap-4">
      <div {...a(0)}>
        <PageHeader
          eyebrow="Drops"
          title="Pin reports"
          description="How your pins are collected: by whom, where and when."
          actions={
            <Button variant="outline" tabIndex={-1}>
              <Download /> Export CSV
            </Button>
          }
        />
      </div>
      <div {...a(1)}>
        <PeriodPicker value={period} onChange={setPeriod} />
      </div>
      <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {(
          [
            ["Collections", ScanLine, "1,284", "+18% on the last 30 days"],
            ["Collectors", Users, "312", "+9% on the last 30 days"],
            ["Pins collected", MapPin, "24 / 31", "pins with a collection in 30 days"],
            ["Redeemed", Ticket, "186", "14% of collections"],
          ] as const
        ).map(([label, icon, value, hint], index) => (
          <div key={label} {...a(index + 2)}>
            <StatCard
              label={label}
              icon={icon}
              value={value}
              hint={<span className={index < 2 ? "text-success" : undefined}>{hint}</span>}
            />
          </div>
        ))}
      </dl>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div {...a(6)}>
          <CollectionsChart
            daily={DAILY}
            from={new Date(2026, 9, 23)}
            to={new Date(2026, 10, 21)}
          />
        </div>
        <section className="bg-surface rounded-[1.4rem] border-2 p-4" {...a(7)}>
          <h2 className="text-fg-muted flex items-center gap-1.5 text-[11px] font-semibold tracking-wider uppercase">
            <Users className="size-3.5" /> Top collectors
          </h2>
          <ul className="mt-2 divide-y">
            {collectors.map(([name, n], i) => (
              <li key={name} className="flex items-center gap-3 py-2">
                <span className="text-fg-muted num w-4 text-xs">{i + 1}</span>
                <Person name={name} size="sm" />
                <span className="num ml-auto text-sm font-semibold">{n}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <section className="bg-surface rounded-[1.4rem] border-2 p-4" {...a(8)}>
        <h2 className="text-fg-muted flex items-center gap-1.5 text-[11px] font-semibold tracking-wider uppercase">
          <TrendingUp className="size-3.5" /> Most collected pins
        </h2>
        <ul className="mt-2 divide-y">
          {top.map(([title, n]) => (
            <li key={title} className="flex items-center gap-3 py-2">
              <span className="bg-surface-2 flex size-8 shrink-0 items-center justify-center rounded-md">
                <MapPin className="text-fg-muted size-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{title}</p>
                <div className="bg-surface-2 mt-1 h-1.5 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full"
                    style={{ width: `${(n / 412) * 100}%` }}
                  />
                </div>
              </div>
              <span className="num w-12 text-right text-sm font-semibold">{n}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function BountiesPage() {
  const rows = [
    {
      title: "Best rooftop moment",
      summary: "Film your best moment at Thursday's show. Under 60 seconds.",
      prize: "750 ACTION",
      line: "12 joined · 9 reports · 1/3 winners",
      tone: "success" as const,
      status: "Running",
    },
    {
      title: "Remix the single",
      summary: "Stems are in the brief. Any genre.",
      prize: "1,200 ACTION",
      line: "27 joined · 14 reports · 0/1 winners",
      tone: "success" as const,
      status: "Running",
      music: true,
    },
    {
      title: "Clean the riverbank",
      summary: "Photo proof, teams welcome.",
      prize: "500 ACTION",
      line: "41 joined · 41 reports · 5/5 winners",
      tone: "neutral" as const,
      status: "Completed",
    },
  ];
  return (
    <div className="grid content-start gap-5">
      <div {...a(0)}>
        <PageHeader
          eyebrow="Fans"
          title="Bounties"
          description="Challenges with a prize held in escrow. Fans join and submit; you pick the winners."
          actions={
            <Button>
              <Plus /> New bounty
            </Button>
          }
        />
      </div>
      <ul className="grid gap-3">
        {rows.map((row, index) => (
          <li
            key={row.title}
            className="bg-surface grid gap-2 rounded-xl border p-4 sm:p-5"
            {...a(index + 1)}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="display min-w-0 text-2xl">{row.title}</h3>
              <StatusPill tone={row.tone}>{row.status}</StatusPill>
            </div>
            <p className="text-fg-muted line-clamp-1 text-sm">{row.summary}</p>
            <p className="text-fg-muted flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="flex items-center gap-1.5">
                <Trophy className="size-4" /> {row.prize}
              </span>
              <span className="flex items-center gap-1.5">
                <Users className="size-4" /> {row.line}
              </span>
              {row.music && (
                <span className="flex items-center gap-1.5">
                  <Music2 className="size-4" /> Music
                </span>
              )}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ItemsPage() {
  const rows = [
    [
      "Sunset Sessions poster",
      "Art",
      "41 sold of 300",
      "250",
      "$2.50",
      ART.sunset,
      "success",
      "For sale",
    ],
    [
      "Rooftop Live entry",
      "Ticket",
      "12 sold of 200",
      "500",
      "$5.00",
      ART.ocean,
      "success",
      "For sale",
    ],
    ["Night Drive (single)", "Song", "88 sold", "90", "$0.90", ART.acid, "success", "For sale"],
    [
      "Chrome skull key",
      "Collectible · NFT",
      "50 sold of 50",
      "300",
      "$3.00",
      ART.chrome,
      "warning",
      "Sold out",
    ],
    ["Record tote", "Merch", "0 sold of 150", "900", "$9.00", ART.violet, "neutral", "Draft"],
  ] as const;
  return (
    <div className="grid gap-6">
      <div {...a(0)}>
        <PageHeader
          eyebrow="Catalog"
          title="Items"
          description="Collectibles fans can buy: art, video, tickets, merch and more. Songs have their own tools."
          actions={
            <Button tabIndex={-1}>
              <Plus /> New item
            </Button>
          }
        />
      </div>
      <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {rows.map(([title, type, sold, action, usd, art, tone, status], index) => (
          <li
            key={title}
            className="bg-surface overflow-hidden rounded-[1.4rem] border-2"
            {...a(index + 1)}
          >
            <span className="relative block aspect-square" style={{ background: art }}>
              <StatusPill tone={tone} className="bg-surface absolute top-2.5 left-2.5 shadow-sm">
                {status}
              </StatusPill>
            </span>
            <div className="grid gap-1 p-3.5">
              <b className="truncate">{title}</b>
              <span className="text-fg-muted truncate text-xs">
                {type} · {sold}
              </span>
              <span className="mt-1 flex items-center justify-between text-sm">
                <span className="num font-semibold">{action} ACTION</span>
                <span className="text-fg-muted num text-xs">{usd}</span>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MembershipsPage() {
  const tiers = [
    {
      name: "Fan",
      hold: 50,
      text: "For everyone who follows along.",
      perks: ["Members-only posts", "Fan badge"],
    },
    {
      name: "Supporter",
      hold: 250,
      text: "Early access to every drop.",
      perks: ["Early drops", "Monthly gift", "Members-only posts"],
      popular: true,
    },
    {
      name: "VIP",
      hold: 1000,
      text: "Closest to the band.",
      perks: ["Backstage room", "Signed merch", "All Supporter perks"],
    },
  ];
  return (
    <div className="grid content-start gap-5">
      <div {...a(0)}>
        <PageHeader
          eyebrow="Fans"
          title="Memberships"
          description="Fans unlock tiers by holding your fan token. The amount they hold decides their tier."
          actions={
            <Button>
              <Plus /> New tier
            </Button>
          }
        />
      </div>
      <section
        className="bg-surface border-fg/10 flex flex-wrap items-center gap-x-8 gap-y-4 rounded-[1.4rem] border-2 p-5"
        {...a(1)}
      >
        <span className="tour-token">RR</span>
        <div className="min-w-0">
          <p className="display truncate text-2xl">ROOF</p>
          <p className="text-fg-muted text-sm">Rooftop Records fan token</p>
        </div>
        <div>
          <p className="text-fg-muted text-xs">Holders</p>
          <p className="num text-xl font-semibold">1,204</p>
        </div>
        <div>
          <p className="text-fg-muted text-xs">Price</p>
          <p className="num text-xl font-semibold">1.84 ACTION</p>
        </div>
      </section>
      <ul className="grid gap-3 md:grid-cols-3">
        {tiers.map((tier, index) => (
          <li
            key={tier.name}
            className={cn(
              "bg-surface border-fg/10 flex flex-col rounded-[1.4rem] border-2 p-5",
              tier.popular && "border-primary-text/50",
            )}
            {...a(index + 2)}
          >
            <p className="text-primary-text flex flex-wrap items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
              Tier {index + 1}
              {tier.popular && (
                <span className="bg-primary-soft inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] tracking-normal normal-case">
                  <Star className="size-3" /> Popular
                </span>
              )}
            </p>
            <h3 className="display mt-1 truncate text-2xl">{tier.name}</h3>
            <p className="mt-2">
              <span className="num text-2xl font-semibold">{tier.hold}</span>{" "}
              <span className="text-fg-muted text-sm">ROOF to hold</span>
            </p>
            <p className="text-fg-muted mt-2 text-sm">{tier.text}</p>
            <ul className="mt-4 grid gap-1.5 border-t pt-4 text-sm">
              {tier.perks.map((perk) => (
                <li key={perk} className="flex gap-2">
                  <Check className="text-primary-text mt-0.5 size-4 shrink-0" /> {perk}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EventsPage() {
  const events = [
    [
      "Thursday live",
      "Thu, Nov 26 · 8:00 PM",
      "Rooftop Records, Banani",
      "120 RSVPs of 200 · 2 pins, 1 bounty linked",
      "Upcoming",
      ART.sunset,
    ],
    [
      "Listening party",
      "Sat, Nov 28 · 6:00 PM",
      "Online",
      "64 RSVPs · 1 pin linked",
      "Upcoming",
      ART.violet,
    ],
    [
      "Signing session",
      "Wed, Dec 2 · 5:00 PM",
      "Bookworm, Gulshan",
      "38 RSVPs of 80",
      "Upcoming",
      ART.ocean,
    ],
    [
      "Riverbank cleanup",
      "Sun, Nov 15 · 9:00 AM",
      "Hatirjheel lake",
      "41 RSVPs · 1 bounty linked",
      "Past",
      ART.acid,
    ],
  ] as const;
  return (
    <div className="grid gap-6">
      <div {...a(0)}>
        <PageHeader
          eyebrow="Drops"
          title="Events & announcements"
          description="Both go live straight away for fans in the app and on the map."
          actions={
            <Button tabIndex={-1}>
              <Plus /> New event
            </Button>
          }
        />
      </div>
      <div data-slot="tabs-list" className="tour-tabs" {...a(1)}>
        <span data-slot="tabs-trigger" data-state="active">
          Events
        </span>
        <span data-slot="tabs-trigger">Announcements</span>
      </div>
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {events.map(([title, when, where, rsvp, status, art], index) => (
          <li
            key={title}
            className="bg-surface overflow-hidden rounded-[1.4rem] border-2"
            {...a(index + 2)}
          >
            <span className="relative block h-36" style={{ background: art }}>
              <StatusPill
                tone={status === "Past" ? "neutral" : "success"}
                className="bg-surface absolute top-2.5 right-2.5 shadow-sm"
              >
                {status}
              </StatusPill>
            </span>
            <div className="grid gap-2 p-4">
              <h3 className="display truncate text-2xl">{title}</h3>
              <p className="text-fg-muted text-sm">{when}</p>
              <p className="text-fg-muted flex items-center gap-1.5 text-sm">
                <MapPin className="size-4 shrink-0" /> <span className="truncate">{where}</span>
              </p>
              <p className="text-fg-faint text-xs">{rsvp}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PageBuilderPage() {
  const blocks = ["Cover & profile", "Popular songs", "Tour dates", "Membership tiers", "Links"];
  return (
    <div className="grid h-full grid-rows-[auto_minmax(0,1fr)] gap-5">
      <div {...a(0)}>
        <PageHeader
          eyebrow="Content"
          title="My page"
          description="Your public page. Add blocks, drag them into order, publish."
          actions={<Button>Publish</Button>}
        />
      </div>
      <div className="grid min-h-0 gap-4 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)]">
        <ul className="grid content-start gap-2">
          {blocks.map((block, index) => (
            <li
              key={block}
              className="bg-surface flex items-center gap-3 rounded-xl border p-3 text-sm font-medium"
              {...a(index + 1)}
            >
              <GripVertical className="text-fg-faint size-4" />
              <span className="flex-1 truncate">{block}</span>
              <Pencil className="text-fg-faint size-4" />
            </li>
          ))}
          <li {...a(6)}>
            <Button variant="outline" className="w-full">
              <Plus /> Add block
            </Button>
          </li>
        </ul>
        <div className="tour-preview" {...a(3)}>
          <span className="tour-preview-cover" style={{ background: ART.sunset }} />
          <div className="flex items-end gap-3 px-4">
            <span className="tour-token -mt-8">RR</span>
            <b className="pb-1">Rooftop Records</b>
          </div>
          <div className="grid gap-2 p-4">
            {["Night drive", "Rooftop anthem", "Slow burn"].map((song) => (
              <span
                key={song}
                className="bg-surface flex items-center gap-2 rounded-lg border p-2 text-xs"
              >
                <Music2 className="text-primary-text size-3.5" /> {song}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function WalletPage() {
  return (
    <div className="grid content-start gap-5">
      <div {...a(0)}>
        <PageHeader eyebrow="Account" title="Wallet" description="Your balance on Stellar." />
      </div>
      <div {...a(1)}>
        <WalletHero
          label="ACTION balance"
          address="GDROOFTOPRECORDSEXAMPLEWALLETADDRESSFORTHETOURPAGE0000"
          balance="10,000"
          actions={[
            { id: "send", label: "Send", icon: Send, primary: true },
            { id: "swap", label: "Swap", icon: ArrowDownUp },
            { id: "redeem", label: "Redeem", icon: QrCode },
          ]}
        />
      </div>
      <div {...a(2)}>
        <WalletPanel title="Tokens">
          <WalletAssets
            empty={null}
            rows={[
              {
                key: "roof",
                code: "ROOF",
                title: "Rooftop Records fan token",
                amount: "2,500",
                onSend: null,
              },
              { key: "xlm", code: "XLM", title: "Stellar Lumens", amount: "9,996", onSend: null },
              { key: "usdc", code: "USDC", title: "USD Coin", amount: "120", onSend: null },
            ]}
          />
        </WalletPanel>
      </div>
    </div>
  );
}
