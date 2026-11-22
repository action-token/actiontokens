"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

const FRAMES = 175;
const src = (i: number) => `/landing/frames/f${String(i + 1).padStart(3, "0")}.jpg`;

/** A headline the hero swaps to as the frames play: `from` is the first frame it shows on. */
export type HeroLine = { from: number; top: string; bottom: string };

/**
 * A front page's opening, after docs/mockups/home.html: a tall section whose sticky,
 * full-screen stage plays 175 frames as you scroll (the hand and the Action mark), with three
 * headlines swapping over it, the facts rail and the buttons; at the end the stage docks into a
 * glowing card. Kept light on the GPU: a frame is drawn only when the scroll position changes
 * (one requestAnimationFrame per scroll, none at rest), scroll is only watched while the hero is
 * on screen, and the dock moves with transform and opacity only. No particles, no tilt, no blur.
 */
export function ScrollHero({
  lines,
  facts,
  kicker,
  ctas,
  label,
}: {
  /** Up to three headlines, first frame first (shown from frame 0) */
  lines: HeroLine[];
  /** The rail of small facts: [big, small] */
  facts: [string, string][];
  kicker: ReactNode;
  /** The buttons (use .lph-btn with --neon or --chrome) */
  ctas: ReactNode;
  /** The section's accessible name */
  label: string;
}) {
  const linesRef = useRef(lines);
  const section = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);

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
      const line = linesRef.current.reduce((at, l, i) => (want >= l.from ? i : at), 0);
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
    <section ref={section} className="lph bleed" aria-label={label}>
      <div ref={root} className="lph-stick" data-line="0">
        <div ref={stage} className="lph-stage">
          <canvas ref={canvas} width={1280} height={720} className="lph-frame" aria-hidden />
          <div className="lph-vignette" aria-hidden />
          <div className="lph-scan" aria-hidden />
          <div className="lph-dock" aria-hidden />
        </div>

        <p className="lph-kicker">
          <i aria-hidden /> {kicker}
        </p>

        {lines.map((line, index) => (
          <h1 key={line.top} className="lph-headline" data-i={index} aria-hidden={index > 0}>
            <span className="lph-chrome">{line.top}</span>
            <br />
            <em>{line.bottom}</em>
          </h1>
        ))}

        <div className="lph-facts">
          {facts.map(([big, small]) => (
            <div key={big} className="lph-fact">
              <b>{big}</b>
              <span>{small}</span>
            </div>
          ))}
        </div>

        <div className="lph-ctas">{ctas}</div>

        <div className="lph-hint" aria-hidden>
          SCROLL ↓
        </div>
      </div>
    </section>
  );
}
