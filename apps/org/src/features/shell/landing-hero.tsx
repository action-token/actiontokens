"use client";

import { ArrowRight, LogIn } from "lucide-react";
import { useEffect, useRef } from "react";

const FRAMES = 175;
const src = (i: number) => `/landing/frames/f${String(i + 1).padStart(3, "0")}.jpg`;

/** The three lines the hero swaps through as the frames play (first frame each one shows from). */
const LINES = [
  { from: 0, top: "Drop it.", bottom: "Get found." },
  { from: 40, top: "Run", bottom: "Bounties." },
  { from: 100, top: "Sell it.", bottom: "Get paid." },
];

const FACTS = [
  ["Stellar", "every sale on-chain"],
  ["Escrow", "every bounty prize"],
  ["AR", "collected on the spot"],
  ["ACTION", "paid straight to you"],
];

/**
 * The landing page's opening, after docs/mockups/home.html: a tall section whose sticky,
 * full-screen stage plays 175 frames as you scroll (the hand and the Action mark), with three
 * headlines swapping over it, the facts rail and the buttons; at the end the stage docks into a
 * glowing card. Kept light on the GPU: a frame is drawn only when the scroll position changes
 * (one requestAnimationFrame per scroll, none at rest), scroll is only watched while the hero is
 * on screen, and the dock moves with transform and opacity only. No particles, no tilt, no blur.
 */
export function LandingHero({ onSignIn }: { onSignIn: () => void }) {
  const section = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const counter = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLElement>(null);

  useEffect(() => {
    const hero = section.current;
    const cv = canvas.current;
    const ctx = cv?.getContext("2d", { alpha: false });
    if (!hero || !cv || !ctx) return;

    const imgs: (HTMLImageElement | undefined)[] = Array.from({ length: FRAMES }, () => undefined);
    let cancelled = false;
    let drawn = -1;
    let want = 0;
    let state = "";

    const nearest = (i: number) => {
      for (let d = 0; d < FRAMES; d++) {
        const back = imgs[i - d];
        if (back) return back;
        const fwd = imgs[i + d];
        if (fwd) return fwd;
      }
      return undefined;
    };
    const draw = (i: number, force = false) => {
      if (!force && i === drawn) return;
      const im = nearest(i);
      if (!im) return;
      drawn = i;
      ctx.drawImage(im, 0, 0, 1280, 720);
    };
    const load = (i: number) =>
      new Promise<void>((resolve) => {
        const im = new Image();
        im.src = src(i);
        im.decode()
          .then(() => {
            if (cancelled) return;
            imgs[i] = im;
            // a closer frame arrived for where we are: show it
            if (Math.abs(i - want) < Math.abs(drawn - want) || drawn === -1) draw(want, true);
          })
          .catch(() => undefined)
          .finally(resolve);
      });
    // first frame, then every 8th, every 2nd, the rest: the scrub works early and sharpens
    void (async () => {
      await load(0);
      const order: number[] = [];
      const seen = new Set([0]);
      for (const step of [8, 2, 1])
        for (let i = 0; i < FRAMES; i += step)
          if (!seen.has(i)) {
            seen.add(i);
            order.push(i);
          }
      await Promise.all(
        Array.from({ length: 4 }, async () => {
          while (order.length && !cancelled) await load(order.shift()!);
        }),
      );
    })();

    const update = () => {
      raf = 0;
      const rect = hero.getBoundingClientRect();
      const span = Math.max(1, rect.height - innerHeight);
      const p = Math.min(1, Math.max(0, -rect.top / span));
      want = Math.round(Math.min(1, p / 0.9) * (FRAMES - 1));
      draw(want);
      const dock = Math.min(1, Math.max(0, (p - 0.84) / 0.16));
      const line = LINES.reduce((at, l, i) => (want >= l.from ? i : at), 0);
      const next =
        `${line}|${want >= 30 && want < 150 ? 1 : 0}|${p < 0.88 ? 1 : 0}|` +
        `${p > 0.02 ? 1 : 0}|${p >= 0.84 ? 1 : 0}`;
      if (next !== state) {
        state = next;
        const [l, facts, ctas, scrolled, gone] = next.split("|");
        root.current?.setAttribute("data-line", gone === "1" ? "none" : l!);
        root.current?.toggleAttribute("data-facts", facts === "1");
        root.current?.toggleAttribute("data-ctas", ctas === "1");
        root.current?.toggleAttribute("data-scrolled", scrolled === "1");
      }
      if (stage.current) {
        stage.current.style.transform = `translate3d(0,${(-dock * 4).toFixed(2)}vh,0) scale(${(1 - dock * 0.38).toFixed(4)})`;
        stage.current.style.borderRadius = `${Math.round(dock * 28)}px`;
        stage.current.style.setProperty("--dock", dock.toFixed(2));
      }
      if (counter.current) {
        counter.current.textContent = `FRAME ${String(want + 1).padStart(3, "0")} / ${FRAMES}`;
      }
      if (bar.current) bar.current.style.transform = `scaleX(${p.toFixed(3)})`;
    };

    let raf = 0;
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    // only listen while the hero is on screen
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
    io.observe(hero);

    return () => {
      cancelled = true;
      io.disconnect();
      removeEventListener("scroll", onScroll);
      removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <section ref={section} className="lph bleed" aria-label="Action Tokens for organizations">
      <div ref={root} className="lph-stick" data-line="0">
        <div ref={stage} className="lph-stage">
          <canvas ref={canvas} width={1280} height={720} className="lph-frame" aria-hidden />
          <div className="lph-vignette" aria-hidden />
          <div className="lph-scan" aria-hidden />
          <div className="lph-dock" aria-hidden />
        </div>

        <p className="lph-kicker">
          <i aria-hidden /> Organization portal · live on Stellar
        </p>

        {LINES.map((line, index) => (
          <h1 key={line.top} className="lph-headline" data-i={index} aria-hidden={index > 0}>
            <span className="lph-chrome">{line.top}</span>
            <br />
            <em>{line.bottom}</em>
          </h1>
        ))}

        <div className="lph-facts">
          {FACTS.map(([big, small]) => (
            <div key={big} className="lph-fact">
              <b>{big}</b>
              <span>{small}</span>
            </div>
          ))}
        </div>

        <div className="lph-ctas">
          <button type="button" onClick={onSignIn} className="lph-btn lph-btn--neon">
            <LogIn className="size-4" strokeWidth={2.4} /> Sign in / Sign up
          </button>
          <button type="button" onClick={onSignIn} className="lph-btn lph-btn--chrome">
            Become an organization <ArrowRight className="size-4" />
          </button>
        </div>

        <div className="lph-progress" aria-hidden>
          <span ref={counter}>FRAME 001 / {FRAMES}</span>
          <div>
            <i ref={bar} />
          </div>
        </div>
        <div className="lph-hint" aria-hidden>
          SCROLL ↓
        </div>
      </div>
    </section>
  );
}
