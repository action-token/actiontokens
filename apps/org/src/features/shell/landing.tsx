"use client";

import { ArrowUpRight, Coins, LogIn, ScanLine, Store, Users, type LucideIcon } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";

import { cn } from "@actiontokens/ui/lib/cn";
import { BrandMark } from "@actiontokens/ui/patterns/boot-screen";
import { useConnectWalletDialogStore } from "@actiontokens/wallet";

import { AR_URL, FAN_APP_URL } from "./links";
import { anton, gothic } from "./landing-fonts";
import { LandingHero } from "./landing-hero";
import { DropRail, MapPanels, OrgCardPreview, WantedBoard } from "./landing-sections";

/**
 * Signed out: the portal's front page, after docs/mockups/home.html. A scroll-played hero (the
 * Action frames with three headlines), a neon ribbon, then sections with a blackletter tag and a
 * chrome title that rise into view. Every portal address shows it until you sign in. The cards
 * are examples drawn in code. Kept light: no particles, no blur, nothing animating at rest
 * beyond small CSS transforms.
 */
export function Landing() {
  const open = useConnectWalletDialogStore((state) => state.setIsOpen);
  const signIn = () => open(true);
  const root = useReveal<HTMLDivElement>();

  return (
    <div ref={root} className={cn(anton.variable, gothic.variable)}>
      <LandingHero onSignIn={signIn} />
      <Marquee />

      <div className="mx-auto grid w-full max-w-6xl gap-24 px-4 pt-16 pb-20 sm:px-8">
        <Section
          tag="Fresh off the block"
          title="Live drops"
          note="Sell songs, art, tickets, merch and memberships as tokens fans keep. Limited runs, timed drops, resales that pay you again."
        >
          <DropRail />
        </Section>

        <Section
          tag="The board"
          title="Bounties"
          note="Every prize sits in escrow on-chain before the hunt starts. Fans do the thing, prove it, and you pick the winners."
        >
          <WantedBoard />
        </Section>

        <Section
          tag="Out in the world"
          title="The map"
          note="Your drops live on the real map, and on your own website."
        >
          <MapPanels />
        </Section>

        <Section
          tag="Stack it"
          title="Get paid"
          note="Your organization gets a page, a token and a wallet. Every sale lands in ACTION."
        >
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,380px)_1fr]">
            <OrgCardPreview />
            <ul className="grid gap-6" data-reveal>
              <Point icon={Coins} title="Your own token">
                Fans hold it, trade it and use it to unlock what you decide: tracks, tickets, rooms.
              </Point>
              <Point icon={Users} title="Members and royalties">
                Membership tiers pay you every month, and royalties keep paying when fans resell.
              </Point>
              <Point icon={Store} title="Swap, send, keep">
                Move between ACTION, XLM and USDC from your wallet whenever you like.
              </Point>
            </ul>
          </div>
        </Section>

        <Section tag="Three moves" title="How it works" note="From sign-in to your first drop.">
          <ol className="grid gap-4 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li
                key={step.title}
                className="lp-step"
                data-reveal
                style={{ transitionDelay: `${index * 100}ms` }}
              >
                <span className="lp-step-no">{String(index + 1).padStart(2, "0")}</span>
                <p className="lp-h3 mt-4">{step.title}</p>
                <p className="text-fg-muted mt-2 text-sm text-pretty">{step.body}</p>
              </li>
            ))}
          </ol>
        </Section>

        <section className="lp-final" data-reveal>
          <span className="lp-final-mark" aria-hidden>
            <BrandMark className="h-10" />
          </span>
          <p className="lp-sec-title lp-chrome mt-5 text-center">Ready to drop?</p>
          <p className="text-fg-muted mx-auto mt-3 max-w-md text-center text-pretty">
            Sign in to set up your organization. Fans find you on the map, in the marketplace and on
            your own page.
          </p>
          <div className="mt-7 flex justify-center">
            <button type="button" onClick={signIn} className="lp-cta">
              <LogIn className="size-5" strokeWidth={2.4} /> Sign in / Sign up
            </button>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <a href={FAN_APP_URL} className="lp-chip">
              <Store className="size-4" /> See the marketplace <ArrowUpRight className="size-3.5" />
            </a>
            <a href={AR_URL} className="lp-chip">
              <ScanLine className="size-4" /> Open the AR app <ArrowUpRight className="size-3.5" />
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}

const RIBBON = [
  "Drop pins IRL",
  "Bounties in escrow",
  "Sell music",
  "Memberships",
  "Paid in ACTION",
  "On Stellar",
  "Your own token",
];

/** The tilted neon ribbon under the hero (CSS only: one transform animation). */
function Marquee() {
  const run = [...RIBBON, ...RIBBON];
  return (
    <div className="lp-marquee-box" aria-hidden>
      <div className="lp-marquee">
        <div className="lp-marquee-track">
          {run.map((word, index) => (
            <span key={index}>{word}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Section({
  tag,
  title,
  note,
  children,
}: {
  tag: string;
  title: string;
  note: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-7" aria-label={title}>
      <div data-reveal>
        <p className="lp-tag">{tag}</p>
        <h2 className="lp-sec-title lp-chrome">{title}</h2>
        <p className="text-fg-muted mt-3 max-w-md">{note}</p>
      </div>
      {children}
    </section>
  );
}

function Point({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="flex gap-4">
      <span className="gx-launch-icon mt-0.5 shrink-0">
        <Icon className="size-4" strokeWidth={2.4} />
      </span>
      <span>
        <span className="lp-h3 block">{title}</span>
        <span className="text-fg-muted mt-1.5 block text-sm text-pretty">{children}</span>
      </span>
    </li>
  );
}

/** Marks each `[data-reveal]` inside the returned ref with `data-in` once it reaches the screen. */
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const items = ref.current?.querySelectorAll<HTMLElement>("[data-reveal]");
    if (!items?.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-in", "");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);
  return ref;
}

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
