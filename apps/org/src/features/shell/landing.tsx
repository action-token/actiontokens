"use client";

import { ArrowUpRight, LogIn, ScanLine, Store } from "lucide-react";
import { useEffect, useRef } from "react";

import { cn } from "@actiontokens/ui/lib/cn";
import { BrandMark } from "@actiontokens/ui/patterns/boot-screen";
import { useConnectWalletDialogStore } from "@actiontokens/wallet";

import { AR_URL, FAN_APP_URL } from "./links";
import { anton, gothic } from "./landing-fonts";
import { LandingHero } from "./landing-hero";
import { ThemeControl } from "./theme-control";
import { FeatureTour } from "./feature-tour";

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
      <header className="lp-top">
        <span className="flex items-center gap-2.5">
          <span className="gx-logo grid size-10 place-items-center rounded-xl bg-white">
            <BrandMark className="h-7" />
          </span>
          <span className="hidden leading-none sm:block">
            <span className="gx-brand block text-[1.35rem]">Action-Tokens</span>
            <span className="gx-mono text-primary-text text-[10px]">organization portal</span>
          </span>
        </span>
        <span className="flex items-center gap-2">
          <ThemeControl className="lp-top-theme" />
          <button type="button" onClick={signIn} className="lp-cta !h-10 !px-4 !text-[1.05rem]">
            <LogIn className="size-4" strokeWidth={2.4} /> Sign in
          </button>
        </span>
      </header>
      <LandingHero onSignIn={signIn} />
      <Marquee />

      <FeatureTour />

      <div className="mx-auto grid w-full max-w-6xl gap-24 px-4 pt-16 pb-20 sm:px-8">
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
