"use client";

import {
  ArrowDownUp,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  Crown,
  GripVertical,
  LayoutTemplate,
  MapPin,
  MapPinned,
  Music2,
  Package,
  Pencil,
  Plus,
  QrCode,
  Send,
  Star,
  Trophy,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { Button } from "@actiontokens/ui/components/button";
import { cn } from "@actiontokens/ui/lib/cn";
import { PageHeader } from "@actiontokens/ui/patterns/page-header";
import { StatCard } from "@actiontokens/ui/patterns/stat-card";
import { StatusPill } from "@actiontokens/ui/patterns/status-pill";
import { WalletAssets, WalletHero, WalletPanel } from "@actiontokens/ui/patterns/wallet-blocks";

import { CollectionsChart } from "../reports/report-kit";

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
    const update = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const span = Math.max(1, rect.height - innerHeight);
      const p = Math.min(1, Math.max(0, -rect.top / span));
      const width = stick.current?.clientWidth ?? innerWidth;
      const x = p * (PANELS - 1);
      if (track.current)
        track.current.style.transform = `translate3d(${(-x * width).toFixed(1)}px,0,0)`;
      stick.current?.style.setProperty("--p", p.toFixed(4));
      // the panel nearest the middle; -1 is the intro
      const index = Math.round(x) - 1;
      if (index !== last) {
        last = index;
        setActive(index);
        setReached((prev) => Math.max(prev, index));
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    let listening = false;
    const io = new IntersectionObserver(([entry]) => {
      const on = entry?.isIntersecting ?? false;
      if (on && !listening) {
        addEventListener("scroll", onScroll, { passive: true });
        addEventListener("resize", onScroll);
        onScroll();
      } else if (!on && listening) {
        removeEventListener("scroll", onScroll);
        removeEventListener("resize", onScroll);
      }
      listening = on;
    });
    io.observe(el);
    return () => {
      io.disconnect();
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  /** Jump to a panel from the index under the track. */
  const go = (panel: number) => {
    const el = section.current;
    if (!el) return;
    const span = el.offsetHeight - innerHeight;
    const top = el.getBoundingClientRect().top + scrollY;
    scrollTo({ top: top + (span * panel) / (PANELS - 1), behavior: "smooth" });
  };

  return (
    <section
      ref={section}
      className="tour bleed"
      style={{ height: `${PANELS * 100}vh` }}
      aria-label="What you can do in the portal"
    >
      <div ref={stick} className="tour-stick">
        <div ref={track} className="tour-track">
          {/* intro */}
          <div className="tour-panel tour-intro">
            <p className="lp-tag">Inside the portal</p>
            <h2 className="tour-big lp-chrome">
              What you
              <br />
              can do<em>.</em>
            </h2>
            <p className="text-fg-muted mt-6 max-w-md text-lg text-pretty">
              Everything an organization runs, from one place. Keep scrolling.
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
              <aside className="tour-aside">
                <span className="tour-num" aria-hidden>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="tour-tag">
                  <chapter.icon className="size-4" strokeWidth={2.4} /> {chapter.tag}
                </span>
                <h3 className="tour-title">{chapter.title}</h3>
                <p className="text-fg-muted mt-4 text-[15px] leading-relaxed text-pretty">
                  {chapter.body}
                </p>
                <ul className="tour-points">
                  {chapter.points.map((point) => (
                    <li key={point}>
                      <span className="tour-tick">
                        <Check className="size-3" strokeWidth={3} />
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>
              </aside>
              <div className="tour-screen">
                <div className="tour-bar">
                  <span className="tour-dots" aria-hidden>
                    <i />
                    <i />
                    <i />
                  </span>
                  <span className="tour-url">org.action-tokens.com{chapter.path}</span>
                </div>
                <div className="tour-page">
                  <chapter.Page />
                </div>
              </div>
            </div>
          ))}
        </div>

        <nav className="tour-nav" aria-label="Tour chapters">
          {CHAPTERS.map((chapter, index) => (
            <button
              key={chapter.id}
              type="button"
              onClick={() => go(index + 1)}
              data-on={active === index || undefined}
              aria-current={active === index ? "step" : undefined}
            >
              <chapter.icon className="size-3.5" />
              <span>{chapter.tag}</span>
            </button>
          ))}
        </nav>
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

function MapPage() {
  const pins = [
    { x: 24, y: 38, live: true },
    { x: 46, y: 62, live: true },
    { x: 66, y: 30, live: true },
    { x: 82, y: 58, live: false },
    { x: 36, y: 20, live: false },
  ];
  return (
    <div className="grid h-full grid-rows-[auto_minmax(0,1fr)] gap-5">
      <div {...a(0)}>
        <PageHeader
          eyebrow="Drops"
          title="Map & pins"
          description="Drop collectibles on the real map. Fans catch them in the AR app."
          actions={
            <>
              <Button variant="outline">Pin management</Button>
              <Button>
                <Plus /> New pin
              </Button>
            </>
          }
        />
      </div>
      <div className="tour-map" {...a(1)}>
        <svg viewBox="0 0 400 260" preserveAspectRatio="none" aria-hidden>
          <path
            className="tour-map-river"
            d="M-10 200 C 90 150, 160 230, 250 180 S 360 120, 410 140"
          />
          <path
            className="tour-map-road"
            d="M60 -10 L 140 270 M -10 90 L 410 120 M 300 -10 L 260 270"
          />
        </svg>
        {pins.map((pin, index) => (
          <span
            key={index}
            className="tour-pin"
            data-live={pin.live || undefined}
            style={{ left: `${pin.x}%`, top: `${pin.y}%`, ["--i" as string]: index + 2 }}
          >
            <MapPin className="size-4" strokeWidth={2.6} />
          </span>
        ))}
        <div className="bg-surface tour-map-card rounded-xl border p-3" {...a(7)}>
          <span className="size-12 shrink-0 rounded-lg" style={{ background: ART.sunset }} />
          <span className="grid min-w-0 flex-1 gap-0.5">
            <b className="truncate">Sunset Sessions poster</b>
            <span className="text-fg-muted truncate text-sm">
              Rooftop stairs · 41 of 300 collected
            </span>
          </span>
          <StatusPill tone="success" dot>
            Live
          </StatusPill>
          <QrCode className="text-fg-faint size-4" />
        </div>
      </div>
    </div>
  );
}

const DAILY = Array.from({ length: 30 }, (_, index) => {
  const day = new Date(Date.UTC(2026, 9, 23 + index));
  const n = Math.round(18 + 14 * Math.sin(index / 3.2) + index * 1.6 + ((index * 7) % 5) * 3);
  return { day: day.toISOString().slice(0, 10), n };
});

function ReportsPage() {
  return (
    <div className="grid content-start gap-5">
      <div {...a(0)}>
        <PageHeader
          eyebrow="Drops"
          title="Pin reports"
          description="Collections across all your pins."
          actions={<Button variant="outline">Download CSV</Button>}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          ["Collections", "1,284", "+18% on last month"],
          ["Fans", "312", "who collected"],
          ["Live pins", "24", "of 31"],
          ["Top pin", "412", "Rooftop stairs"],
        ].map(([label, value, hint], index) => (
          <div key={label} {...a(index + 1)}>
            <StatCard label={label!} value={value} hint={hint} />
          </div>
        ))}
      </div>
      <div {...a(5)}>
        <CollectionsChart daily={DAILY} from={new Date(2026, 9, 23)} to={new Date(2026, 10, 21)} />
      </div>
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
      "Art · ROOFPOST · 41 sold of 300",
      "250 ACTION · $2.50",
      ART.sunset,
      "success",
      "For sale",
    ],
    [
      "Rooftop Live entry",
      "Ticket · ROOFLIVE · 12 sold of 200",
      "500 ACTION · $5.00",
      ART.ocean,
      "success",
      "For sale",
    ],
    [
      "Night Drive (single)",
      "Song · NIGHTDRV · 88 sold",
      "90 ACTION · $0.90",
      ART.acid,
      "success",
      "For sale",
    ],
    [
      "Chrome skull key",
      "Collectible · NFT · 50 sold of 50",
      "300 ACTION · $3.00",
      ART.chrome,
      "warning",
      "Sold out",
    ],
    [
      "Record tote",
      "Merch · ROOFTOTE · 0 sold of 150",
      "900 ACTION · $9.00",
      ART.violet,
      "neutral",
      "Draft",
    ],
  ] as const;
  return (
    <div className="grid content-start gap-5">
      <div {...a(0)}>
        <PageHeader
          eyebrow="Catalog"
          title="Items"
          description="Collectibles fans can buy: art, video, tickets, merch and more."
          actions={
            <Button>
              <Plus /> New item
            </Button>
          }
        />
      </div>
      <ul className="grid gap-3">
        {rows.map(([title, meta, price, art, tone, status], index) => (
          <li
            key={title}
            className="bg-surface flex items-center gap-4 rounded-xl border p-3 sm:p-4"
            {...a(index + 1)}
          >
            <span className="size-16 shrink-0 rounded-lg" style={{ background: art }} />
            <div className="grid min-w-0 flex-1 gap-0.5">
              <b className="truncate">{title}</b>
              <span className="text-fg-muted truncate text-sm">{meta}</span>
              <span className="text-fg-muted text-sm">{price}</span>
            </div>
            <StatusPill tone={tone}>{status}</StatusPill>
            <Pencil className="text-fg-faint hidden size-4 sm:block" />
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
      "Riverbank cleanup",
      "Sun, Nov 15 · 9:00 AM",
      "Hatirjheel lake",
      "41 RSVPs · 1 bounty linked",
      "Past",
      ART.acid,
    ],
  ] as const;
  return (
    <div className="grid content-start gap-5">
      <div {...a(0)}>
        <PageHeader
          eyebrow="Drops"
          title="Events & announcements"
          description="Both go live straight away for fans in the app and on the map."
          actions={
            <Button>
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
      <ul className="grid gap-3">
        {events.map(([title, when, where, rsvp, status, art], index) => (
          <li
            key={title}
            className="bg-surface grid gap-3 rounded-xl border p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:p-5"
            {...a(index + 2)}
          >
            <span className="h-24 w-full rounded-lg sm:w-36" style={{ background: art }} />
            <div className="grid min-w-0 content-start gap-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="display min-w-0 text-2xl">{title}</h3>
                <StatusPill tone={status === "Past" ? "neutral" : "success"}>{status}</StatusPill>
              </div>
              <p className="text-fg-muted text-sm">{when}</p>
              <p className="text-fg-muted flex items-center gap-1.5 text-sm">
                <MapPin className="size-4 shrink-0" /> {where}
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
