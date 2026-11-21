"use client";

import {
  ArrowDown,
  ArrowDownUp,
  ArrowLeft,
  ArrowUp,
  ArrowUpRight,
  BadgeCheck,
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  Clock,
  ChevronDown,
  Crown,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Flame,
  Footprints,
  Gift,
  GripVertical,
  Image as ImageIcon,
  Hexagon,
  Images,
  Layers,
  LayoutTemplate,
  Link2,
  MapPin,
  MapPinned,
  Monitor,
  MoreHorizontal,
  Music2,
  Package,
  Play,
  Plus,
  QrCode,
  Search,
  Send,
  ShoppingBag,
  Smartphone,
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
import { StatusPill } from "@actiontokens/ui/patterns/status-pill";
import { TallText } from "@actiontokens/ui/patterns/tall-text";
import { WalletAssets, WalletHero, WalletPanel } from "@actiontokens/ui/patterns/wallet-blocks";

import { MAPBOX_TOKEN } from "../pins/mapbox";
import type { NavGroup } from "./nav";
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

/** The tour's pages as sidebar entries (signed out, the sidebar lists only these). */
export const TOUR_NAV: NavGroup[] = [
  {
    title: "What you can do",
    items: CHAPTERS.map((chapter, index) => ({
      href: `/#tour-${index + 1}`,
      label: chapter.tag,
      icon: chapter.icon,
      exact: true,
    })),
  },
];
/** Fired on window with the chapter on screen (-1: none), for the sidebar's highlight. */
export const TOUR_EVENT = "tour:active";

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
    const phone = matchMedia("(max-width: 767px)");
    let flat = false;
    let lastAhead = -2;
    let panel = 0;
    let settle = 0;
    // page moves: our own eased scroll, so nothing can interrupt or stretch it
    let tween = 0;
    let target = -1;
    // wheel gestures: a flick (and its trackpad momentum) is one gesture, and moves one page
    let lastWheel = 0;
    let lastSize = 0;
    // what the current gesture is doing: scrolling a tall page, or turning the page
    let gesture: "" | "inner" | "page" = "";

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
      const from = scrollY;
      const to = top + (span * index) / (PANELS - 1);
      cancelAnimationFrame(tween);
      const box = scrollerOf(index);
      if (box) box.scrollTop = index < panel ? box.scrollHeight : 0;
      target = index;
      if (Math.abs(to - from) < 1) {
        target = -1;
        return;
      }
      const start = performance.now();
      const duration = 700;
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        scrollTo({ top: from + (to - from) * eased, behavior: "instant" });
        if (t < 1) tween = requestAnimationFrame(step);
        else {
          tween = 0;
          target = -1;
        }
      };
      tween = requestAnimationFrame(step);
    };
    const moving = () => target !== -1;
    const scrollerOf = (index: number) =>
      track.current?.children[index]?.querySelector<HTMLElement>(".tour-page:not([data-full])") ??
      null;
    /** How far the current page can still scroll in this direction, in px. */
    const room = (dir: number) => {
      const box = scrollerOf(panel);
      if (!box) return 0;
      return dir > 0 ? box.scrollHeight - box.clientHeight - box.scrollTop : box.scrollTop;
    };

    const update = () => {
      raf = 0;
      // phones: the pages simply stack, one under another (see the CSS); only the highlight moves
      if (phone.matches) {
        const nodes = track.current?.querySelectorAll<HTMLElement>(":scope > .tour-panel");
        if (!flat) {
          flat = true;
          nodes?.forEach((node) => {
            node.style.transform = "";
            node.style.visibility = "";
            node.style.zIndex = "";
            node.style.removeProperty("--dim");
          });
          setReached(PANELS);
        }
        let on = 0;
        nodes?.forEach((node, i) => {
          if (node.getBoundingClientRect().top < innerHeight * 0.5) on = i;
        });
        if (on - 1 !== last) {
          last = on - 1;
          setActive(on - 1);
        }
        return;
      }
      flat = false;
      const { rect, span } = geometry();
      const p = Math.min(1, Math.max(0, -rect.top / span));
      const x = p * (PANELS - 1);
      // stacked pages: the next one slides in over the current one, which sinks back and dims
      track.current?.querySelectorAll<HTMLElement>(":scope > .tour-panel").forEach((node, i) => {
        const d = i - x;
        let transform = "translate3d(100%,0,0)";
        let dim = 0;
        const shown = d > -1 && d < 1;
        if (d >= 0 && d < 1) transform = `translate3d(${(d * 100).toFixed(2)}%,0,0)`;
        else if (d < 0 && d > -1) {
          transform = `translate3d(${(d * 6).toFixed(2)}%,0,0) scale(${(1 + d * 0.08).toFixed(4)})`;
          dim = -d;
        }
        node.style.transform = transform;
        node.style.visibility = shown ? "visible" : "hidden";
        node.style.setProperty("--dim", dim.toFixed(3));
        node.style.zIndex = String(i);
      });
      stick.current?.style.setProperty("--p", p.toFixed(4));
      panel = Math.round(x);
      const index = panel - 1;
      if (index !== last) {
        last = index;
        setActive(index);
      }
      // a page starts playing as soon as it begins to slide in
      const ahead = Math.min(PANELS - 1, Math.ceil(x - 0.02)) - 1;
      if (ahead > lastAhead) {
        lastAhead = ahead;
        setReached(ahead);
      }
      // when scrolling stops between two pages, finish the move to the nearer one
      clearTimeout(settle);
      settle = window.setTimeout(() => {
        if (!engaged() || moving() || performance.now() - lastWheel < 180) return;
        const off = Math.abs(x - panel) * innerHeight;
        if (off > 2) goTo(panel);
      }, 160);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    // every page fits one screen: a page a little taller than the screen is shrunk to fit
    // (never below 80%), same layout. Measured on load and resize only.
    const fit = () => {
      if (phone.matches) {
        track.current
          ?.querySelectorAll<HTMLElement>(".tour-page > *")
          .forEach((page) => (page.style.zoom = ""));
        return;
      }
      track.current?.querySelectorAll<HTMLElement>(".tour-page:not([data-full])").forEach((box) => {
        const page = box.firstElementChild as HTMLElement | null;
        if (!page) return;
        page.style.zoom = "1";
        const style = getComputedStyle(box);
        const room =
          box.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
        const scale = Math.min(1, room / page.offsetHeight);
        page.style.zoom = String(Math.max(0.8, scale).toFixed(3));
      });
    };
    fit();
    void document.fonts?.ready.then(fit);
    // sidebar entries (/#tour-N) slide the tour to that page instead of navigating
    const onLink = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.('a[href^="/#tour-"]');
      if (!link) return;
      event.preventDefault();
      event.stopPropagation();
      goTo(Number(link.getAttribute("href")!.slice("/#tour-".length)));
    };
    document.addEventListener("click", onLink, true);
    const onResize = () => {
      fit();
      onScroll();
    };
    // one wheel gesture = one page, while the section is pinned. The momentum that follows a
    // flick keeps arriving for a while; it belongs to the same gesture and is swallowed.
    const onWheel = (event: WheelEvent) => {
      if (phone.matches) return;
      const now = performance.now();
      const size = Math.abs(event.deltaY);
      // a new swipe: a pause, or the speed picking up again (momentum only ever slows down)
      const fresh = now - lastWheel > 180 || (size > 10 && size > lastSize * 1.6);
      if (fresh) gesture = "";
      lastWheel = now;
      lastSize = size;
      if (!engaged()) {
        // a gesture that carries the page into the tour doesn't also turn a page
        gesture = "page";
        return;
      }
      if (moving() || gesture === "page") {
        // a swipe made during a slide is spent on it, momentum and all
        gesture = "page";
        event.preventDefault();
        return;
      }
      if (Math.abs(event.deltaY) < 1) return;
      const dir = event.deltaY > 0 ? 1 : -1;
      // a tall page scrolls top to bottom first
      if (room(dir) > 4) {
        event.preventDefault();
        scrollerOf(panel)!.scrollTop += event.deltaY;
        gesture = "inner";
        return;
      }
      // the momentum that scrolled it to the end doesn't also turn the page
      if (gesture === "inner") {
        event.preventDefault();
        return;
      }
      const next = panel + dir;
      if (next < 0 || next > PANELS - 1) return; // a fresh gesture past the ends leaves the tour
      event.preventDefault();
      gesture = "page";
      goTo(next);
    };
    const onKey = (event: KeyboardEvent) => {
      if (phone.matches) return;
      if (!engaged()) return;
      const dir =
        event.key === "ArrowDown" || event.key === "PageDown" || event.key === "ArrowRight"
          ? 1
          : event.key === "ArrowUp" || event.key === "PageUp" || event.key === "ArrowLeft"
            ? -1
            : 0;
      if (!dir) return;
      const arrow = event.key === "ArrowDown" || event.key === "ArrowUp";
      if (arrow && !moving() && room(dir) > 4) {
        event.preventDefault();
        scrollerOf(panel)!.scrollBy({ top: dir * 120, behavior: "smooth" });
        return;
      }
      const next = (moving() ? target : panel) + dir;
      if (next < 0 || next > PANELS - 1) return;
      event.preventDefault();
      goTo(next);
    };

    let listening = false;
    const io = new IntersectionObserver(([entry]) => {
      const on = entry?.isIntersecting ?? false;
      if (on && !listening) {
        addEventListener("scroll", onScroll, { passive: true });
        addEventListener("resize", onResize);
        addEventListener("wheel", onWheel, { passive: false });
        addEventListener("keydown", onKey);
        onScroll();
      } else if (!on && listening) {
        removeEventListener("scroll", onScroll);
        removeEventListener("resize", onResize);
        removeEventListener("wheel", onWheel);
        removeEventListener("keydown", onKey);
      }
      listening = on;
    });
    io.observe(el);
    phone.addEventListener("change", onResize);
    return () => {
      io.disconnect();
      clearTimeout(settle);
      cancelAnimationFrame(tween);
      document.removeEventListener("click", onLink, true);
      phone.removeEventListener("change", onResize);
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onResize);
      removeEventListener("wheel", onWheel);
      removeEventListener("keydown", onKey);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // tell the sidebar which page is on screen
  useEffect(() => {
    dispatchEvent(new CustomEvent(TOUR_EVENT, { detail: active }));
  }, [active]);
  useEffect(() => () => void dispatchEvent(new CustomEvent(TOUR_EVENT, { detail: -1 })), []);

  return (
    <section
      ref={section}
      className="tour bleed"
      style={{ height: `${PANELS * 100}vh` }}
      aria-label="What you can do in the portal"
    >
      <div ref={stick} className="tour-stick">
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
              <div
                className="tour-page"
                data-full={chapter.id === "map" || chapter.id === "page" || undefined}
                data-pad={chapter.id === "page" || undefined}
              >
                <chapter.Page />
              </div>
            </div>
          ))}
        </div>

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
  gold: "linear-gradient(160deg,#ffe27a,#ff9f1c 50%,#5a2a00)",
  night: "linear-gradient(160deg,#5b6cff,#1b1f5e 55%,#05060f)",
  peach: "linear-gradient(160deg,#ffd1b8,#ff7a6b 50%,#7a1f3d)",
  mint: "linear-gradient(160deg,#b8ffe9,#2ee6a6 50%,#0b3d33)",
};

/** Stagger: elements with data-a rise in, in order, when their panel turns on. */
const a = (i: number) => ({ "data-a": "", style: { ["--i" as string]: i } });

/** A real map picture of Williamsburg, Brooklyn (Mapbox static images, the same API the map style
 * thumbnails use), one per theme. */
const snapshot = (theme: "dark" | "light") =>
  `https://api.mapbox.com/styles/v1/mapbox/${theme}-v11/static/-73.9573,40.7163,14.6,0/1280x760@2x?attribution=false&logo=false&access_token=${MAPBOX_TOKEN ?? ""}`;

const PLAY =
  '<circle cx="50" cy="50" r="26" fill="#fff" opacity=".92"/><path d="M44 38l18 12-18 12z" fill="#111"/>';
/** Small artworks for the example pins (drawn here, so nothing is fetched). */
const MOTIF = {
  vinyl:
    '<circle cx="50" cy="50" r="30" fill="#111" opacity=".85"/><circle cx="50" cy="50" r="22" fill="none" stroke="#fff" stroke-opacity=".18"/><circle cx="50" cy="50" r="15" fill="none" stroke="#fff" stroke-opacity=".18"/><circle cx="50" cy="50" r="8" fill="#fff"/><circle cx="50" cy="50" r="2.5" fill="#111"/>',
  ticket:
    '<path d="M18 34h64v10a6 6 0 0 0 0 12v10H18V56a6 6 0 0 0 0-12z" fill="#fff" opacity=".92"/><path d="M60 36v28" stroke="#111" stroke-dasharray="3 3" opacity=".5"/><text x="38" y="55" font-family="Arial Black,Arial" font-weight="900" font-size="11" text-anchor="middle" fill="#111">LIVE</text>',
  note: '<path d="M42 24v36a10 10 0 1 0 6 9V38l22-6v20a10 10 0 1 0 6 9V18z" fill="#fff" opacity=".92"/>',
  key: '<circle cx="36" cy="40" r="14" fill="none" stroke="#fff" stroke-width="7"/><path d="M46 50l26 26m-10-10l7-7m-1 15l7-7" stroke="#fff" stroke-width="7" stroke-linecap="round"/>',
  bag: '<path d="M26 40h48l-5 38H31z" fill="#fff" opacity=".92"/><path d="M38 42v-8a12 12 0 0 1 24 0v8" fill="none" stroke="#fff" stroke-width="5"/>',
  sun: '<circle cx="50" cy="56" r="20" fill="#fff" opacity=".95"/><path d="M14 70h72M20 78h60M28 86h44" stroke="#fff" stroke-width="4" opacity=".7"/>',
  star: '<path d="M50 18l9 21 23 2-17 15 5 23-20-12-20 12 5-23-17-15 23-2z" fill="#fff" opacity=".92"/>',
  play: PLAY,
  mic: '<rect x="40" y="18" width="20" height="36" rx="10" fill="#fff" opacity=".92"/><path d="M30 46a20 20 0 0 0 40 0M50 66v14M38 80h24" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>',
};
const pinArt = (from: string, to: string, motif: keyof typeof MOTIF) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/>${MOTIF[motif]}</svg>`,
  )}`;

const PINS = [
  {
    x: 52,
    y: 30,
    title: "Sunset Sessions poster",
    place: "Rooftop stairs",
    n: "41 / 300",
    look: "active",
    color: "#ff5c8a",
    art: pinArt("#ff8a3d", "#6b3dff", "sun"),
    count: 3,
  },
  {
    x: 63,
    y: 52,
    title: "Rooftop Live entry",
    place: "Bedford Ave",
    n: "12 / 200",
    look: "active",
    color: "#3d9bff",
    art: pinArt("#3ef0ff", "#20124d", "ticket"),
  },
  {
    x: 72,
    y: 26,
    title: "Night Drive drop",
    place: "McCarren Park",
    n: "88 / 500",
    look: "active",
    color: "#7cff5a",
    art: pinArt("#d4ff2a", "#04320f", "note"),
    auto: true,
  },
  {
    x: 46,
    y: 64,
    title: "Chrome skull key",
    place: "Metropolitan Ave",
    n: "Starts Fri",
    look: "scheduled",
    color: "#c9c9c9",
    art: pinArt("#f2f2f2", "#111111", "key"),
  },
  {
    x: 74,
    y: 62,
    title: "Record tote",
    place: "Domino Park",
    n: "150 / 150",
    look: "collected",
    color: "#b06bff",
    art: pinArt("#b06bff", "#3d0b40", "bag"),
  },
  {
    x: 57,
    y: 74,
    title: "Lake-side listening",
    place: "East River pier",
    n: "64 / 120",
    look: "active",
    color: "#2ee6a6",
    art: pinArt("#b8ffe9", "#0b3d33", "vinyl"),
  },
  {
    x: 40,
    y: 22,
    title: "Open mic night",
    place: "Grand St",
    n: "9 / 50",
    look: "active",
    color: "#ff9f1c",
    art: pinArt("#ffe27a", "#5a2a00", "mic"),
  },
  {
    x: 38,
    y: 40,
    title: "Founders star",
    place: "N 7th St",
    n: "Starts Sat",
    look: "scheduled",
    color: "#5b6cff",
    art: pinArt("#5b6cff", "#05060f", "star"),
  },
] as const;

const RING = {
  active: "var(--color-primary)",
  scheduled: "var(--color-info)",
  collected: "var(--color-warning)",
} as const;

/** Hotspot areas, drawn as the hotspot layer draws them (in % of the map). */
const HOTSPOTS = [
  {
    name: "Bedford rooftop block",
    pins: 3,
    points: "47,23 59,21 63,33 66,58 54,60 48,44",
    tag: [44, 19],
  },
  { name: "McCarren Park", pins: 2, points: "64,20 77,19 81,34 76,44 66,38", tag: [64, 16] },
] as const;
/** A fan trail: the route most collectors walk, stop by stop. */
const TRAIL = [
  [46, 64],
  [57, 74],
  [63, 52],
  [52, 30],
  [72, 26],
] as const;
const AREA = "#4dff2a";

/** The map page as the portal draws it: the map edge to edge, hotspot areas, a fan trail and
 * image pins, the toolbar on top, the New pin card on the left, In view and Layers on the right. */
function MapPage() {
  return (
    <div className="tour-map">
      {MAPBOX_TOKEN ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={snapshot("dark")}
            alt=""
            decoding="async"
            className="tour-map-img"
            data-for="dark"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={snapshot("light")}
            alt=""
            decoding="async"
            className="tour-map-img"
            data-for="light"
          />
        </>
      ) : null}

      {/* heat: where collections cluster */}
      {[
        [52, 30, 230],
        [63, 52, 190],
        [72, 26, 170],
      ].map(([x, y, size]) => (
        <span
          key={`${x}-${y}`}
          className="tour-heat"
          style={{ left: `${x}%`, top: `${y}%`, width: size, height: size }}
          aria-hidden
        />
      ))}

      {/* hotspot areas and the trail */}
      <svg className="tour-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {HOTSPOTS.map((spot) => (
          <polygon
            key={spot.name}
            points={spot.points}
            fill={AREA}
            fillOpacity={0.16}
            stroke={AREA}
            strokeWidth={2.5}
            strokeOpacity={0.95}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <polyline
          points={TRAIL.map(([x, y]) => `${x},${y}`).join(" ")}
          fill="none"
          stroke="#000"
          strokeOpacity={0.35}
          strokeWidth={7}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={TRAIL.map(([x, y]) => `${x},${y}`).join(" ")}
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
          className="tour-tag"
          style={{ left: `${spot.tag[0]}%`, top: `${spot.tag[1]}%` }}
        >
          <Hexagon className="size-3" /> {spot.name} · {spot.pins} pins
        </span>
      ))}
      {TRAIL.map(([x, y], index) => (
        <span
          key={`${x}-${y}`}
          className="tour-stop num"
          style={{ left: `${x}%`, top: `${y}%` }}
          aria-hidden
        >
          {index + 1}
        </span>
      ))}
      <span className="tour-tag tour-tag--trail" style={{ left: "40%", top: "80%" }}>
        <Footprints className="size-3" /> Night walk trail · 5 stops · 2.1 km
      </span>

      {PINS.map((pin, index) => (
        <span
          key={pin.title}
          className="tour-pin"
          style={{ left: `${pin.x}%`, top: `${pin.y}%`, ["--i" as string]: index + 1 }}
        >
          <PinGlyph
            size={48}
            color={pin.color}
            imageUrl={pin.art}
            ringColor={RING[pin.look]}
            ringWidth={3}
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
        className="absolute inset-x-4 top-4 z-10 flex flex-wrap items-start gap-2 sm:top-[60px] lg:left-[26rem]"
        {...a(1)}
      >
        <div className="bg-surface flex h-10 w-full items-center gap-2 rounded-lg border px-3 shadow-sm sm:w-80">
          <Search className="text-fg-faint size-4" />
          <span className="text-fg-faint text-sm">Search a place</span>
        </div>
        <div className="bg-surface hidden h-10 items-center gap-2 rounded-lg border px-3 shadow-sm sm:flex">
          <Switch checked={false} tabIndex={-1} aria-label="Show ended" />
          <span className="text-xs font-medium">Show ended</span>
        </div>
        <div className="ml-auto hidden items-center gap-2 sm:flex">
          <Button variant="outline" className="shadow-sm" tabIndex={-1}>
            <Layers /> Main map <ChevronDown />
          </Button>
          <Button variant="outline" className="shadow-sm" tabIndex={-1}>
            <Hexagon /> Draw hotspot
          </Button>
        </div>
      </div>

      {/* New pin card (left, full height), as the form card draws it */}
      <div className="absolute top-4 bottom-4 left-4 z-20 hidden lg:flex" {...a(2)}>
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
              <div className="flex items-center gap-3">
                <PinGlyph
                  size={56}
                  imageUrl={pinArt("#ff8a3d", "#ff3d7f", "ticket")}
                  ringColor="var(--color-primary)"
                  ringWidth={3}
                />
                <div className="min-w-0 text-xs">
                  <b className="block text-sm">Pin image</b>
                  <span className="text-fg-muted">thursday-live.png · Change</span>
                </div>
              </div>
              <Field label="Title">
                <Input readOnly tabIndex={-1} value="Thursday live: first 100" />
              </Field>
              <Field label="Description">
                <Textarea
                  readOnly
                  tabIndex={-1}
                  rows={2}
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
        className="bg-surface/95 border-fg/10 absolute top-[112px] right-4 z-10 hidden w-72 overflow-hidden rounded-[1.4rem] border-2 shadow-lg md:block"
        {...a(3)}
      >
        <div className="flex w-full items-center gap-2 px-4 py-2.5">
          <MapPin className="text-primary-text size-4" />
          <span className="text-sm font-semibold">In view</span>
          <span className="bg-surface-2 num rounded-full px-2 py-0.5 text-xs font-semibold">
            {PINS.length}
          </span>
          <ChevronDown className="text-fg-muted ml-auto size-4" />
        </div>
        <ul className="divide-y border-t">
          {PINS.slice(0, 5).map((pin) => (
            <li key={pin.title} className="flex items-center gap-3 px-4 py-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pin.art} alt="" className="size-9 shrink-0 rounded-lg" />
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

      {/* Layers (right, bottom) */}
      <section
        className="bg-surface/95 border-fg/10 absolute right-4 bottom-4 z-10 hidden w-72 overflow-hidden rounded-[1.4rem] border-2 shadow-lg md:block"
        {...a(4)}
      >
        <p className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold">
          <Layers className="text-primary-text size-4" /> On the map
        </p>
        <ul className="divide-y border-t text-sm">
          {(
            [
              ["Pins", MapPin, `${PINS.length}`, "var(--color-primary)"],
              ["Hotspots", Hexagon, `${HOTSPOTS.length}`, AREA],
              ["Trails", Footprints, "1", "#ffb020"],
              ["Heat", Flame, "30 days", "#ff5c8a"],
            ] as const
          ).map(([label, Icon, count, tint]) => (
            <li key={label} className="flex items-center gap-3 px-4 py-2">
              <span
                className="grid size-7 place-items-center rounded-md"
                style={{ background: `color-mix(in oklab, ${tint} 22%, transparent)`, color: tint }}
              >
                <Icon className="size-3.5" />
              </span>
              <span className="flex-1 font-medium">{label}</span>
              <span className="text-fg-muted num text-xs">{count}</span>
              <Eye className="text-primary-text size-4" />
            </li>
          ))}
        </ul>
      </section>

      <div className="bg-primary text-primary-foreground absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-full px-4 py-1.5 text-xs font-semibold shadow-lg lg:ml-16">
        Click the map where the pin goes
      </div>
    </div>
  );
}

/** An example picture for a card: the ART colours with a motif (drawn here, nothing fetched). */
const pic = (tone: keyof typeof ART, motif: keyof typeof MOTIF) => {
  const [from, to] = ART[tone].match(/#[0-9a-f]{6}/gi) ?? ["#888888", "#222222"];
  // a wide canvas (16:9) with the motif in the middle, so wide cards show it whole
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-110 -40 320 180"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect x="-110" y="-40" width="320" height="180" fill="url(#g)"/><g opacity=".9">${MOTIF[motif]}</g></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}") center / cover no-repeat`;
};

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
    ["McCarren Park", 190],
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

/** Filter tabs, as the real lists draw them (the first is picked). */
function Tabs({ items, i }: { items: string[]; i: number }) {
  return (
    <div data-slot="tabs-list" className="tour-tabs w-fit" {...a(i)}>
      {items.map((item, index) => (
        <span key={item} data-slot="tabs-trigger" data-state={index === 0 ? "active" : undefined}>
          {item}
        </span>
      ))}
    </div>
  );
}

function Heading({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <h2 className="text-fg-muted flex items-center gap-1.5 text-[11px] font-semibold tracking-wider uppercase">
      <Icon className="size-3.5" /> {children}
    </h2>
  );
}

function BountiesPage() {
  const cards = [
    {
      title: "Best rooftop moment",
      text: "Film your best moment at Thursday's show. Under 60 seconds, vertical, with the crowd in it. Three winners share the prize.",
      prize: "750",
      winners: 3,
      left: "2 left",
      art: [pic("sunset", "sun"), pic("violet", "vinyl")],
      action: "View",
    },
    {
      title: "Remix the single",
      text: "Stems are in the brief. Any genre, any length. The best remix goes out on our page and in the next drop.",
      prize: "1.2K",
      winners: 1,
      left: "1 left",
      art: [pic("ocean", "note")],
      action: "Join",
    },
    {
      title: "Design the tour poster",
      text: "A poster for the winter run: Brooklyn, Philly, Boston. Print-ready, 18×24 in. The winner's poster becomes a collectible.",
      prize: "400",
      winners: 1,
      left: "1 left",
      art: [pic("gold", "star"), pic("peach", "sun")],
      action: "Join",
    },
    {
      title: "Cover the B-side",
      text: "Play 'Lake lights' your way: acoustic, a cappella, full band. Post it, tag us, send the link here.",
      prize: "300",
      winners: 2,
      left: "Paused",
      art: [pic("night", "mic")],
      action: "View",
    },
    {
      title: "Find the five posters",
      text: "Five posters are hidden around Williamsburg. Collect all five pins on the map before Sunday midnight.",
      prize: "250",
      winners: 10,
      left: "7 left",
      art: [pic("mint", "key"), pic("ocean", "vinyl")],
      action: "Join",
    },
    {
      title: "Clean the riverbank",
      text: "Photo proof, before and after. Teams welcome: one report per team, everyone on it shares the win.",
      prize: "500",
      winners: 5,
      left: "Ended",
      art: [pic("acid", "star"), pic("chrome", "bag")],
      action: "View",
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
      <Tabs i={5} items={["All 6", "Running 4", "Paused 1", "Ended 1"]} />
      {/* the bounty card as fans see it in the marketplace */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card, index) => (
          <article
            key={card.title}
            className={cn(
              "bg-surface relative isolate flex flex-col overflow-hidden rounded-[1.4rem] border-2 p-4",
              index === 0 && "shadow-[6px_7px_0_0_var(--color-primary)]",
            )}
            {...a(index + 6)}
          >
            <div aria-hidden className="absolute inset-0 -z-10 flex">
              {card.art.map((fill) => (
                <span
                  key={fill}
                  className="h-full min-w-0 flex-1 opacity-60"
                  style={{ background: fill }}
                />
              ))}
              <div className="from-surface/85 via-surface/75 to-surface/95 absolute inset-0 bg-gradient-to-b" />
            </div>
            <div className="flex items-start justify-between gap-3">
              <span className="bg-primary text-primary-foreground -ml-1 inline-flex -rotate-2 flex-wrap items-baseline gap-x-1.5 rounded-xl px-2.5 py-1">
                <b className="display text-2xl leading-none">{card.prize}</b>
                <span className="inline-flex items-center gap-0.5 text-[11px] font-bold opacity-80">
                  ACTION <ExternalLink className="size-2.5" />
                </span>
                <span className="marker text-sm">
                  / {card.winners > 1 ? `${card.winners} winners` : "winner"}
                </span>
              </span>
              <span className="bg-surface-2 text-fg-muted shrink-0 rounded-full border px-3 py-1 text-[11px] font-semibold whitespace-nowrap">
                {card.left}
              </span>
            </div>
            <h3 className="display mt-3 truncate text-2xl leading-tight">{card.title}</h3>
            <p className="text-fg-muted mt-1 mb-3 line-clamp-2 text-[13px] leading-relaxed">
              {card.text}
            </p>
            <div className="mt-auto flex items-center justify-between gap-3 border-t pt-3">
              <span className="text-fg-muted flex min-w-0 items-center gap-2 text-xs">
                <span className="tour-token size-6! rounded-full! text-[9px]!">RR</span>
                <span className="truncate">By Rooftop Records</span>
              </span>
              {card.action === "Join" ? (
                <span className="bg-fg text-bg flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold">
                  <Users className="size-3.5" /> Join
                </span>
              ) : (
                <span className="flex shrink-0 items-center gap-1.5 text-[13px] font-semibold">
                  <Eye className="size-3.5" /> View
                </span>
              )}
            </div>
          </article>
        ))}
      </div>
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
      pic("sunset", "sun"),
      "success",
      "For sale",
    ],
    [
      "Rooftop Live entry",
      "Ticket",
      "12 sold of 200",
      "500",
      "$5.00",
      pic("ocean", "ticket"),
      "success",
      "For sale",
    ],
    [
      "Night Drive (single)",
      "Song",
      "88 sold",
      "90",
      "$0.90",
      pic("acid", "note"),
      "success",
      "For sale",
    ],
    [
      "Chrome skull key",
      "Collectible · NFT",
      "50 sold of 50",
      "300",
      "$3.00",
      pic("chrome", "key"),
      "warning",
      "Sold out",
    ],
    [
      "Record tote",
      "Merch",
      "0 sold of 150",
      "900",
      "$9.00",
      pic("violet", "bag"),
      "neutral",
      "Draft",
    ],
    [
      "Backstage pass",
      "Ticket",
      "18 sold of 25",
      "1,500",
      "$15.00",
      pic("gold", "ticket"),
      "success",
      "For sale",
    ],
    [
      "Lake lights (video)",
      "Video",
      "64 sold",
      "120",
      "$1.20",
      pic("night", "play"),
      "success",
      "For sale",
    ],
    [
      "Signed vinyl",
      "Merch",
      "9 sold of 30",
      "2,400",
      "$24.00",
      pic("peach", "vinyl"),
      "success",
      "For sale",
    ],
    [
      "Tour sticker pack",
      "Merch",
      "203 sold of 500",
      "60",
      "$0.60",
      pic("mint", "star"),
      "success",
      "For sale",
    ],
    [
      "Founders badge",
      "Collectible",
      "100 sold of 100",
      "800",
      "$8.00",
      pic("chrome", "star"),
      "warning",
      "Sold out",
    ],
  ] as const;
  return (
    <div className="grid gap-5">
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
      <Tabs i={5} items={["All 10", "Art", "Tickets", "Merch", "Collectibles", "Video"]} />
      <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        {rows.map(([title, type, sold, action, usd, art, tone, status], index) => (
          <li
            key={title}
            className="bg-surface overflow-hidden rounded-[1.4rem] border-2"
            {...a(index + 6)}
          >
            <span className="relative block h-32" style={{ background: art }}>
              <StatusPill tone={tone} className="bg-surface absolute top-2.5 left-2.5 shadow-sm">
                {status}
              </StatusPill>
            </span>
            <div className="grid gap-0.5 px-3 py-2.5">
              <b className="truncate text-[13px]">{title}</b>
              <span className="text-fg-muted truncate text-[11px]">
                {type} · {sold}
              </span>
              <span className="mt-1 flex items-center justify-between text-xs">
                <span className="num font-semibold">{action} ACTION</span>
                <span className="text-fg-muted num text-[11px]">{usd}</span>
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
      members: 812,
      text: "For everyone who follows along.",
      perks: ["Members-only posts", "Fan badge on the map"],
    },
    {
      name: "Supporter",
      hold: 250,
      members: 318,
      text: "Early access to every drop.",
      perks: ["Early drops, 24h ahead", "Monthly gift pin", "Members-only posts"],
      popular: true,
    },
    {
      name: "VIP",
      hold: 1000,
      members: 74,
      text: "Closest to the band.",
      perks: ["Backstage room at shows", "Signed merch each season", "All Supporter perks"],
    },
  ];
  const members = [
    ["nadia.r", "VIP", "1,480", "2h ago"],
    ["m0ss", "Supporter", "640", "5h ago"],
    ["velvet.ops", "Supporter", "310", "Yesterday"],
    ["drift.king", "Fan", "120", "Yesterday"],
    ["sabbir", "VIP", "2,050", "2 days ago"],
  ] as const;
  return (
    <div className="grid content-start gap-4">
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
        className="bg-surface border-fg/10 flex flex-wrap items-center gap-x-10 gap-y-4 rounded-[1.4rem] border-2 p-4"
        {...a(1)}
      >
        <span className="tour-token">RR</span>
        <div className="min-w-0">
          <p className="display truncate text-2xl">ROOF</p>
          <p className="text-fg-muted text-sm">Rooftop Records fan token</p>
        </div>
        {[
          ["Holders", "1,204"],
          ["Price", "1.84 ACTION"],
          ["24h", "+4.2%"],
          ["Supply held", "61%"],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="text-fg-muted text-xs">{label}</p>
            <p
              className={cn("num text-xl font-semibold", value?.startsWith("+") && "text-success")}
            >
              {value}
            </p>
          </div>
        ))}
        <Button variant="outline" className="ml-auto" tabIndex={-1}>
          <ArrowUpRight /> View on Stellar
        </Button>
      </section>
      <ul className="grid gap-3 md:grid-cols-3">
        {tiers.map((tier, index) => (
          <li
            key={tier.name}
            className={cn(
              "bg-surface border-fg/10 flex flex-col rounded-[1.4rem] border-2 p-4",
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
              <span className="text-fg-muted ml-auto text-[11px] tracking-normal normal-case">
                <Users className="mr-1 inline size-3" />
                {tier.members} members
              </span>
            </p>
            <h3 className="display mt-1 truncate text-2xl">{tier.name}</h3>
            <p className="mt-2">
              <span className="num text-2xl font-semibold">{tier.hold}</span>{" "}
              <span className="text-fg-muted text-sm">ROOF to hold</span>
            </p>
            <p className="text-fg-muted mt-2 text-sm">{tier.text}</p>
            <ul className="mt-3 grid gap-1 border-t pt-3 text-sm">
              {tier.perks.map((perk) => (
                <li key={perk} className="flex gap-2">
                  <Check className="text-primary-text mt-0.5 size-4 shrink-0" /> {perk}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="bg-surface rounded-[1.4rem] border-2 p-4" {...a(5)}>
          <Heading icon={Users}>Newest members</Heading>
          <ul className="mt-2 divide-y">
            {members.map(([name, tier, hold, when]) => (
              <li key={name} className="flex items-center gap-3 py-1.5">
                <Person name={name} size="sm" />
                <StatusPill
                  tone={tier === "VIP" ? "warning" : tier === "Supporter" ? "success" : "neutral"}
                >
                  {tier}
                </StatusPill>
                <span className="num ml-auto text-sm font-semibold">{hold} ROOF</span>
                <span className="text-fg-faint w-20 text-right text-xs">{when}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="bg-surface rounded-[1.4rem] border-2 p-4" {...a(6)}>
          <Heading icon={Crown}>Members by tier</Heading>
          <ul className="mt-3 grid gap-3">
            {tiers.map((tier) => (
              <li key={tier.name} className="grid gap-1.5">
                <span className="flex justify-between text-sm">
                  <b>{tier.name}</b>
                  <span className="num text-fg-muted">{tier.members}</span>
                </span>
                <span className="bg-surface-2 block h-2 overflow-hidden rounded-full">
                  <span
                    className="bg-primary block h-full rounded-full"
                    style={{ width: `${(tier.members / 812) * 100}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
          <p className="text-fg-muted mt-4 border-t pt-3 text-xs">
            1,204 holders · 1,204 in a tier. Members move up the moment they hold more.
          </p>
        </section>
      </div>
    </div>
  );
}

function EventsPage() {
  const events = [
    [
      "Thursday live",
      "Thu, Nov 26 · 8:00 PM",
      "Rooftop Records, Williamsburg",
      "120 RSVPs of 200 · 2 pins, 1 bounty",
      "Upcoming",
      pic("sunset", "mic"),
    ],
    [
      "Listening party",
      "Sat, Nov 28 · 6:00 PM",
      "Online",
      "64 RSVPs · 1 pin linked",
      "Upcoming",
      pic("violet", "vinyl"),
    ],
    [
      "Signing session",
      "Wed, Dec 2 · 5:00 PM",
      "Book Club Bar, Greenpoint",
      "38 RSVPs of 80",
      "Upcoming",
      pic("ocean", "star"),
    ],
    [
      "Winter run: Philadelphia",
      "Fri, Dec 11 · 7:30 PM",
      "Union Transfer, Philly",
      "210 RSVPs of 400 · 3 pins",
      "Upcoming",
      pic("gold", "ticket"),
    ],
    [
      "Winter run: Boston",
      "Sat, Dec 19 · 7:30 PM",
      "Paradise Rock Club",
      "96 RSVPs of 300",
      "Upcoming",
      pic("night", "mic"),
    ],
    [
      "Members' brunch",
      "Sun, Dec 20 · 11:00 AM",
      "Devoción, Williamsburg",
      "VIP only · 22 of 30",
      "Upcoming",
      pic("peach", "sun"),
    ],
    [
      "Riverbank cleanup",
      "Sun, Nov 15 · 9:00 AM",
      "Domino Park",
      "41 came · 1 bounty linked",
      "Past",
      pic("acid", "star"),
    ],
    [
      "Album night",
      "Fri, Nov 6 · 9:00 PM",
      "Rooftop Records, Williamsburg",
      "188 came · 412 pins collected",
      "Past",
      pic("mint", "vinyl"),
    ],
  ] as const;
  return (
    <div className="grid gap-5">
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
      <Tabs i={5} items={["Events 8", "Announcements 12"]} />
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {events.map(([title, when, where, rsvp, status, art], index) => (
          <li
            key={title}
            className="bg-surface overflow-hidden rounded-[1.4rem] border-2"
            {...a(index + 6)}
          >
            <span className="relative block h-24" style={{ background: art }}>
              <StatusPill
                tone={status === "Past" ? "neutral" : "success"}
                className="bg-surface absolute top-2.5 right-2.5 shadow-sm"
              >
                {status}
              </StatusPill>
            </span>
            <div className="grid gap-0.5 px-3.5 py-3">
              <h3 className="display truncate text-xl!">{title}</h3>
              <p className="text-fg-muted text-xs">{when}</p>
              <p className="text-fg-muted flex items-center gap-1.5 text-xs">
                <MapPin className="size-3.5 shrink-0" /> <span className="truncate">{where}</span>
              </p>
              <p className="text-fg-faint truncate text-[11px]">{rsvp}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

const BLOCKS: { label: string; icon: LucideIcon; locked?: boolean; hidden?: boolean }[] = [
  { label: "Cover & profile", icon: ImageIcon, locked: true },
  { label: "About", icon: FileText },
  { label: "Popular songs", icon: Music2 },
  { label: "Tour dates", icon: CalendarDays },
  { label: "Membership tiers", icon: Crown },
  { label: "Latest drops", icon: Package },
  { label: "Gallery", icon: Images, hidden: true },
  { label: "Links", icon: Link2 },
];

/** My page as the page editor draws it: the top bar, the block list, the style bar and the
 * live preview of the public page, with one block selected. */
function PageBuilderPage() {
  const selected = 2;
  return (
    <div className="flex h-full flex-col">
      {/* top bar */}
      <div className="bg-background flex flex-wrap items-center gap-3 border-b px-6 py-3" {...a(0)}>
        <span className="text-fg-muted grid size-9 place-items-center" aria-hidden>
          <ArrowLeft className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="display truncate text-2xl">My page</p>
          <p className="text-fg-muted text-xs">All changes saved · 2 unpublished changes</p>
        </div>
        <div className="bg-surface-2 hidden gap-1 rounded-lg border p-1 sm:flex">
          <span className="bg-surface flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium shadow-sm">
            <Monitor className="size-3.5" /> Desktop
          </span>
          <span className="text-fg-muted flex items-center gap-1 rounded-md px-2.5 py-1 text-xs">
            <Smartphone className="size-3.5" /> Phone
          </span>
        </div>
        <Button
          variant="outline"
          size="icon"
          className="hidden sm:inline-flex"
          tabIndex={-1}
          aria-label="More"
        >
          <MoreHorizontal />
        </Button>
        <Button variant="outline" className="hidden sm:inline-flex" tabIndex={-1}>
          <Link2 /> Short link
        </Button>
        <Button variant="outline" tabIndex={-1}>
          View page <ExternalLink />
        </Button>
        <Button tabIndex={-1}>Publish changes</Button>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* block list */}
        <aside className="hidden min-h-0 overflow-hidden border-r p-4 lg:block" {...a(1)}>
          <h2 className="text-fg-muted mb-2 text-xs font-semibold tracking-wider uppercase">
            Your page
          </h2>
          <ol className="grid gap-1">
            {BLOCKS.map((block, index) => (
              <li
                key={block.label}
                className={cn(
                  "relative flex items-center gap-0.5 rounded-lg border pr-1",
                  index === selected ? "border-primary bg-primary/10" : "border-transparent",
                )}
              >
                <span
                  className={cn(
                    "text-fg-faint grid w-5 shrink-0 place-items-center pl-1",
                    block.locked && "invisible",
                  )}
                >
                  <GripVertical className="size-4" />
                </span>
                <span
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 py-2 pr-1 text-sm",
                    block.hidden && "opacity-50",
                  )}
                >
                  <block.icon className="size-4 shrink-0" />
                  <span className="truncate">{block.label}</span>
                </span>
                {!block.locked && (
                  <>
                    {index === selected && (
                      <>
                        <span className="text-fg-muted grid size-7 place-items-center">
                          <ArrowUp className="size-3.5" />
                        </span>
                        <span className="text-fg-muted grid size-7 place-items-center">
                          <ArrowDown className="size-3.5" />
                        </span>
                      </>
                    )}
                    <span className="text-fg-muted grid size-7 place-items-center">
                      {block.hidden ? (
                        <EyeOff className="size-3.5" />
                      ) : (
                        <Eye className="size-3.5" />
                      )}
                    </span>
                  </>
                )}
              </li>
            ))}
          </ol>
          <p className="text-fg-faint mt-2 px-1 text-[11px]">
            Drag to reorder. Click a block for its settings, or + in the preview to add one after
            it.
          </p>
          <Button variant="outline" className="mt-4 w-full" tabIndex={-1}>
            <Plus /> Add a block
          </Button>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-col">
          {/* style bar */}
          <div
            className="bg-background/90 flex flex-wrap items-center gap-2 border-b px-3 py-2"
            {...a(2)}
          >
            <span className="text-fg-faint mr-1 text-[11px] font-semibold tracking-wider uppercase">
              Page style
            </span>
            <span className="tour-chip">
              <span
                className="size-4 rounded-full border border-black/10"
                style={{ background: "#ff5c8a" }}
              />
              <ChevronDown className="text-fg-muted size-3.5" />
            </span>
            {[
              ["Font", "Display"],
              ["Corners", "Round"],
              ["Spacing", "Comfortable"],
            ].map(([label, value]) => (
              <span key={label} className="tour-chip">
                <span className="text-fg-muted">{label}</span>
                <b className="font-semibold">{value}</b>
                <ChevronDown className="text-fg-muted size-3.5" />
              </span>
            ))}
            <Button className="ml-auto h-9 rounded-full" tabIndex={-1}>
              <Music2 /> Popular songs
            </Button>
          </div>

          {/* the preview of the public page */}
          <div className="bg-surface-2 flex min-h-0 flex-1 justify-center overflow-hidden p-4">
            <div className="tour-site" {...a(3)}>
              <div className="tour-site-cover" style={{ background: pic("sunset", "sun") }}>
                <span className="tour-site-nav">
                  <b>Rooftop Records</b>
                  <span>Music</span>
                  <span>Tour</span>
                  <span>Members</span>
                  <span>Shop</span>
                </span>
              </div>
              <div className="relative z-10 flex flex-wrap items-end gap-x-4 gap-y-2 px-4 sm:px-6">
                <span className="tour-token -mt-9 size-20! text-3xl!">RR</span>
                <div className="min-w-[10rem] flex-1 pb-1">
                  <p className="flex items-center gap-1.5 text-lg font-bold">
                    Rooftop Records <BadgeCheck className="text-primary-text size-4" />
                  </p>
                  <p className="text-fg-muted text-xs">Music · Brooklyn, NY · 1,204 holders</p>
                </div>
                <span className="flex gap-2">
                  <span className="tour-site-btn tour-site-btn--ghost">Follow</span>
                  <span className="tour-site-btn">Buy ROOF</span>
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 p-4 pt-5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] sm:p-6">
                {/* the selected block */}
                <section className="tour-site-block" data-selected {...a(4)}>
                  <span className="tour-site-tag">Popular songs</span>
                  <ol className="mt-2 grid gap-1.5">
                    {[
                      ["Night drive", "3:12", "90"],
                      ["Rooftop anthem", "2:58", "120"],
                      ["Slow burn", "4:05", "60"],
                      ["Lake lights", "3:31", "90"],
                    ].map(([song, time, price], index) => (
                      <li
                        key={song}
                        className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm"
                      >
                        <span className="text-fg-faint num w-3 text-xs">{index + 1}</span>
                        <span
                          className="grid size-7 place-items-center rounded-full"
                          style={{ background: "#ff5c8a", color: "#fff" }}
                        >
                          <Play className="size-3" fill="currentColor" />
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium">{song}</span>
                        <span className="text-fg-faint num text-xs">{time}</span>
                        <span className="num text-xs font-semibold">{price} ACTION</span>
                      </li>
                    ))}
                  </ol>
                  <span className="tour-site-add" aria-hidden>
                    <Plus className="size-3.5" />
                  </span>
                </section>
                <section className="tour-site-block" {...a(5)}>
                  <span className="tour-site-tag">Tour dates</span>
                  <ul className="mt-2 grid gap-2">
                    {[
                      ["NOV", "26", "Thursday live", "Rooftop, Williamsburg"],
                      ["NOV", "28", "Listening party", "Online"],
                      ["DEC", "02", "Signing session", "Book Club Bar, Greenpoint"],
                    ].map(([month, day, title, where]) => (
                      <li key={title} className="flex items-center gap-3">
                        <span className="tour-site-date">
                          <small>{month}</small>
                          {day}
                        </span>
                        <span className="min-w-0">
                          <b className="block truncate text-sm">{title}</b>
                          <span className="text-fg-muted text-xs">{where}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
                <section className="tour-site-block sm:col-span-2" {...a(6)}>
                  <span className="tour-site-tag">Membership tiers</span>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {[
                      ["Fan", "50"],
                      ["Supporter", "250"],
                      ["VIP", "1000"],
                    ].map(([name, hold], index) => (
                      <div
                        key={name}
                        className="rounded-xl border p-3"
                        style={index === 1 ? { borderColor: "#ff5c8a" } : undefined}
                      >
                        <b className="block text-sm">{name}</b>
                        <span className="num text-lg font-bold">{hold}</span>{" "}
                        <span className="text-fg-muted text-xs">ROOF</span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WalletPage() {
  const activity = [
    [ShoppingBag, "Sold: Signed vinyl", "to nadia.r · 12 min ago", "+2,400", true],
    [Music2, "Song sales: Night Drive", "6 buyers · 1h ago", "+540", true],
    [Trophy, "Bounty prize to escrow", "Remix the single · 3h ago", "-1,200", false],
    [Ticket, "Sold: Backstage pass", "to m0ss · 5h ago", "+1,500", true],
    [Gift, "Gift from a fan", "velvet.ops · Yesterday", "+100", true],
  ] as const;
  return (
    <div className="grid content-start gap-5">
      <div {...a(0)}>
        <PageHeader eyebrow="Account" title="Wallet" description="Your balance on Stellar." />
      </div>
      <div {...a(1)}>
        <WalletHero
          label="your ACTION balance"
          address="GDROOFTOPRECORDSEXAMPLEWALLETADDRESSFORTHETOURPAGE0000"
          balance={
            <TallText className="pb-[0.12em] text-6xl tabular-nums sm:text-7xl">
              48.6K <span className="text-[0.45em]">ACTION</span>
            </TallText>
          }
          below={
            <p className="text-side-ink/75 flex flex-wrap gap-x-4 text-sm font-semibold">
              <span>9,996 XLM</span>
              <span>120 USDC</span>
            </p>
          }
          actions={[
            { id: "send", label: "Send", icon: Send, primary: true },
            { id: "swap", label: "Swap", icon: ArrowDownUp },
            { id: "redeem", label: "Redeem", icon: QrCode },
          ]}
        />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div {...a(6)}>
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
                {
                  key: "skull",
                  code: "SKULL",
                  title: "Chrome skull key (NFT)",
                  amount: "1",
                  onSend: null,
                },
              ]}
            />
          </WalletPanel>
        </div>
        <section className="bg-surface rounded-[1.4rem] border-2 p-4" {...a(7)}>
          <Heading icon={Clock}>Recent activity</Heading>
          <ul className="mt-2 divide-y">
            {activity.map(([Icon, title, sub, amount, plus]) => (
              <li key={title} className="flex items-center gap-3 py-2">
                <span className="bg-surface-2 grid size-9 shrink-0 place-items-center rounded-full">
                  <Icon className="text-fg-muted size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm">{title}</b>
                  <span className="text-fg-faint text-xs">{sub}</span>
                </span>
                <span
                  className={cn(
                    "num text-sm font-semibold",
                    plus ? "text-success" : "text-fg-muted",
                  )}
                >
                  {amount} ACTION
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
