"use client";

import {
  ArrowUpRight,
  BarChart3,
  Crown,
  Footprints,
  Hexagon,
  LogIn,
  MapPinned,
  Music2,
  ScanLine,
  Store,
  Trophy,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";

import { ACTION_LOGO } from "@actiontokens/ui/lib/action-logo";
import { PinGlyph } from "@actiontokens/ui/patterns/pin-glyph";

import { MAPBOX_TOKEN } from "../pins/mapbox";
import { AR_URL, FAN_APP_URL } from "./links";

/**
 * The signed-out front page: a living map. The map fills the screen and stays put; scrolling
 * brings the portal's pieces in one by one (a bounty, a song, a membership tier, the reports
 * chart, the wallet) and docks them around the map until the whole portal is there. One line of
 * headline per step. Plain scrolling drives it: one listener turns the scroll into a step number
 * and writes a few CSS numbers (--e: docked, --f: in focus); motion is transform and opacity
 * only. Phones get the map, then the pieces stacked, already in place.
 */

type Step = {
  id: string;
  tag: string;
  icon: LucideIcon;
  top: string;
  bottom: string;
  body: string;
};

const STEPS: Step[] = [
  {
    id: "map",
    tag: "Map & pins",
    icon: MapPinned,
    top: "Drop it on",
    bottom: "the real map.",
    body: "Put collectibles at real places. Fans walk there and catch them in the AR app.",
  },
  {
    id: "bounties",
    tag: "Bounties",
    icon: Trophy,
    top: "Run",
    bottom: "bounties.",
    body: "The prize sits in escrow on Stellar before anyone starts. Fans submit, you pick the winners.",
  },
  {
    id: "items",
    tag: "Music & items",
    icon: Music2,
    top: "Sell what",
    bottom: "you make.",
    body: "Songs, art, tickets and merch become collectibles fans own, paid in ACTION or by card.",
  },
  {
    id: "memberships",
    tag: "Memberships",
    icon: Crown,
    top: "Your token.",
    bottom: "Their tier.",
    body: "Fans unlock tiers by holding your fan token. Nothing to bill.",
  },
  {
    id: "reports",
    tag: "Pin reports",
    icon: BarChart3,
    top: "See who",
    bottom: "showed up.",
    body: "Every collection counted, per day and per pin. Export it whenever you like.",
  },
  {
    id: "wallet",
    tag: "Wallet",
    icon: Wallet,
    top: "Paid in",
    bottom: "ACTION.",
    body: "Sales, royalties and gifts land in your wallet on Stellar. Swap, send or keep them.",
  },
];
/** The last step: everything in place, and the way in. */
const LAST = STEPS.length;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export function LivingMap({ onSignIn }: { onSignIn: () => void }) {
  const section = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const el = section.current;
    if (!el) return;
    const stage = el.querySelector<HTMLElement>(".lm-stage")!;
    const heads = [...el.querySelectorAll<HTMLElement>(".lm-head")];
    const cards = [...el.querySelectorAll<HTMLElement>(".lm-card")];
    const phone = matchMedia("(max-width: 767px)");
    const still = matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let last = -2;

    const update = () => {
      raf = 0;
      const vh = innerHeight;
      const rect = el.getBoundingClientRect();
      const s = phone.matches
        ? LAST
        : Math.min(LAST, Math.max(0, (-rect.top / Math.max(1, rect.height - vh)) * LAST));
      stage.style.setProperty("--s", s.toFixed(4));
      stage.style.setProperty("--done", clamp01(s - (LAST - 1)).toFixed(4));
      heads.forEach((head) => {
        const k = Number(head.dataset.k);
        const d = s - k;
        // full for most of its step, a quick hand-over to the next
        head.style.opacity = clamp01((0.55 - Math.abs(d)) * 4).toFixed(3);
        head.style.transform = `translate3d(0, ${(-d * 48).toFixed(1)}px, 0)`;
        head.style.visibility = Math.abs(d) < 0.55 ? "visible" : "hidden";
      });
      cards.forEach((card) => {
        const k = Number(card.dataset.k);
        // flies in over the step before its own, docked when its step is on screen
        const e = still.matches ? (s > k - 0.5 ? 1 : 0) : clamp01((s - k + 0.85) / 0.85);
        card.style.setProperty("--e", e.toFixed(4));
        card.style.setProperty("--f", clamp01(1 - Math.abs(s - k) * 1.6).toFixed(3));
      });
      const on =
        rect.top > vh * 0.5 || rect.bottom < vh * 0.5 ? -1 : Math.min(LAST - 1, Math.round(s));
      if (on !== last) {
        last = on;
        setActive(on);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    phone.addEventListener("change", onScroll);
    update();
    return () => {
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
      phone.removeEventListener("change", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section
      ref={section}
      className="lm bleed"
      style={{ ["--steps" as string]: LAST }}
      aria-label="The organization portal"
    >
      <div className="lm-stage">
        <MapLayer />
        <div className="lm-scrim" aria-hidden />

        {/* the pieces, docked around the map */}
        <Card k={1} spot="tr" from={[520, -120, 8]} label="Bounties">
          <BountyCard />
        </Card>
        <Card k={2} spot="tl" from={[-520, -80, -10]} label="Music & items">
          <SongCard />
        </Card>
        <Card k={3} spot="tc" from={[-160, -420, 6]} label="Memberships">
          <TierCard />
        </Card>
        <Card k={4} spot="br" from={[520, 220, -7]} label="Pin reports">
          <ChartCard />
        </Card>
        <Card k={5} spot="bc" from={[80, 460, 9]} label="Wallet">
          <WalletCard />
        </Card>

        {/* one headline per step, in the same place */}
        <div className="lm-heads">
          {STEPS.map((step, k) => (
            <div key={step.id} className="lm-head" data-k={k}>
              <p className="lm-kicker">
                <step.icon className="size-3.5" />
                {k === 0
                  ? "Organization portal · live on Stellar"
                  : `${String(k + 1).padStart(2, "0")} · ${step.tag}`}
              </p>
              <h2 className="lm-title">
                <span className="lp-chrome">{step.top}</span>
                <br />
                <em>{step.bottom}</em>
              </h2>
              <p className="lm-body">{step.body}</p>
              {k === 0 && (
                <div className="lm-ctas">
                  <button type="button" onClick={onSignIn} className="lp-cta">
                    <LogIn className="size-5" strokeWidth={2.4} /> Sign in / Sign up
                  </button>
                  <span className="lm-hint">Scroll to build your portal ↓</span>
                </div>
              )}
            </div>
          ))}
          <div className="lm-head" data-k={LAST}>
            <p className="lm-kicker">
              <Hexagon className="size-3.5" /> All of it, one sign-in
            </p>
            <h2 className="lm-title">
              <span className="lp-chrome">Your whole</span>
              <br />
              <em>portal.</em>
            </h2>
            <p className="lm-body">
              Set up your organization in minutes. Fans find you on the map, in the marketplace and
              on your own page.
            </p>
            <div className="lm-ctas">
              <button type="button" onClick={onSignIn} className="lp-cta">
                <LogIn className="size-5" strokeWidth={2.4} /> Sign in / Sign up
              </button>
            </div>
            <div className="lm-go">
              <a href={FAN_APP_URL} className="gx-go" title="See the portal as fans do">
                <Store className="gx-go-icon" strokeWidth={2} />
                <span className="min-w-0">
                  <span className="gx-go-label">Marketplace</span>
                  <span className="gx-go-hint">See it as fans</span>
                </span>
                <span className="gx-go-arrow" aria-hidden>
                  <ArrowUpRight className="size-4" strokeWidth={2.6} />
                </span>
              </a>
              <a href={AR_URL} className="gx-go gx-go--neon" title="Open the AR app">
                <ScanLine className="gx-go-icon" strokeWidth={2} />
                <span className="min-w-0">
                  <span className="gx-go-label">AR app</span>
                  <span className="gx-go-hint">Drops on the map</span>
                </span>
                <span className="gx-go-arrow" aria-hidden>
                  <ArrowUpRight className="size-4" strokeWidth={2.6} />
                </span>
              </a>
            </div>
          </div>
        </div>

        {/* where you are in the build */}
        <ol className="lm-rail" aria-hidden>
          {[...STEPS, null].map((step, k) => (
            <li key={step?.id ?? "all"} data-on={k <= Math.max(active, 0) || undefined} />
          ))}
        </ol>
      </div>
    </section>
  );
}

/** A docked piece: where it docks (spot), where it flies in from (x, y px and a tilt). */
function Card({
  k,
  spot,
  from,
  label,
  children,
}: {
  k: number;
  spot: "tl" | "tc" | "tr" | "bc" | "br";
  from: [number, number, number];
  label: string;
  children: ReactNode;
}) {
  const style = {
    "--fx": `${from[0]}px`,
    "--fy": `${from[1]}px`,
    "--fr": `${from[2]}deg`,
  } as CSSProperties;
  return (
    <div className="lm-card" data-k={k} data-spot={spot} style={style} aria-label={label}>
      {children}
    </div>
  );
}

/* ── the pieces (example data) ────────────────────────────────────────────── */

function CardHead({
  icon: Icon,
  title,
  aside,
}: {
  icon: LucideIcon;
  title: string;
  aside?: ReactNode;
}) {
  return (
    <div className="lm-card-head">
      <Icon className="size-3.5" />
      <span>{title}</span>
      {aside && <span className="ml-auto">{aside}</span>}
    </div>
  );
}

function BountyCard() {
  return (
    <>
      <CardHead icon={Trophy} title="Bounty" aside={<span className="lm-live">Live</span>} />
      <span className="lm-prize">
        <b className="num">750</b> ACTION · 3 winners
      </span>
      <p className="lm-card-title">Best rooftop moment</p>
      <div className="lm-meter">
        <i style={{ transform: "scaleX(0.62)" }} />
      </div>
      <p className="lm-card-meta">
        <span>18 entries</span>
        <span>2 days left</span>
      </p>
    </>
  );
}

function SongCard() {
  return (
    <div className="flex gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={art("#d4ff2a", "#04320f", "note")} alt="" className="lm-cover" />
      <div className="min-w-0 flex-1">
        <CardHead icon={Music2} title="New drop" />
        <p className="lm-card-title truncate">Night Drive</p>
        <p className="lm-card-sub">Rooftop Records</p>
        <p className="lm-price">
          <b className="num">1,200</b> ACTION
        </p>
        <div className="lm-meter">
          <i style={{ transform: "scaleX(0.18)" }} />
        </div>
        <p className="lm-card-meta">
          <span>88 / 500 sold</span>
        </p>
      </div>
    </div>
  );
}

function TierCard() {
  return (
    <>
      <CardHead icon={Crown} title="Tier 2" aside={<span className="num">318 members</span>} />
      <p className="lm-card-title">Supporter</p>
      <p className="lm-card-sub">
        <b className="num text-fg">250</b> ROOF to hold
      </p>
      <ul className="lm-perks">
        <li>Early drops, 24h ahead</li>
        <li>Monthly gift pin</li>
      </ul>
    </>
  );
}

const BARS = [22, 30, 26, 38, 34, 44, 40, 52, 48, 60, 56, 70, 66, 82];
function ChartCard() {
  return (
    <>
      <CardHead icon={BarChart3} title="Collections" aside={<span className="lm-up">+38%</span>} />
      <p className="lm-big num">1,284</p>
      <div className="lm-bars" aria-hidden>
        {BARS.map((height, index) => (
          <i key={index} style={{ height: `${height}%`, ["--i" as string]: index }} />
        ))}
      </div>
    </>
  );
}

function WalletCard() {
  return (
    <>
      <CardHead icon={Wallet} title="Wallet" />
      <p className="lm-big num">
        24,580 <small>ACTION</small>
      </p>
      <p className="lm-card-meta">
        <span>XLM 1,920</span>
        <span>USDC 340</span>
      </p>
      <p className="lm-in">+2,400 · Signed vinyl sold</p>
    </>
  );
}

/* ── the map ─────────────────────────────────────────────────────────────── */

type Center = { lng: number; lat: number };
/** Where the map opens without the visitor's location: Williamsburg, Brooklyn, NY. */
const US_CENTER: Center = { lng: -73.9573, lat: 40.7163 };

/** A real map picture (Mapbox static images) around a point, one per theme. */
const snapshot = (theme: "dark" | "light", { lng, lat }: Center) =>
  `https://api.mapbox.com/styles/v1/mapbox/${theme}-v11/static/${lng.toFixed(4)},${lat.toFixed(4)},14.6,0/1280x760@2x?attribution=false&logo=false&access_token=${MAPBOX_TOKEN ?? ""}`;

/**
 * The map's centre: the visitor's location once they allow it, the US fallback until then (or if
 * they say no). The new picture is loaded first, then swapped in, so the map never blanks.
 */
function useMapCenter() {
  const [center, setCenter] = useState<Center>(US_CENTER);
  useEffect(() => {
    if (!MAPBOX_TOKEN || !("geolocation" in navigator)) return;
    let live = true;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const next = { lng: coords.longitude, lat: coords.latitude };
        const theme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
        const picture = new Image();
        picture.onload = () => live && setCenter(next);
        picture.src = snapshot(theme, next);
      },
      () => undefined, // no permission, or no fix: stay on the US map
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 10 * 60_000 },
    );
    return () => {
      live = false;
    };
  }, []);
  return center;
}

const MOTIF = {
  vinyl:
    '<circle cx="50" cy="50" r="30" fill="#111" opacity=".85"/><circle cx="50" cy="50" r="22" fill="none" stroke="#fff" stroke-opacity=".18"/><circle cx="50" cy="50" r="8" fill="#fff"/><circle cx="50" cy="50" r="2.5" fill="#111"/>',
  ticket:
    '<path d="M18 34h64v10a6 6 0 0 0 0 12v10H18V56a6 6 0 0 0 0-12z" fill="#fff" opacity=".92"/><text x="38" y="55" font-family="Arial Black,Arial" font-weight="900" font-size="11" text-anchor="middle" fill="#111">LIVE</text>',
  note: '<path d="M42 24v36a10 10 0 1 0 6 9V38l22-6v20a10 10 0 1 0 6 9V18z" fill="#fff" opacity=".92"/>',
  key: '<circle cx="36" cy="40" r="14" fill="none" stroke="#fff" stroke-width="7"/><path d="M46 50l26 26m-10-10l7-7m-1 15l7-7" stroke="#fff" stroke-width="7" stroke-linecap="round"/>',
  bag: '<path d="M26 40h48l-5 38H31z" fill="#fff" opacity=".92"/><path d="M38 42v-8a12 12 0 0 1 24 0v8" fill="none" stroke="#fff" stroke-width="5"/>',
  sun: '<circle cx="50" cy="56" r="20" fill="#fff" opacity=".95"/><path d="M14 70h72M20 78h60M28 86h44" stroke="#fff" stroke-width="4" opacity=".7"/>',
  star: '<path d="M50 18l9 21 23 2-17 15 5 23-20-12-20 12 5-23-17-15 23-2z" fill="#fff" opacity=".92"/>',
  mic: '<rect x="40" y="18" width="20" height="36" rx="10" fill="#fff" opacity=".92"/><path d="M30 46a20 20 0 0 0 40 0M50 66v14M38 80h24" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>',
};
/** Small artworks for the example pins (drawn here, so nothing is fetched). */
function art(from: string, to: string, motif: keyof typeof MOTIF) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/>${MOTIF[motif]}</svg>`,
  )}`;
}

const RING = {
  active: "var(--color-primary)",
  scheduled: "var(--color-info)",
  collected: "var(--color-warning)",
} as const;
/** The pins' picture: the Action logo, padded on a white tile so the pin's shape never clips it. */
const LOGO_PIN = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100"><rect width="100" height="100" fill="#fff"/><image href="${ACTION_LOGO}" xlink:href="${ACTION_LOGO}" x="18" y="16" width="64" height="64" preserveAspectRatio="xMidYMid meet"/></svg>`,
)}`;

const PINS = [
  { x: 52, y: 34, color: "#ff5c8a", look: "active" },
  { x: 63, y: 54, color: "#3d9bff", look: "active" },
  { x: 71, y: 30, color: "#7cff5a", look: "active" },
  { x: 45, y: 62, color: "#c9c9c9", look: "scheduled" },
  { x: 74, y: 64, color: "#b06bff", look: "collected" },
  { x: 57, y: 74, color: "#2ee6a6", look: "active" },
  { x: 40, y: 26, color: "#ff9f1c", look: "active" },
  { x: 36, y: 44, color: "#5b6cff", look: "scheduled" },
] as const;
const HOTSPOTS = [
  {
    name: "Rooftop block",
    pins: 3,
    points: "47,27 59,25 63,37 66,60 54,62 48,46",
    tag: [45, 22],
  },
  { name: "City park", pins: 2, points: "64,24 77,23 81,38 76,48 66,42", tag: [65, 19] },
] as const;
const TRAIL = [
  [45, 62],
  [57, 74],
  [63, 54],
  [52, 34],
  [71, 30],
] as const;
const AREA = "#4dff2a";

/** The map, as the portal's map page draws it: hotspot areas, a fan trail and image pins. */
function MapLayer() {
  const center = useMapCenter();
  const trail = TRAIL.map(([x, y]) => `${x},${y}`).join(" ");
  return (
    <div className="lm-map" aria-hidden>
      {MAPBOX_TOKEN && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={snapshot("dark", center)}
            alt=""
            decoding="async"
            className="lm-map-img"
            data-for="dark"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={snapshot("light", center)}
            alt=""
            decoding="async"
            className="lm-map-img"
            data-for="light"
          />
        </>
      )}
      {[
        [52, 34, 260],
        [63, 54, 210],
        [71, 30, 190],
      ].map(([x, y, size]) => (
        <span
          key={`${x}-${y}`}
          className="lm-heat"
          style={{ left: `${x}%`, top: `${y}%`, width: size, height: size }}
        />
      ))}
      <svg className="lm-overlay" viewBox="0 0 100 100" preserveAspectRatio="none">
        {HOTSPOTS.map((spot) => (
          <polygon
            key={spot.name}
            points={spot.points}
            fill={AREA}
            fillOpacity={0.14}
            stroke={AREA}
            strokeWidth={2.5}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <polyline
          points={trail}
          fill="none"
          stroke="#000"
          strokeOpacity={0.35}
          strokeWidth={7}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={trail}
          fill="none"
          stroke="#ffb020"
          strokeWidth={3.5}
          strokeDasharray="2 9"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {HOTSPOTS.map((spot) => (
        <span
          key={spot.name}
          className="lm-tag"
          style={{ left: `${spot.tag[0]}%`, top: `${spot.tag[1]}%` }}
        >
          <Hexagon className="size-3" /> {spot.name} · {spot.pins} pins
        </span>
      ))}
      <span className="lm-tag lm-tag--trail" style={{ left: "47%", top: "82%" }}>
        <Footprints className="size-3" /> Night walk · 5 stops
      </span>
      {PINS.map((pin, index) => (
        <span
          key={`${pin.x}-${pin.y}`}
          className="lm-pin"
          style={{ left: `${pin.x}%`, top: `${pin.y}%`, ["--i" as string]: index }}
        >
          <PinGlyph
            size={50}
            color={pin.color}
            imageUrl={LOGO_PIN}
            ringColor={RING[pin.look]}
            ringWidth={3}
          />
        </span>
      ))}
    </div>
  );
}
