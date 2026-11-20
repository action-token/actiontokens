import { motion, useReducedMotion } from "framer-motion";
import { Camera, Coins, MapPin, ScanLine, Sparkles, Star, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { BrandMark } from "~/components/brand/BrandMark";
import { BOOT_LINES } from "~/lib/ar/defaults";
import { site } from "@actiontokens/ar-core/site";

/**
 * ── BootSequence ───────────────────────────────────────────────────────────
 *
 * The first three seconds of the app, in the Street Sticker language
 * (docs/AR-STICKER-REDESIGN.md): stickers get slapped onto a dotted black wall,
 * one after another, then a chunky sticker bar charges up.
 *
 * It plays as an overlay above the live map, so the last beat is a reveal of
 * the map that has been mounting underneath.
 *
 * Beats:
 *   ignite    the halftone wall fades up
 *   assemble  the logo sticker, then ACTION and TOKENS stickers slap on
 *   stamp     the AR sticker slams onto the corner with a tape strip
 *   boot      status lines over the sticker progress bar
 *   open      the wall drops away onto the map
 *
 * Tap anywhere to skip. `prefers-reduced-motion` skips straight to done.
 */

/** "ActionTokens" → ["ACTION", "TOKENS"]: one sticker per word. */
const WORDS = (site.name.match(/[A-Z][a-z]*/g) ?? [site.name]).map((w) => w.toUpperCase());

/** Beat boundaries in ms from mount. */
const T = {
  assemble: 260,
  stamp: 1_180,
  boot: 1_480,
  open: 3_180,
  done: 3_760,
} as const;

/** Little icon stickers stuck around the wall; they fly in and keep bobbing. */
const ICONS: { I: LucideIcon; left: string; top: string; rotate: number; green: boolean; from: [number, number] }[] = [
  { I: MapPin, left: "10%", top: "16%", rotate: -12, green: true, from: [-160, -120] },
  { I: Star, left: "76%", top: "12%", rotate: 14, green: false, from: [160, -140] },
  { I: Camera, left: "80%", top: "36%", rotate: -8, green: true, from: [200, 0] },
  { I: Coins, left: "8%", top: "40%", rotate: 10, green: false, from: [-200, 20] },
  { I: Sparkles, left: "8%", top: "74%", rotate: -6, green: false, from: [-180, 140] },
  { I: ScanLine, left: "80%", top: "70%", rotate: 12, green: true, from: [180, 160] },
];

/** Where each letter starts before it lands: scattered across the wall. */
const scatter = (i: number) => ({
  x: [-120, 90, -60, 140, -150, 70, 110, -90][i % 8]!,
  y: [-160, 130, 170, -140, 90, -190, 150, -120][i % 8]!,
  rotate: [-50, 40, -28, 60, -36, 24, -44, 32][i % 8]!,
});

type Phase = "ignite" | "assemble" | "stamp" | "boot" | "open";

/** A sticker slapped on: lands big and tilted, then settles with a bounce. */
const slap = (on: boolean, rotate: number, delay = 0) => ({
  initial: { opacity: 0, scale: 2.4, rotate: rotate * 4 },
  animate: on ? { opacity: 1, scale: 1, rotate } : { opacity: 0, scale: 2.4, rotate: rotate * 4 },
  transition: { type: "spring" as const, stiffness: 520, damping: 22, mass: 0.8, delay },
});

export function BootSequence({ onDone }: { onDone: () => void }) {
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("ignite");
  const [lineIndex, setLineIndex] = useState(0);
  const finished = useRef(false);

  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onDone();
  }, [onDone]);

  useEffect(() => {
    if (reduceMotion) {
      finish();
      return;
    }
    const timers = [
      setTimeout(() => setPhase("assemble"), T.assemble),
      setTimeout(() => setPhase("stamp"), T.stamp),
      setTimeout(() => setPhase("boot"), T.boot),
      setTimeout(() => setPhase("open"), T.open),
      setTimeout(finish, T.done),
    ];
    return () => timers.forEach(clearTimeout);
  }, [reduceMotion, finish]);

  const perLine = (T.open - T.boot) / BOOT_LINES.length;

  useEffect(() => {
    if (phase !== "boot") return;
    const id = setInterval(() => {
      setLineIndex((i) => Math.min(i + 1, BOOT_LINES.length - 1));
    }, perLine);
    return () => clearInterval(id);
  }, [phase, perLine]);

  const started = phase !== "ignite";
  const stamped = phase === "stamp" || phase === "boot" || phase === "open";
  const booting = phase === "boot";
  const opening = phase === "open";

  if (reduceMotion) return null;

  return (
    <motion.div
      role="status"
      aria-label={`Loading ${site.name} AR`}
      onClick={finish}
      className="bg-ar-void absolute inset-0 z-[100] cursor-pointer overflow-hidden select-none"
      initial={{ opacity: 1 }}
      animate={opening ? { opacity: 0, y: 40, rotate: -2, scale: 1.04 } : { opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.7, 0, 0.28, 1] }}
    >
      {/* The wall: a dotted halftone, a touch stronger than the screens'. */}
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(hsl(var(--ar-accent)/0.12)_1px,transparent_1.4px)] [background-size:9px_9px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: started ? 1 : 0 }}
        transition={{ duration: 0.5 }}
      />

      {ICONS.map(({ I, left, top, rotate, green, from }, i) => (
        <motion.span
          key={i}
          aria-hidden
          className={
            "absolute flex size-11 items-center justify-center rounded-[12px] border-[3px] border-black text-black " +
            (green
              ? "bg-ar-accent shadow-[3px_3px_0_0_hsl(var(--st-paper))]"
              : "bg-[hsl(var(--st-paper))] shadow-[3px_3px_0_0_hsl(var(--ar-accent))]")
          }
          style={{ left, top }}
          initial={{ opacity: 0, x: from[0], y: from[1], rotate: rotate * 4, scale: 0.4 }}
          animate={
            started
              ? { opacity: 1, x: 0, y: [0, -7, 0], rotate, scale: 1 }
              : { opacity: 0, x: from[0], y: from[1], rotate: rotate * 4, scale: 0.4 }
          }
          transition={{
            default: { type: "spring", stiffness: 260, damping: 18, delay: 0.1 + i * 0.07 },
            y: { duration: 2.6 + i * 0.3, repeat: Infinity, ease: "easeInOut", delay: 0.8 },
          }}
        >
          <I className="size-5" strokeWidth={2.6} />
        </motion.span>
      ))}

      <div className="relative flex h-full flex-col items-center justify-center px-6">
        {/* Logo sticker */}
        <motion.div
          className="flex size-[92px] items-center justify-center rounded-full border-[3px] border-black bg-[hsl(var(--st-paper))] shadow-[5px_5px_0_0_hsl(var(--ar-accent))]"
          {...slap(started, -8)}
        >
          <BrandMark className="h-[58px] w-auto" />
        </motion.div>

        {/* Wordmark: one sticker per word */}
        <div className="relative mt-6 flex flex-col items-center">
          {WORDS.map((w, i) => (
            <motion.span
              key={w}
              className={
                "font-display relative border-[3px] border-black px-3 pt-1.5 pb-1 text-[32px] leading-none text-black " +
                (i % 2
                  ? "-mt-1 bg-[hsl(var(--st-paper))] shadow-[5px_5px_0_0_hsl(var(--ar-accent))]"
                  : "bg-ar-accent z-10 shadow-[5px_5px_0_0_hsl(var(--st-paper))]")
              }
              {...slap(started, i % 2 ? 2.5 : -3, 0.22 + i * 0.2)}
            >
              {w.split("").map((ch, j) => {
                const from = scatter(i * 6 + j);
                return (
                  <motion.span
                    key={j}
                    className="inline-block"
                    initial={{ opacity: 0, ...from, scale: 1.8 }}
                    animate={
                      started
                        ? { opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 }
                        : { opacity: 0, ...from, scale: 1.8 }
                    }
                    transition={{
                      type: "spring",
                      stiffness: 300,
                      damping: 19,
                      delay: 0.3 + i * 0.2 + j * 0.05,
                    }}
                  >
                    {ch}
                  </motion.span>
                );
              })}
            </motion.span>
          ))}

          {/* AR sticker, slammed onto the corner and taped down */}
          <motion.span
            className="font-display absolute -top-7 -right-10 z-20 flex size-[54px] items-center justify-center rounded-[16px] border-[3px] border-black bg-ar-accent text-[19px] text-black shadow-[3px_3px_0_0_#000]"
            {...slap(stamped, 10)}
          >
            <span className="st-tape -top-2.5 left-1/2 h-3.5 w-9 -translate-x-1/2 -rotate-6" />
            {site.wordmark.plate}
          </motion.span>
        </div>

        {/* Tagline tag */}
        <motion.span
          className="font-display mt-6 bg-black px-2.5 py-1 text-[11px] leading-none text-[hsl(var(--st-paper))] outline outline-2 outline-[hsl(var(--st-paper)/0.85)]"
          initial={{ opacity: 0, y: 10, rotate: 0 }}
          animate={booting || opening ? { opacity: 1, y: 0, rotate: -2 } : { opacity: 0, y: 10 }}
          transition={{ type: "spring", stiffness: 420, damping: 24 }}
        >
          COLLECT THE REAL WORLD
        </motion.span>

        {/* Sticker progress bar */}
        <motion.div
          className="absolute inset-x-0 bottom-[12%] flex flex-col items-center gap-2.5 px-10"
          initial={{ opacity: 0, y: 14 }}
          animate={booting ? { opacity: 1, y: 0 } : { opacity: 0, y: opening ? 0 : 14 }}
          transition={{ duration: 0.3 }}
        >
          <div className="relative h-[22px] w-full max-w-[260px] -rotate-1 overflow-hidden rounded-full border-[3px] border-black bg-[hsl(var(--st-paper))] shadow-[4px_4px_0_0_hsl(var(--ar-accent))]">
            <motion.div
              className="bg-ar-accent absolute inset-y-0 left-0 border-r-[3px] border-black"
              initial={{ width: "0%" }}
              animate={{ width: booting ? `${((lineIndex + 1) / BOOT_LINES.length) * 100}%` : "0%" }}
              transition={{ duration: perLine / 1000, ease: "linear" }}
            />
            {/* Stripes for the "charging" feel */}
            <div className="absolute inset-0 bg-[repeating-linear-gradient(-45deg,transparent_0_6px,rgba(0,0,0,0.12)_6px_10px)]" />
          </div>
          <p className="font-display text-ar-accent text-[11px] leading-none tracking-[0.02em] uppercase">
            {BOOT_LINES[lineIndex]}…
          </p>
        </motion.div>

        <motion.p
          className="font-display text-ar-faint absolute bottom-[5%] text-[9px] tracking-[0.08em] uppercase"
          initial={{ opacity: 0 }}
          animate={{ opacity: booting ? 0.8 : 0 }}
          transition={{ delay: 0.4, duration: 0.4 }}
        >
          Tap to skip
        </motion.p>
      </div>
    </motion.div>
  );
}
