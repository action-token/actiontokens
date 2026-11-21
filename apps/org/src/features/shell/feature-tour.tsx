"use client";

import {
  BarChart3,
  CalendarDays,
  Check,
  Crown,
  Gift,
  Globe,
  ImagePlus,
  LayoutTemplate,
  Lock,
  MapPin,
  MapPinned,
  Megaphone,
  Music2,
  Package,
  Play,
  QrCode,
  Trophy,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { cn } from "@actiontokens/ui/lib/cn";

/**
 * The landing page's feature tour: what an organization can do in the portal, one feature at a
 * time. On wide screens a portal "window" stays pinned on the right while the feature texts
 * scroll on the left; the feature in the middle of the screen switches its scene on, and the
 * scene plays once (pins drop, bars grow, the prize locks). On phones each scene sits under its
 * text. Light on the GPU: motion is one-shot CSS (transform and opacity) started by a
 * `data-on` attribute; nothing loops, and nothing runs while the page sits still.
 */

type Feature = {
  id: string;
  path: string;
  icon: LucideIcon;
  tag: string;
  title: string;
  body: string;
  points: string[];
  Scene: () => ReactNode;
};

const FEATURES: Feature[] = [
  {
    id: "map",
    path: "/pins",
    icon: MapPinned,
    tag: "Map & pins",
    title: "Drop it on the real map",
    body: "Put collectibles at real places: a corner, a venue, a whole city. Fans walk there and catch them in the AR app.",
    points: ["Schedule when a drop opens", "Limit how many exist", "Auto-collect near the pin"],
    Scene: MapScene,
  },
  {
    id: "reports",
    path: "/reports",
    icon: BarChart3,
    tag: "Pin reports",
    title: "See who came",
    body: "Every collection is counted. See which pins work, when fans show up, and export it all.",
    points: ["Collections per day", "Top pins and places", "Manage every pin in one list"],
    Scene: ReportsScene,
  },
  {
    id: "bounties",
    path: "/bounties",
    icon: Trophy,
    tag: "Bounties",
    title: "Set a challenge, lock the prize",
    body: "Open a bounty and the prize goes into escrow on Stellar before anyone starts. Fans submit, you pick the winners, they get paid.",
    points: ["Prize held in escrow", "Up to many winners", "Paid out on-chain"],
    Scene: BountyScene,
  },
  {
    id: "sell",
    path: "/items",
    icon: Package,
    tag: "Music & items",
    title: "Sell what you make",
    body: "Songs, albums, art, tickets and merch become tokens fans own. Set the price, the number of copies, and what holding one unlocks.",
    points: ["Songs and albums", "Art, tickets, merch", "Fill a listing with AI"],
    Scene: SellScene,
  },
  {
    id: "members",
    path: "/memberships",
    icon: Crown,
    tag: "Memberships & gifts",
    title: "Members who pay every month",
    body: "Create tiers with their own perks. Members unlock posts, drops and rooms, and you can send gifts to your best fans.",
    points: ["Tiers with perks", "Members-only posts", "Gifts to fans"],
    Scene: MembersScene,
  },
  {
    id: "events",
    path: "/events",
    icon: CalendarDays,
    tag: "Events & posts",
    title: "Tell them where to be",
    body: "Post events, announcements and stories. Followers see them in their feed and get notified.",
    points: ["Events with tickets", "Announcements", "Posts and stories"],
    Scene: EventsScene,
  },
  {
    id: "page",
    path: "/page",
    icon: LayoutTemplate,
    tag: "My page & website map",
    title: "Your page, your site",
    body: "Build your organization's page block by block, on your own domain if you like, and embed your live map on any website.",
    points: ["Drag-and-drop blocks", "Custom domain", "Embeddable map"],
    Scene: PageScene,
  },
  {
    id: "wallet",
    path: "/wallet",
    icon: Wallet,
    tag: "Wallet & royalties",
    title: "Get paid in ACTION",
    body: "Sales, memberships and resale royalties land in your wallet on Stellar. Swap, send or keep them.",
    points: ["Royalties on resales", "Swap ACTION, XLM, USDC", "Redeem codes at your door"],
    Scene: WalletScene,
  },
];

const MORE: [LucideIcon, string][] = [
  [Megaphone, "Announcements"],
  [ImagePlus, "Stories"],
  [Gift, "Gifts"],
  [QrCode, "Redeem"],
  [Globe, "Custom domains"],
  [MapPin, "Pin management"],
];

export function FeatureTour() {
  const [active, setActive] = useState(0);
  const [seen, setSeen] = useState<Set<number>>(() => new Set());
  const steps = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = Number((entry.target as HTMLElement).dataset.step);
          setActive(index);
          setSeen((prev) => (prev.has(index) ? prev : new Set(prev).add(index)));
        }
      },
      // the step crossing the middle of the screen
      { rootMargin: "-45% 0px -45% 0px" },
    );
    steps.current.forEach((step) => step && observer.observe(step));
    return () => observer.disconnect();
  }, []);

  const current = FEATURES[active]!;

  return (
    <div>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-14">
        {/* the feature texts */}
        <div>
          {FEATURES.map((feature, index) => (
            <div
              key={feature.id}
              ref={(el) => {
                steps.current[index] = el;
              }}
              data-step={index}
              data-active={active === index || undefined}
              className="ft-step"
            >
              <span className="ft-step-tag">
                <feature.icon className="size-4" strokeWidth={2.4} />
                {feature.tag}
              </span>
              <h3 className="ft-step-title">{feature.title}</h3>
              <p className="text-fg-muted mt-3 max-w-md text-[15px] text-pretty">{feature.body}</p>
              <ul className="mt-5 grid gap-2">
                {feature.points.map((point) => (
                  <li key={point} className="flex items-center gap-2.5 text-sm font-medium">
                    <span className="ft-tick">
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
              {/* phones: the scene under its text */}
              <div className="mt-8 lg:hidden">
                <Window path={feature.path}>
                  <div className="ft-scene" data-on={seen.has(index) || undefined}>
                    <feature.Scene />
                  </div>
                </Window>
              </div>
            </div>
          ))}
        </div>

        {/* wide screens: one pinned window, the active scene inside */}
        <div className="hidden lg:block">
          <div className="sticky top-[14vh]">
            <Window path={current.path}>
              {FEATURES.map((feature, index) => (
                <div
                  key={feature.id}
                  className="ft-scene ft-scene--stacked"
                  data-on={active === index || undefined}
                  aria-hidden={active !== index}
                >
                  <feature.Scene />
                </div>
              ))}
            </Window>
            <div className="mt-5 flex justify-center gap-1.5" aria-hidden>
              {FEATURES.map((feature, index) => (
                <span key={feature.id} className="ft-dot" data-on={active === index || undefined} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-16 flex flex-wrap items-center justify-center gap-2" data-reveal>
        <span className="text-fg-muted mr-1 text-sm">And more:</span>
        {MORE.map(([Icon, label]) => (
          <span key={label} className="lp-chip">
            <Icon className="size-4" /> {label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** A portal window: three dots, the address, a slim sidebar, and the scene. */
function Window({ path, children }: { path: string; children: ReactNode }) {
  return (
    <div className="ft-window">
      <div className="ft-bar">
        <span className="ft-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <span className="ft-url">org.action-tokens.com{path}</span>
      </div>
      <div className="ft-body">
        <div className="ft-side" aria-hidden>
          {[MapPinned, BarChart3, Trophy, Package, Crown, CalendarDays, LayoutTemplate, Wallet].map(
            (Icon, index) => (
              <span key={index} className={cn(FEATURES[index]?.path === path && "ft-side-on")}>
                <Icon className="size-3.5" />
              </span>
            ),
          )}
        </div>
        <div className="ft-stage">{children}</div>
      </div>
    </div>
  );
}

/* ── Scenes ─────────────────────────────────────────────────────────────── */

function MapScene() {
  const pins = [
    { x: 22, y: 34, d: 0 },
    { x: 48, y: 56, d: 1 },
    { x: 70, y: 28, d: 2 },
    { x: 36, y: 72, d: 3 },
  ];
  return (
    <div className="sc-map">
      <svg className="sc-map-river" viewBox="0 0 400 260" preserveAspectRatio="none" aria-hidden>
        <path d="M-10 200 C 90 150, 160 230, 250 180 S 360 120, 410 140" />
      </svg>
      {pins.map((pin) => (
        <span
          key={pin.d}
          className="sc-pin"
          style={{ left: `${pin.x}%`, top: `${pin.y}%`, ["--d" as string]: pin.d }}
        >
          <MapPin className="size-4" strokeWidth={2.6} />
        </span>
      ))}
      <div className="sc-pop sc-map-card">
        <span className="sc-thumb" />
        <span className="min-w-0 flex-1">
          <b className="block truncate text-sm">Poster drop</b>
          <span className="text-fg-muted text-xs">0 / 300 collected</span>
        </span>
        <span className="sc-live">Live</span>
      </div>
    </div>
  );
}

function ReportsScene() {
  const bars = [38, 52, 44, 70, 62, 88, 76];
  return (
    <div className="sc-pad">
      <div className="grid grid-cols-3 gap-2">
        {[
          ["1,284", "Collected"],
          ["312", "Fans"],
          ["24", "Pins"],
        ].map(([value, label], index) => (
          <div key={label} className="sc-tile sc-rise" style={{ ["--d" as string]: index }}>
            <b>{value}</b>
            <small>{label}</small>
          </div>
        ))}
      </div>
      <div className="sc-chart">
        {bars.map((height, index) => (
          <span
            key={index}
            className="sc-bar"
            style={{ height: `${height}%`, ["--d" as string]: index }}
          />
        ))}
      </div>
      <div className="mt-3 grid gap-1.5">
        {["Rooftop stairs", "Lake-side listening"].map((name, index) => (
          <div key={name} className="sc-row sc-slide" style={{ ["--d" as string]: index + 3 }}>
            <MapPin className="text-primary-text size-3.5" />
            <span className="flex-1 truncate">{name}</span>
            <b>{index === 0 ? 412 : 268}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function BountyScene() {
  return (
    <div className="sc-pad">
      <div className="sc-card">
        <div className="flex items-center gap-2">
          <Trophy className="text-primary-text size-4" />
          <b className="text-sm">Best rooftop moment</b>
        </div>
        <div className="sc-prize">
          <span className="sc-lock">
            <Lock className="size-4" strokeWidth={2.6} />
          </span>
          <span>
            <b className="block font-mono text-lg">750 ACTION</b>
            <span className="sc-escrow">In escrow on Stellar</span>
          </span>
        </div>
      </div>
      <p className="sc-label">Submissions</p>
      <div className="grid gap-1.5">
        {["m0ss · clip.mp4", "velvet.ops · edit.mov", "drift.king · take2.mp4"].map(
          (row, index) => (
            <div key={row} className="sc-row sc-slide" style={{ ["--d" as string]: index + 1 }}>
              <span className="sc-avatar" />
              <span className="flex-1 truncate">{row}</span>
              {index === 2 && <span className="sc-winner">Winner</span>}
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function SellScene() {
  const wave = [30, 55, 40, 75, 50, 90, 60, 80, 45, 70, 35, 60, 50, 85, 40, 65];
  return (
    <div className="sc-pad grid grid-cols-[1fr_0.8fr] gap-3">
      <div className="grid content-start gap-1.5">
        {["Night drive", "Rooftop anthem", "Slow burn"].map((song, index) => (
          <div key={song} className="sc-row sc-slide" style={{ ["--d" as string]: index }}>
            <span className="sc-play">
              <Play className="size-3" fill="currentColor" />
            </span>
            <span className="flex-1 truncate">{song}</span>
            <b>{[90, 120, 60][index]}</b>
          </div>
        ))}
        <div className="sc-wave" aria-hidden>
          {wave.map((height, index) => (
            <span key={index} style={{ height: `${height}%`, ["--d" as string]: index }} />
          ))}
        </div>
      </div>
      <div className="sc-item sc-pop">
        <span className="sc-item-art" />
        <b className="mt-2 block truncate text-xs">Sunset poster</b>
        <span className="text-fg-muted text-[11px]">250 ACTION · 41/300</span>
        <span className="sc-stamp">Minted</span>
      </div>
    </div>
  );
}

function MembersScene() {
  const tiers = [
    { name: "Fan", price: 50, perk: "Members-only posts" },
    { name: "Supporter", price: 150, perk: "Early drops" },
    { name: "VIP", price: 500, perk: "Backstage room" },
  ];
  return (
    <div className="sc-tiers">
      {tiers.map((tier, index) => (
        <div key={tier.name} className="sc-tier" style={{ ["--i" as string]: index - 1 }}>
          <Crown className="text-primary-text size-4" />
          <b className="mt-2 block text-sm">{tier.name}</b>
          <span className="block font-mono text-lg font-bold">{tier.price}</span>
          <span className="text-fg-faint text-[10px] uppercase">ACTION / month</span>
          <span className="text-fg-muted mt-2 block text-[11px]">{tier.perk}</span>
        </div>
      ))}
      <span className="sc-gift">
        <Gift className="size-4" /> Gift sent to 12 fans
      </span>
    </div>
  );
}

function EventsScene() {
  return (
    <div className="sc-pad grid grid-cols-[0.9fr_1fr] gap-3">
      <div className="sc-cal">
        <b className="text-xs">November</b>
        <div className="sc-cal-grid">
          {Array.from({ length: 28 }, (_, index) => (
            <span key={index} className={cn(index === 19 && "sc-cal-on")}>
              {index + 1}
            </span>
          ))}
        </div>
      </div>
      <div className="grid content-start gap-2">
        <div className="sc-card sc-slide" style={{ ["--d" as string]: 1 }}>
          <span className="sc-label !m-0">Thu 20 · 8 pm</span>
          <b className="mt-1 block text-sm">Thursday live</b>
          <span className="text-fg-muted text-xs">Rooftop · 120 going</span>
        </div>
        <div className="sc-card sc-slide" style={{ ["--d" as string]: 2 }}>
          <span className="flex items-center gap-1.5 text-xs font-semibold">
            <Megaphone className="text-primary-text size-3.5" /> New merch drop Friday
          </span>
        </div>
        <div className="flex gap-2">
          {[0, 1, 2, 3].map((index) => (
            <span key={index} className="sc-story" style={{ ["--d" as string]: index + 3 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function PageScene() {
  const blocks = ["Cover & profile", "Popular songs", "Tour dates", "Membership tiers", "Links"];
  return (
    <div className="sc-pad grid grid-cols-[0.8fr_1fr] gap-3">
      <div className="grid content-start gap-1.5">
        {blocks.map((block, index) => (
          <div key={block} className="sc-row sc-slide" style={{ ["--d" as string]: index }}>
            <span className="sc-grip" />
            <span className="flex-1 truncate">{block}</span>
          </div>
        ))}
      </div>
      <div className="sc-preview">
        <span className="sc-preview-cover" />
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="sc-preview-line sc-rise"
            style={{ ["--d" as string]: index + 2 }}
          />
        ))}
        <span className="sc-publish">Publish page</span>
      </div>
    </div>
  );
}

function WalletScene() {
  return (
    <div className="sc-pad grid grid-cols-[1fr_auto] items-start gap-4">
      <div>
        <div className="gx-vault">
          <span className="gx-vault-in">
            <span className="gx-mono text-fg-muted">Vault</span>
            <span className="gx-amount mt-1 block">10,000</span>
            <span className="gx-mono text-[var(--gx-acid-text)]">ACTION</span>
          </span>
        </div>
        <div className="mt-3 grid gap-1.5">
          {[
            ["Resale royalty", "+25"],
            ["Membership · VIP", "+500"],
            ["Item sale", "+250"],
          ].map(([label, amount], index) => (
            <div key={label} className="sc-row sc-slide" style={{ ["--d" as string]: index + 1 }}>
              <span className="flex-1 truncate">{label}</span>
              <b className="text-primary-text">{amount}</b>
            </div>
          ))}
        </div>
      </div>
      <div className="sc-ring" aria-hidden>
        <svg viewBox="0 0 80 80">
          <circle cx="40" cy="40" r="32" className="sc-ring-bg" />
          <circle cx="40" cy="40" r="32" className="sc-ring-fg" />
        </svg>
        <span>70%</span>
        <small>to you</small>
      </div>
    </div>
  );
}
