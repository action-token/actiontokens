"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";

import { cn } from "../../lib/cn";
import { BrandMark } from "../boot-screen";
import { computeLayout, drawGuitar, type StageLayout } from "./guitar";
import { createStrings, drawStrings, pluck, STRING_COUNT } from "./strings";
import { createWave, drawWave, type Wave } from "./wave";

type Phase = "play" | "strum" | "open" | "gone";

const LETTERS = "BANDCOIN".split("");
const OPEN_DELAY = 650;
const CURTAIN_MS = 1050;

export interface StageLoaderProps {
  /** Real readiness, 0 to 1. The counter eases toward it. */
  progress: number;
  /** Fill the nearest positioned parent instead of the viewport (design preview). */
  contained?: boolean;
  /** Change to replay the loader. */
  replayKey?: number;
  /** The strum never comes sooner than this, so the show doesn't flash past. */
  minMs?: number;
  /** After this the loader finishes anyway, so a slow network never traps the user. */
  maxMs?: number;
  onDone?: () => void;
}

/**
 * The Bandcoin stage loader: a half guitar on the right edge, six strings that get plucked as the
 * app gets ready, the pick filling with colour, BANDCOIN filling letter by letter, a counter and a
 * track waveform. At 100% the strings are strummed and two stage curtains open onto the page.
 *
 * The page renders underneath and nothing waits on this. It plays on every full page load
 * (not on in-app navigation, since it lives in the root layout).
 */
export function StageLoader({
  progress,
  contained = false,
  replayKey = 0,
  minMs = 1800,
  maxMs = 6000,
  onDone,
}: StageLoaderProps) {
  const [phase, setPhase] = useState<Phase>("play");
  const [entered, setEntered] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const gtrRef = useRef<HTMLCanvasElement>(null);
  const strRef = useRef<HTMLCanvasElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);
  const wordRef = useRef<HTMLDivElement>(null);
  const waveRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef(progress);
  const onDoneRef = useRef(onDone);
  progressRef.current = progress;
  onDoneRef.current = onDone;

  // Keep the page from scrolling behind the loader.
  useEffect(() => {
    if (contained || phase === "gone") return;
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = before;
    };
  }, [contained, phase]);

  // The show: canvas guitar + strings, counter, wordmark, meter, then strum and curtains.
  useEffect(() => {
    const root = rootRef.current;
    const gtr = gtrRef.current?.getContext("2d");
    const str = strRef.current?.getContext("2d");
    if (!root || !gtr || !str) return;

    setPhase("play");
    setEntered(false);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const letters = Array.from(wordRef.current?.children ?? []) as HTMLElement[];
    const waveCtx = waveRef.current?.getContext("2d") ?? null;
    let wave: Wave | null = null;
    const strings = createStrings();
    const timers: number[] = [];
    let layout: StageLayout = computeLayout(1, 1, 1);
    let raf = 0;
    let stopped = false;

    const resize = () => {
      const w = contained ? root.clientWidth : window.innerWidth;
      const h = contained ? root.clientHeight : window.innerHeight;
      layout = computeLayout(w, h, Math.min(window.devicePixelRatio || 1, 2));
      for (const c of [gtr.canvas, str.canvas]) {
        c.width = w * layout.dpr;
        c.height = h * layout.dpr;
      }
      drawGuitar(gtr, layout);
      wave = waveRef.current ? createWave(waveRef.current, layout.dpr) : null;
    };
    resize();
    window.addEventListener("resize", resize);

    const start = performance.now();
    let shown = 0;
    let lastStep = -1;
    let finished = false;

    const tick = (now: number) => {
      if (stopped) return;
      const elapsed = now - start;
      const target = elapsed > maxMs ? 1 : Math.max(0, Math.min(1, progressRef.current));
      shown += (target - shown) * 0.08;
      if (target >= 1 && shown > 0.995) shown = 1;
      root.style.setProperty("--p", shown.toFixed(3));
      if (pctRef.current) pctRef.current.textContent = String(Math.floor(shown * 100)).padStart(2, "0");

      // one string per sixth of progress
      const step = Math.min(STRING_COUNT - 1, Math.floor(shown * STRING_COUNT));
      for (let i = lastStep + 1; i <= step; i++) pluck(strings[i]!, layout, now, 0.8);
      lastStep = Math.max(lastStep, step);

      letters.forEach((el, i) => el.classList.toggle("on", shown >= (i + 1) / (LETTERS.length + 1)));

      // track waveform: played up to the progress, playhead on top
      if (wave && waveCtx) drawWave(waveCtx, wave, shown, now);

      drawStrings(str, strings, layout, now, shown);

      if (!finished && shown >= 1 && elapsed > (reduced ? 0 : minMs)) {
        finished = true;
        setPhase("strum");
        strings.forEach((s, i) => timers.push(window.setTimeout(() => pluck(s, layout, performance.now(), 1.25), i * 40)));
        timers.push(window.setTimeout(() => setPhase("open"), reduced ? 0 : OPEN_DELAY));
        timers.push(
          window.setTimeout(
            () => {
              stopped = true;
              setPhase("gone");
              onDoneRef.current?.();
            },
            reduced ? 50 : OPEN_DELAY + CURTAIN_MS,
          ),
        );
      }
      raf = requestAnimationFrame(tick);
    };

    const go = () => {
      setEntered(true);
      raf = requestAnimationFrame(tick);
    };
    // Wait for the display font so the wordmark doesn't jump; never longer than a moment.
    void Promise.race([
      document.fonts.load('600 100px "Teko Variable"', "BANDCOIN"),
      new Promise((r) => setTimeout(r, 400)),
    ])
      .catch(() => undefined)
      .then(() => {
        if (!stopped) requestAnimationFrame(go);
      });

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      window.removeEventListener("resize", resize);
    };
  }, [contained, replayKey, minMs, maxMs]);

  if (phase === "gone") return null;

  return (
    <div
      ref={rootRef}
      role="status"
      aria-label="Loading Bandcoin"
      className={cn(
        "stage-loader",
        contained && "stage-loader--contained",
        entered && "is-in",
        (phase === "strum" || phase === "open") && "is-strum",
        phase === "open" && "is-open",
      )}
    >
      <div className="sl-curtain sl-curtain--l" />
      <div className="sl-curtain sl-curtain--r" />
      <div className="sl-stage">
        <canvas ref={gtrRef} className="sl-gtr" />
        <canvas ref={strRef} className="sl-strings" />
        <div className="sl-pick" aria-hidden>
          <BrandMark className="sl-pick-dim h-full w-full" />
          <BrandMark className="sl-pick-lit h-full w-full" />
        </div>
        <div ref={wordRef} className="sl-word" aria-hidden>
          {LETTERS.map((c, i) => (
            <span key={i} style={{ "--i": i } as CSSProperties}>
              {c}
            </span>
          ))}
        </div>
        <div className="sl-bottom" aria-hidden>
          <div className="sl-pct">
            <span ref={pctRef}>00</span>
            <small>%</small>
          </div>
          <canvas ref={waveRef} className="sl-wave" />
        </div>
      </div>
    </div>
  );
}
