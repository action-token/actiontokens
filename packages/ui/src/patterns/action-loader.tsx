"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "../lib/cn";
import { BrandMark } from "./boot-screen";

type Phase = "play" | "leave" | "gone";

/**
 * The words scattered over the stage: [text, left %, top %, size (vw), turn (deg), look].
 * Looks: o = chrome outline, n = neon, g = gothic, m = small mono, f = faint solid. Fixed, so the
 * server and the browser draw the same thing; the middle is left clear for the mark and title.
 */
const SCATTER: [string, number, number, number, number, "o" | "n" | "g" | "m" | "f"][] = [
  ["Drops", 4, 6, 9, -6, "o"],
  ["$ACTION", 62, 4, 5, 4, "n"],
  ["Wanted", 34, 9, 4.2, -3, "g"],
  ["Live bounties", 80, 14, 1, 0, "m"],
  ["Escrow", 84, 24, 6, 8, "f"],
  ["Prove it.", 2, 30, 5.5, -10, "f"],
  ["Claim pins IRL", 6, 46, 1, 0, "m"],
  ["Own it.", 78, 40, 6.5, 6, "o"],
  ["AR", 90, 54, 9, -4, "n"],
  ["Fan tokens", 3, 58, 4.4, 5, "g"],
  ["#001 / 250", 70, 62, 1, 0, "m"],
  ["Bounties", 58, 74, 8, -5, "o"],
  ["Collect", 2, 72, 6, 3, "n"],
  ["Crews", 24, 74, 4.8, -8, "g"],
  ["XLM · USDC", 86, 80, 1, 0, "m"],
  ["Take action.", 72, 88, 4.2, 4, "f"],
  ["Limited", 10, 88, 3.4, -2, "o"],
  ["Touch grass", 40, 2, 1, 0, "m"],
  ["Earn", 22, 20, 5, 9, "n"],
  ["Stellar", 44, 94, 3, 0, "g"],
];

/** The ribbon's words, repeated so it can loop. */
const RIBBON = [
  "New drops",
  "Live bounties",
  "Prizes in escrow",
  "Claim pins IRL",
  "Fan tokens",
  "ACTION on Stellar",
];

/** The words under the bar, one after another as the page comes in. */
const STEPS = ["Booting", "Loading drops", "Loading bounties", "Checking the chain", "Ready"];

/**
 * The Action-Tokens loading screen, in the organization portal's hero style: a black stage with
 * scan lines, the mark glowing neon, a chrome ACTION-TOKENS title and a neon bar with the real
 * percentage. `progress` (0 to 1) is the page's actual readiness; the bar eases toward it, never
 * runs ahead of it, and fills anyway after `maxMs`. Once full (and shown for at least `minMs`) the
 * stage slides up and is gone. Transform and opacity only; the bar is a scaleX.
 */
export function ActionLoader({
  progress,
  minMs = 1200,
  maxMs = 6000,
  contained = false,
  className,
  onDone,
}: {
  progress: number;
  minMs?: number;
  maxMs?: number;
  /** Fill the parent instead of the screen (design preview) */
  contained?: boolean;
  /** The app's font variables (Anton as --lp-display) */
  className?: string;
  onDone?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("play");
  const barRef = useRef<HTMLDivElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);
  const [step, setStep] = useState(0);
  const progressRef = useRef(progress);
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    progressRef.current = progress;
    onDoneRef.current = onDone;
  });

  // keep the page from scrolling behind the stage
  useEffect(() => {
    if (contained || phase === "gone") return;
    const html = document.documentElement;
    const before = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = before;
    };
  }, [contained, phase]);

  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    let shown = 0;
    let raf = 0;
    let lastStep = -1;
    const timers: number[] = [];
    const frame = (now: number) => {
      const elapsed = now - start;
      const target = elapsed > maxMs ? 1 : Math.max(0, Math.min(1, progressRef.current));
      // ease toward the real value; a slow creep keeps it alive while one signal is pending
      shown += (target - shown) * (reduced ? 1 : 0.08);
      if (target - shown < 0.002) shown = target;
      barRef.current?.style.setProperty("transform", `scaleX(${shown.toFixed(4)})`);
      if (pctRef.current) pctRef.current.textContent = String(Math.round(shown * 100));
      const nextStep = Math.min(STEPS.length - 1, Math.floor(shown * (STEPS.length - 1) + 0.001));
      if (nextStep !== lastStep) {
        lastStep = nextStep;
        setStep(nextStep);
      }
      if (shown >= 1 && elapsed > (reduced ? 0 : minMs)) {
        setPhase("leave");
        timers.push(
          window.setTimeout(
            () => {
              setPhase("gone");
              onDoneRef.current?.();
            },
            reduced ? 0 : 650,
          ),
        );
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [minMs, maxMs]);

  if (phase === "gone") return null;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading Action Tokens"
      className={cn("at-loader", contained && "at-loader--contained", className)}
      data-phase={phase}
    >
      <div className="at-loader-words" aria-hidden>
        {SCATTER.map(([text, left, top, size, turn, look], index) => (
          <span
            key={text}
            data-look={look}
            style={{
              left: `${left}%`,
              top: `${top}%`,
              fontSize:
                look === "m"
                  ? undefined
                  : `clamp(${Math.round(size * 5)}px, ${size}vw, ${Math.round(size * 18)}px)`,
              rotate: `${turn}deg`,
              animationDelay: `${(index % 10) * 0.12}s, ${(index % 7) * -1.3}s`,
            }}
          >
            {text}
          </span>
        ))}
      </div>
      <div className="at-loader-ribbon" aria-hidden>
        <div className="at-loader-ribbon-track">
          {[...RIBBON, ...RIBBON, ...RIBBON, ...RIBBON].map((word, index) => (
            <span key={index}>{word}</span>
          ))}
        </div>
      </div>
      <div className="at-loader-scan" aria-hidden />
      <div className="at-loader-glow" aria-hidden />
      <div className="at-loader-core">
        <span className="at-loader-mark" aria-hidden>
          <BrandMark className="h-12" />
        </span>
        <p className="at-loader-title">Action-Tokens</p>
        <p className="at-loader-kicker">
          <i aria-hidden /> Live on Stellar
        </p>
      </div>
      <div className="at-loader-foot">
        <div className="at-loader-track" aria-hidden>
          <div ref={barRef} className="at-loader-bar" />
        </div>
        <div className="at-loader-meta">
          <span>{STEPS[step]}</span>
          <span>
            <span ref={pctRef}>0</span>%
          </span>
        </div>
      </div>
    </div>
  );
}
