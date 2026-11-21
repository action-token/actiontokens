"use client";

import {
  ArrowRight,
  BadgeCheck,
  Code2,
  Coins,
  LogIn,
  MapPinned,
  Music2,
  Sparkles,
  Trophy,
  type LucideIcon,
} from "lucide-react";

import { BrandMark } from "@actiontokens/ui/patterns/boot-screen";
import { useConnectWalletDialogStore } from "@actiontokens/wallet";

/**
 * Signed out: the portal's front page. Every portal address shows it until you sign in. A hero
 * with the product shown as floating cards (a pin drop on a map, a bounty, a collectible, the
 * vault), what an organization can do, three steps, and a last call to sign up. The pictures are
 * illustrations drawn in code (no images); every button opens the sign-in dialog.
 */
export function Landing() {
  const open = useConnectWalletDialogStore((state) => state.setIsOpen);
  const signIn = () => open(true);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-8 pb-16 sm:px-8 lg:pt-14">
      {/* ── Hero ── */}
      <section className="grid items-center gap-12 lg:grid-cols-[1.05fr_1fr]">
        <div className="ap-rise">
          <p data-slot="page-eyebrow">Organization portal</p>
          <h1 className="lp-title mt-4">
            Put your world <span className="lp-hl">on the map.</span>
          </h1>
          <p className="text-fg-muted mt-5 max-w-lg text-base text-pretty sm:text-lg">
            Drop collectibles at real places, run bounties with prizes held in escrow, sell music,
            items and memberships, and get paid in ACTION on Stellar. One portal for your whole
            organization.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" onClick={signIn} className="lp-cta">
              <LogIn className="size-5" strokeWidth={2.4} />
              Sign in / Sign up
            </button>
            <button type="button" onClick={signIn} className="lp-cta lp-cta--ghost">
              Become an organization <ArrowRight className="size-4" />
            </button>
          </div>
          <p className="gx-mono text-fg-faint mt-5">Email · Google · Apple · any Stellar wallet</p>
        </div>

        <HeroDeck />
      </section>

      {/* ── What you can do ── */}
      <section className="mt-24">
        <p data-slot="page-eyebrow">What you can do</p>
        <h2 className="lp-h2 mt-3">Everything fans can collect, in one place</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, index) => (
            <Feature key={feature.title} {...feature} index={index} />
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="mt-24">
        <p data-slot="page-eyebrow">How it works</p>
        <h2 className="lp-h2 mt-3">Live in three steps</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="lp-step">
              <span className="lp-step-no">{String(index + 1).padStart(2, "0")}</span>
              <h3 className="lp-h3 mt-4">{step.title}</h3>
              <p className="text-fg-muted mt-2 text-sm text-pretty">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Last call ── */}
      <section className="lp-final mt-24">
        <span className="lp-final-mark" aria-hidden>
          <BrandMark className="h-10" />
        </span>
        <h2 className="lp-h2 mt-5 text-center">Ready to drop?</h2>
        <p className="text-fg-muted mx-auto mt-3 max-w-md text-center text-pretty">
          Sign in to set up your organization. Fans find you on the map, in the marketplace and on
          your own page.
        </p>
        <div className="mt-7 flex justify-center">
          <button type="button" onClick={signIn} className="lp-cta">
            <Sparkles className="size-5" strokeWidth={2.4} />
            Start now
          </button>
        </div>
      </section>
    </div>
  );
}

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: MapPinned,
    title: "Drops on the real map",
    body: "Pin collectibles to places. Fans walk there and collect them in AR. Schedule them, limit them, see who came.",
  },
  {
    icon: Trophy,
    title: "Bounties",
    body: "Set a challenge and a prize. The prize waits in escrow until you pick the winners.",
  },
  {
    icon: Music2,
    title: "Music, items, memberships",
    body: "Sell songs, art, tickets and merch as tokens, and give members tiers with their own perks.",
  },
  {
    icon: Coins,
    title: "Paid in ACTION",
    body: "Every sale lands in your wallet on Stellar. Swap, send or keep it. Royalties included.",
  },
  {
    icon: Code2,
    title: "Your map on your site",
    body: "Embed your live map on any website with one snippet. Your pins, your colours.",
  },
  {
    icon: BadgeCheck,
    title: "Your own page",
    body: "A page for your organization with your songs, drops, events and links, on your own domain if you like.",
  },
];

const STEPS = [
  {
    title: "Sign in",
    body: "Use email, Google, Apple or your Stellar wallet. A wallet is set up for you if you need one.",
  },
  {
    title: "Set up your organization",
    body: "Pick a name and a look, and open your token. An admin checks it and you're in.",
  },
  {
    title: "Drop, sell, get paid",
    body: "Put pins on the map, open a bounty, list your first item. Fans collect, you earn.",
  },
];

function Feature({
  icon: Icon,
  title,
  body,
  index,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  index: number;
}) {
  return (
    <div className="lp-feature ap-rise" style={{ animationDelay: `${index * 60}ms` }}>
      <span className="gx-launch-icon">
        <Icon className="size-4" strokeWidth={2.4} />
      </span>
      <h3 className="lp-h3 mt-4">{title}</h3>
      <p className="text-fg-muted mt-2 text-sm text-pretty">{body}</p>
    </div>
  );
}

/** The product as a stack of floating cards: a map with live pins, a collectible, a bounty and the vault. */
function HeroDeck() {
  return (
    <div aria-hidden className="relative mx-auto h-[470px] w-full max-w-[520px]">
      {/* map */}
      <div className="lp-card ap-float absolute top-0 left-0 z-10 w-[72%]">
        <div className="flex items-center justify-between px-4 pt-3.5">
          <span className="gx-mono text-fg-muted">Map · live drops</span>
          <span className="gx-mono text-primary-text flex items-center gap-1.5">
            <span className="gx-live" /> 3 live
          </span>
        </div>
        <MiniMap />
      </div>

      {/* collectible */}
      <div
        className="lp-card ap-float absolute top-[20%] right-0 z-20 w-[40%] p-3"
        style={{ animationDelay: "-2.4s" }}
      >
        <div className="lp-art">
          <span className="lp-art-sun" />
        </div>
        <p className="lp-h3 mt-3 text-[1.05rem]">Sunset sessions</p>
        <div className="mt-1 flex items-center justify-between">
          <span className="gx-mono text-primary-text">250 ACTION</span>
          <span className="gx-mono text-fg-faint">41/300</span>
        </div>
      </div>

      {/* bounty */}
      <div
        className="lp-card ap-float absolute bottom-[3%] left-0 z-30 w-[55%] p-4"
        style={{ animationDelay: "-4.2s" }}
      >
        <div className="flex items-center gap-2.5">
          <span className="gx-launch-icon !size-7">
            <Trophy className="size-3.5" strokeWidth={2.4} />
          </span>
          <span className="gx-mono text-fg-muted">Bounty · running</span>
        </div>
        <p className="lp-h3 mt-3 text-[1.05rem]">Best rooftop moment</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="gx-mono text-[var(--gx-acid-text)]">Prize 750 ACTION</span>
          <span className="gx-mono text-fg-faint">12 joined</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--gx-fill-strong)]">
          <div className="h-full w-[62%] rounded-full bg-[var(--gx-neon)] shadow-[0_0_10px_var(--gx-glow)]" />
        </div>
      </div>

      {/* vault chip */}
      <div
        className="ap-float absolute right-[4%] bottom-0 z-30 w-[38%]"
        style={{ animationDelay: "-1.2s" }}
      >
        <div className="gx-vault">
          <span className="gx-vault-in">
            <span className="gx-mono text-fg-muted">Vault</span>
            <span className="gx-amount mt-1 block">+1,250</span>
            <span className="gx-mono text-[var(--gx-acid-text)]">ACTION today</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/** A small map: streets on a grid, a river, and three pulsing pins. */
function MiniMap() {
  const pins = [
    { x: 92, y: 70, delay: "0s" },
    { x: 210, y: 118, delay: "-0.8s" },
    { x: 300, y: 54, delay: "-1.6s" },
  ];
  return (
    <svg viewBox="0 0 380 190" className="mt-2 block w-full">
      <defs>
        <linearGradient id="lp-river" x1="0" x2="1">
          <stop offset="0" stopColor="var(--gx-neon)" stopOpacity="0.25" />
          <stop offset="1" stopColor="var(--gx-acid)" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <g stroke="var(--gx-line)" strokeWidth="1">
        {Array.from({ length: 9 }, (_, i) => (
          <line key={`v${i}`} x1={i * 46 + 10} y1="0" x2={i * 46 - 20} y2="190" />
        ))}
        {Array.from({ length: 5 }, (_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 44 + 14} x2="380" y2={i * 44 + 4} />
        ))}
      </g>
      <path
        d="M-10 160 C 80 120, 140 180, 230 140 S 340 90, 400 110"
        fill="none"
        stroke="url(#lp-river)"
        strokeWidth="14"
        strokeLinecap="round"
      />
      <path
        d="M20 30 L120 40 L170 100 L280 90"
        fill="none"
        stroke="var(--gx-line-strong)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="2 7"
      />
      {pins.map((pin) => (
        <g key={pin.x} transform={`translate(${pin.x} ${pin.y})`}>
          <circle
            r="16"
            fill="var(--gx-neon)"
            opacity="0.25"
            className="lp-pulse"
            style={{ animationDelay: pin.delay }}
          />
          <circle r="7" fill="var(--gx-neon)" stroke="var(--gx-panel-a)" strokeWidth="2.5" />
        </g>
      ))}
    </svg>
  );
}
