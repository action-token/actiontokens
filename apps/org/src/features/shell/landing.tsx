"use client";

import {
  ArrowUpRight,
  CalendarDays,
  Crown,
  LogIn,
  Menu,
  MapPin,
  ScanLine,
  ShoppingBag,
  Store,
  Trophy,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@actiontokens/ui/lib/cn";
import { BrandMark } from "@actiontokens/ui/patterns/boot-screen";
import { useConnectWalletDialogStore } from "@actiontokens/wallet";

import { AR_URL, FAN_APP_URL, PORTAL_MENU_EVENT } from "./links";
import { anton, gothic } from "./landing-fonts";
import { ThemeControl } from "@actiontokens/ui/patterns/theme-control";
import { FeatureTour } from "./feature-tour";

/**
 * Signed out: the portal's front page. It opens on the map page, and scrolling plays the portal's
 * pages one after another (FeatureTour), then a closing call to sign in. Every portal address shows it until you sign in. The cards
 * are examples drawn in code. Kept light: no particles, no blur, nothing animating at rest
 * beyond small CSS transforms.
 */
export function Landing() {
  const open = useConnectWalletDialogStore((state) => state.setIsOpen);
  const signIn = () => open(true);
  const root = useReveal<HTMLDivElement>();
  const [notchOpen, setNotchOpen] = useState(false);

  return (
    <div ref={root} className={cn(anton.variable, gothic.variable)}>
      <header className="lp-top" data-open={notchOpen || undefined}>
        <span className="flex min-w-0 items-center gap-2 sm:gap-2.5">
          <span className="gx-logo grid size-9 shrink-0 place-items-center rounded-xl bg-white sm:size-10">
            <BrandMark className="h-7" />
          </span>
          <span className="min-w-0 leading-none">
            <span className="gx-brand block truncate text-[1rem]! sm:text-[1.35rem]!">
              Action-Tokens
            </span>
            <span className="gx-mono text-primary-text block truncate text-[8px]! tracking-[0.06em]! whitespace-nowrap sm:text-[10px]! sm:tracking-[0.2em]!">
              organization portal
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <ThemeControl className="lp-top-theme max-sm:hidden" />
          <button
            type="button"
            onClick={signIn}
            aria-label="Sign in"
            className="lp-cta !h-10 !px-3 !text-[1.05rem] sm:!px-4"
          >
            <LogIn className="size-4" strokeWidth={2.4} />{" "}
            <span className="max-[380px]:hidden">Sign in</span>
          </button>
          {/* phones: the menu (the side sheet), since the notch stands in for the phone header */}
          <button
            type="button"
            onClick={() => dispatchEvent(new Event(PORTAL_MENU_EVENT))}
            aria-label="Menu"
            className="bg-primary text-primary-ink grid size-10 place-items-center rounded-xl sm:hidden"
          >
            <Menu className="size-5" />
          </button>
        </span>
        <NotchFeed onOpen={setNotchOpen} />
      </header>
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

/** Example notifications for the front page's notch (what an organization gets told about). */
const NOTES = [
  { icon: MapPin, text: "nadia.r collected Sunset Sessions poster", when: "2m" },
  { icon: Trophy, text: "3 new reports on Best rooftop moment", when: "18m" },
  { icon: ShoppingBag, text: "Sold: Signed vinyl · +2,400 ACTION", when: "1h" },
  { icon: Crown, text: "m0ss moved up to Supporter", when: "3h" },
  { icon: CalendarDays, text: "Thursday live reached 120 RSVPs", when: "1d" },
];

/** iPhone-style: the notch grows down to show a notification, then folds back; a new one
 * every 3 seconds (transform and opacity only; paused while the tab is hidden). */
function NotchFeed({ onOpen }: { onOpen: (open: boolean) => void }) {
  const [index, setIndex] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let hide = 0;
    const show = () => {
      if (document.hidden) return;
      setOpen(true);
      hide = window.setTimeout(() => setOpen(false), 2300);
    };
    const first = window.setTimeout(show, 900);
    const id = window.setInterval(() => {
      if (document.hidden) return;
      setIndex((value) => (value + 1) % NOTES.length);
      show();
    }, 3000);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(hide);
      window.clearInterval(id);
    };
  }, []);
  useEffect(() => onOpen(open), [open, onOpen]);
  const note = NOTES[index]!;
  return (
    <div className="lp-feed" data-open={open || undefined} aria-live="polite">
      <div key={index} className="lp-feed-item">
        <span className="bg-primary text-primary-ink grid size-9 shrink-0 place-items-center rounded-xl">
          <note.icon className="size-[18px]" />
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <b className="block text-[12px]">Action-Tokens</b>
          <span className="text-fg-muted block truncate text-[12px]">{note.text}</span>
        </span>
        <span className="text-fg-faint shrink-0 self-start text-[11px]">{note.when}</span>
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
