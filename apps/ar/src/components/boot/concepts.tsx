"use client";

import { Camera, Coins, MapPin, Sparkles, Star, type LucideIcon } from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { BrandMark } from "~/components/brand/BrandMark";
import { BOOT_LINES } from "~/lib/ar/defaults";

/**
 * Boot screen concepts in the Street Sticker language, each a pure function of the time
 * since the boot started (`t`, ms). Shown side by side on /review/boot; the chosen one
 * becomes BootSequence. Each runs for BOOT_MS and plays its own exit in the last beat.
 */

export const BOOT_MS = 3_700;
const EXIT = 3_150;

// ── time helpers ─────────────────────────────────────────────────────────────
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
/** 0→1 progress of `t` through [start, start + dur]. */
const seg = (t: number, start: number, dur: number) => clamp((t - start) / dur);
const outCubic = (p: number) => 1 - (1 - p) ** 3;
const inCubic = (p: number) => p ** 3;
/** Overshoots then settles: a sticker slapping down. */
const outBack = (p: number) => {
  const c = 1.9;
  return 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2;
};
const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

/** Loading progress 0..1 between `from` and EXIT. */
const loadP = (t: number, from: number) => outCubic(seg(t, from, EXIT - from - 150));
const statusLine = (p: number) => BOOT_LINES[Math.min(BOOT_LINES.length - 1, Math.floor(p * BOOT_LINES.length))];
const pct3 = (p: number) => String(Math.round(p * 100)).padStart(3, "0");

/** A requestAnimationFrame clock. `loop` restarts it after BOOT_MS + a pause (review page). */
export function useBootClock(loop = false) {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf = 0;
    let start = performance.now();
    const tick = (now: number) => {
      let e = now - start;
      if (loop && e > BOOT_MS + 900) {
        start = now;
        e = 0;
      }
      setT(e);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [loop]);
  return t;
}

const INK = "hsl(var(--st-ink))";
const PAPER = "hsl(var(--st-paper))";
const GREEN = "hsl(var(--ar-accent))";

function Wall({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="bg-ar-void absolute inset-0 overflow-hidden select-none" style={style}>
      <div className="absolute inset-0 bg-[radial-gradient(hsl(var(--ar-accent)/0.1)_1px,transparent_1.4px)] [background-size:9px_9px]" />
      {children}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 1 · Caution Tape: two tape bands cross the screen with the name running along
//     them, the logo slaps on where they cross, a giant percentage counts up.
// ═════════════════════════════════════════════════════════════════════════════

function TapeBand({ t, rotate, top, delay, green, dir }: { t: number; rotate: number; top: string; delay: number; green: boolean; dir: 1 | -1 }) {
  const inP = outCubic(seg(t, delay, 420));
  const outP = inCubic(seg(t, EXIT + 60, 420));
  const x = lerp(-130 * dir, 0, inP) + 130 * dir * outP;
  const run = (t * 0.06 * dir) % 260;
  const text = "ACTIONTOKENS ★ AR ★ ";
  return (
    <div
      className="absolute left-[-30%] w-[160%] border-y-[3px] border-black py-1.5"
      style={{
        top,
        background: green ? GREEN : PAPER,
        transform: `translateX(${x}%) rotate(${rotate}deg)`,
        boxShadow: `0 5px 0 0 ${green ? PAPER : GREEN}`,
      }}
    >
      <div className="font-display text-[20px] leading-none whitespace-nowrap text-black" style={{ transform: `translateX(${run - 260}px)` }}>
        {text.repeat(8)}
      </div>
    </div>
  );
}

export function BootTape({ t }: { t: number }) {
  const logo = outBack(seg(t, 620, 380));
  const p = loadP(t, 800);
  const outP = seg(t, EXIT, 450);
  return (
    <Wall style={{ opacity: 1 - outP }}>
      <TapeBand t={t} rotate={-11} top="34%" delay={0} green dir={1} />
      <TapeBand t={t} rotate={8} top="47%" delay={180} green={false} dir={-1} />

      <div
        className="absolute top-[41%] left-1/2 flex size-[96px] items-center justify-center rounded-full border-[3px] border-black"
        style={{
          background: PAPER,
          boxShadow: `5px 5px 0 0 ${INK}`,
          opacity: logo > 0 ? 1 : 0,
          transform: `translate(-50%, -50%) scale(${lerp(2.4, 1, logo) * (1 - outP * 0.4)}) rotate(${lerp(-40, -8, logo)}deg)`,
        }}
      >
        <BrandMark className="h-[60px] w-auto" />
      </div>

      <div className="absolute inset-x-5 bottom-[9%]" style={{ opacity: seg(t, 800, 250) }}>
        <p className="font-display text-[10px] tracking-[0.06em] text-[hsl(var(--ar-accent))]">{statusLine(p)}…</p>
        <div className="mt-1 flex items-end justify-between">
          <span className="font-display text-[64px] leading-[0.85] text-[hsl(var(--st-paper))]">
            {pct3(p)}
          </span>
          <span className="font-display mb-1 -rotate-6 border-[3px] border-black bg-[hsl(var(--ar-accent))] px-2 py-1 text-[16px] text-black shadow-[3px_3px_0_0_#f2f7f2]">
            %
          </span>
        </div>
        <div className="mt-3 h-[6px] w-full bg-white/10">
          <div className="h-full" style={{ width: `${p * 100}%`, background: GREEN }} />
        </div>
      </div>
    </Wall>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 2 · Poster Peel: the whole screen is a green poster with the name stacked big;
//     it peels off from the corner onto the map.
// ═════════════════════════════════════════════════════════════════════════════

function Rise({ t, at, children, className }: { t: number; at: number; children: ReactNode; className?: string }) {
  const p = outCubic(seg(t, at, 420));
  return (
    <div className="overflow-hidden">
      <div className={className} style={{ transform: `translateY(${lerp(105, 0, p)}%)` }}>
        {children}
      </div>
    </div>
  );
}

export function BootPoster({ t }: { t: number }) {
  const p = loadP(t, 900);
  const peel = inCubic(seg(t, EXIT, 520));
  const ar = outBack(seg(t, 900, 340));
  return (
    <div className="bg-ar-void absolute inset-0 overflow-hidden select-none">
      <div
        className="absolute inset-0 flex flex-col px-5 pt-14 pb-8 text-black"
        style={{
          background: GREEN,
          transformOrigin: "100% 100%",
          transform: `translate(${-peel * 40}%, ${-peel * 120}%) rotate(${-peel * 28}deg)`,
          boxShadow: peel > 0 ? `-10px 14px 0 0 ${PAPER}` : undefined,
        }}
      >
        <div className="font-display flex justify-between text-[10px]" style={{ opacity: seg(t, 0, 300) }}>
          <span>N°001</span>
          <span>STREET DROPS</span>
        </div>
        <div className="mt-2 h-[3px] w-full bg-black" style={{ transform: `scaleX(${outCubic(seg(t, 80, 500))})`, transformOrigin: "0 0" }} />

        <div className="mt-auto">
          <div
            className="mb-3 flex size-[64px] items-center justify-center rounded-full border-[3px] border-black"
            style={{ background: PAPER, transform: `scale(${outBack(seg(t, 150, 380))}) rotate(-8deg)` }}
          >
            <BrandMark className="h-[40px] w-auto" />
          </div>
          <Rise t={t} at={260} className="font-display text-[46px] leading-[0.92]">ACTION</Rise>
          <Rise t={t} at={400} className="font-display text-[46px] leading-[0.92]">TOKENS</Rise>
          <div className="mt-2 flex items-center gap-2">
            <span
              className="font-display inline-flex h-[42px] items-center rounded-[12px] bg-black px-3 text-[24px] text-[hsl(var(--ar-accent))]"
              style={{ transform: `scale(${lerp(2.6, 1, ar)}) rotate(${lerp(-30, -6, ar)}deg)`, opacity: ar > 0 ? 1 : 0, boxShadow: `3px 3px 0 0 ${PAPER}` }}
            >
              AR
            </span>
            <Rise t={t} at={560} className="font-display text-[12px] leading-tight">
              COLLECT THE
              <br />
              REAL WORLD
            </Rise>
          </div>
        </div>

        <div className="mt-8" style={{ opacity: seg(t, 900, 250) }}>
          <div className="font-display flex justify-between text-[10px]">
            <span>{statusLine(p)}</span>
            <span>{pct3(p)}%</span>
          </div>
          <div className="mt-1.5 h-[14px] w-full border-[3px] border-black bg-[hsl(var(--st-paper))]">
            <div className="h-full bg-black" style={{ width: `${p * 100}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 3 · Drop Stack: collectible stickers fall one by one into a messy pile; each one
//     that lands is a loading step.
// ═════════════════════════════════════════════════════════════════════════════

const DROPS: { I: LucideIcon; color: string; rotate: number; x: number; y: number }[] = [
  { I: MapPin, color: "hsl(var(--rarity-common, 120 6% 62%))", rotate: -14, x: -26, y: 12 },
  { I: Star, color: "hsl(var(--rarity-rare, 199 92% 60%))", rotate: 10, x: 24, y: 6 },
  { I: Coins, color: "hsl(var(--rarity-epic, 271 91% 75%))", rotate: -5, x: -10, y: -6 },
  { I: Camera, color: "hsl(var(--rarity-legendary, 43 96% 56%))", rotate: 16, x: 18, y: -14 },
  { I: Sparkles, color: GREEN, rotate: -3, x: 0, y: -22 },
];
const DROP_EVERY = 420;
const DROP_FROM = 250;

export function BootStack({ t }: { t: number }) {
  const outP = seg(t, EXIT, 450);
  const landed = DROPS.filter((_, i) => t > DROP_FROM + i * DROP_EVERY + 300).length;
  const title = outBack(seg(t, 2_400, 380));
  return (
    <Wall>
      <div className="absolute top-[40%] left-1/2 size-0">
        {DROPS.map(({ I, color, rotate, x, y }, i) => {
          const p = outBack(seg(t, DROP_FROM + i * DROP_EVERY, 380));
          const fly = outCubic(outP);
          const dirX = x === 0 ? (i % 2 ? 1 : -1) : Math.sign(x);
          return (
            <div
              key={i}
              className="absolute flex h-[118px] w-[92px] flex-col items-center justify-center gap-2 rounded-[10px] border-[3px] border-black"
              style={{
                background: PAPER,
                boxShadow: `4px 4px 0 0 ${INK}`,
                opacity: p > 0 ? 1 - fly : 0,
                transform: `translate(calc(-50% + ${x + dirX * fly * 260}px), calc(-50% + ${lerp(-420, y, p) - fly * 120}px)) rotate(${lerp(rotate * 3, rotate, p) + fly * dirX * 60}deg) scale(${lerp(1.3, 1, p)})`,
              }}
            >
              <span className="flex size-12 items-center justify-center rounded-full border-[3px] border-black" style={{ background: color }}>
                <I className="size-6 text-black" strokeWidth={2.6} />
              </span>
              <span className="h-[5px] w-12 rounded-full bg-black/80" />
              <span className="h-[5px] w-8 rounded-full bg-black/30" />
            </div>
          );
        })}
      </div>

      <div className="absolute inset-x-0 top-[62%] flex flex-col items-center" style={{ opacity: 1 - outP }}>
        <div className="flex items-center gap-1.5" style={{ transform: `scale(${title})` }}>
          <span className="font-display -rotate-3 border-[3px] border-black bg-[hsl(var(--ar-accent))] px-2 py-1 text-[17px] leading-none text-black shadow-[3px_3px_0_0_#f2f7f2]">
            ACTION
          </span>
          <span className="font-display rotate-2 border-[3px] border-black bg-[hsl(var(--st-paper))] px-2 py-1 text-[17px] leading-none text-black shadow-[3px_3px_0_0_hsl(var(--ar-accent))]">
            TOKENS
          </span>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-[9%] flex flex-col items-center gap-2.5" style={{ opacity: 1 - outP }}>
        <div className="flex gap-1.5">
          {DROPS.map((_, i) => (
            <span
              key={i}
              className="size-3.5 rounded-[3px] border-2 border-black"
              style={{ background: i < landed ? GREEN : "hsl(var(--st-paper) / 0.15)", transform: `rotate(${i % 2 ? 8 : -8}deg)` }}
            />
          ))}
        </div>
        <p className="font-display text-[11px] text-[hsl(var(--ar-accent))]">
          {BOOT_LINES[Math.max(0, landed - 1)]}…
        </p>
      </div>
    </Wall>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// 4 · Lock On: AR viewfinder corners close in from the screen edges onto the logo,
//     a scan line sweeps, LOCKED stamps on, then the corners blow open onto the map.
// ═════════════════════════════════════════════════════════════════════════════

function Corner({ pos, size, color }: { pos: "tl" | "tr" | "bl" | "br"; size: number; color: string }) {
  const s: CSSProperties = { width: size, height: size, borderColor: color, position: "absolute" };
  const b = "5px";
  if (pos === "tl") Object.assign(s, { left: 0, top: 0, borderLeftWidth: b, borderTopWidth: b, borderTopLeftRadius: 14 });
  if (pos === "tr") Object.assign(s, { right: 0, top: 0, borderRightWidth: b, borderTopWidth: b, borderTopRightRadius: 14 });
  if (pos === "bl") Object.assign(s, { left: 0, bottom: 0, borderLeftWidth: b, borderBottomWidth: b, borderBottomLeftRadius: 14 });
  if (pos === "br") Object.assign(s, { right: 0, bottom: 0, borderRightWidth: b, borderBottomWidth: b, borderBottomRightRadius: 14 });
  return <span style={s} />;
}

export function BootLock({ t }: { t: number }) {
  const close = outCubic(seg(t, 100, 1_500));
  const locked = t > 1_700;
  const open = inCubic(seg(t, EXIT, 500));
  // Box: from (nearly) full screen down to a 150px square, then blowing open.
  const box = lerp(92, 46, close) + open * 90; // % of the shorter side, roughly
  const p = loadP(t, 300);
  const scanY = ((t % 1_200) / 1_200) * 100;
  const stamp = outBack(seg(t, 1_700, 320));
  const logo = outBack(seg(t, 300, 420));
  return (
    <Wall style={{ opacity: 1 - open }}>
      <div
        className="absolute top-[42%] left-1/2 aspect-square"
        style={{ width: `${box}%`, transform: "translate(-50%, -50%)" }}
      >
        {(["tl", "tr", "bl", "br"] as const).map((c) => (
          <Corner key={c} pos={c} size={40} color={locked ? GREEN : PAPER} />
        ))}
        {!locked && (
          <span className="absolute inset-x-3 h-[3px]" style={{ top: `${scanY}%`, background: GREEN, boxShadow: `0 0 0 1px ${INK}` }} />
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="flex size-[86px] items-center justify-center rounded-full border-[3px] border-black"
            style={{ background: PAPER, boxShadow: `4px 4px 0 0 ${GREEN}`, transform: `scale(${logo}) rotate(-6deg)` }}
          >
            <BrandMark className="h-[54px] w-auto" />
          </div>
        </div>
        <span
          className="font-display absolute -right-4 -bottom-3 border-[3px] border-black bg-[hsl(var(--ar-accent))] px-2 py-1 text-[14px] leading-none text-black"
          style={{ opacity: stamp > 0 ? 1 : 0, transform: `scale(${lerp(2.5, 1, stamp)}) rotate(${lerp(-30, -8, stamp)}deg)`, boxShadow: `3px 3px 0 0 ${PAPER}` }}
        >
          LOCKED
        </span>
      </div>

      <div className="absolute inset-x-0 top-[68%] flex flex-col items-center gap-2">
        <span className="font-display text-[24px] leading-none text-[hsl(var(--st-paper))]" style={{ opacity: seg(t, 500, 300) }}>
          ACTIONTOKENS
        </span>
        <span className="font-display bg-black px-2 py-1 text-[10px] text-[hsl(var(--ar-accent))] outline-2 outline-[hsl(var(--ar-accent))]" style={{ opacity: seg(t, 650, 300) }}>
          AR · COLLECT THE REAL WORLD
        </span>
      </div>

      <div className="font-display absolute inset-x-5 bottom-[8%] flex justify-between text-[10px] text-[hsl(var(--st-paper)/0.7)]">
        <span>{locked ? statusLine(p) : "SCANNING"}…</span>
        <span className="text-[hsl(var(--ar-accent))]">{pct3(p)}%</span>
      </div>
    </Wall>
  );
}

export const BOOT_CONCEPTS = [
  { id: "1+2", name: "Poster Tape (picked)", idea: "The green poster from 2 with the crossing tape bands, logo slap and giant counter from 1. Peels off onto the map.", C: BootPosterTape },
  { id: "1", name: "Caution Tape", idea: "Two tape bands with the name running along them cross the screen, the logo slaps on, a giant counter runs to 100.", C: BootTape },
  { id: "2", name: "Poster Peel", idea: "A full green street poster with the name stacked big. When loaded it peels off the corner onto the map.", C: BootPoster },
  { id: "3", name: "Drop Stack", idea: "Collectible stickers fall into a messy pile, one per loading step, then scatter away.", C: BootStack },
  { id: "4", name: "Lock On", idea: "AR viewfinder corners close in on the logo with a scan line, LOCKED stamps on, then they blow open.", C: BootLock },
] as const;

// ═════════════════════════════════════════════════════════════════════════════
// 1 + 2 · Poster Tape (the owner's pick, 2026-11-20): the green street poster with
//     two tape bands crossing it, the logo slapped where they cross, the name
//     stacked big, a giant counter, and the poster peeling off onto the map.
// ═════════════════════════════════════════════════════════════════════════════

function PosterBand({ t, rotate, top, delay, ink, dir }: { t: number; rotate: number; top: string; delay: number; ink: boolean; dir: 1 | -1 }) {
  const inP = outCubic(seg(t, delay, 420));
  const x = lerp(-130 * dir, 0, inP);
  const run = (t * 0.06 * dir) % 260;
  return (
    <div
      className="absolute left-[-30%] w-[160%] border-y-[3px] border-black py-1.5"
      style={{
        top,
        background: ink ? INK : PAPER,
        transform: `translateX(${x}%) rotate(${rotate}deg)`,
        boxShadow: `0 5px 0 0 ${ink ? PAPER : INK}`,
      }}
    >
      <div
        className="font-display text-[28px] leading-[0.9] pt-1 whitespace-nowrap"
        style={{ color: ink ? GREEN : INK, transform: `translateX(${run - 260}px)` }}
      >
        {"ACTIONTOKENS ★ AR ★ ".repeat(8)}
      </div>
    </div>
  );
}

export function BootPosterTape({ t }: { t: number }) {
  const p = loadP(t, 700);
  const peel = inCubic(seg(t, EXIT, 520));
  const logo = outBack(seg(t, 560, 380));
  const ar = outBack(seg(t, 1_000, 340));
  return (
    <div className="bg-ar-void absolute inset-0 overflow-hidden select-none">
      <div
        className="absolute inset-0 overflow-hidden text-black"
        style={{
          background: GREEN,
          transformOrigin: "100% 100%",
          transform: `translate(${-peel * 40}%, ${-peel * 120}%) rotate(${-peel * 28}deg)`,
          boxShadow: peel > 0 ? `-10px 14px 0 0 ${PAPER}` : undefined,
        }}
      >
        {/* Halftone in ink, like a printed poster */}
        <div className="absolute inset-0 bg-[radial-gradient(rgba(0,0,0,0.09)_1px,transparent_1.4px)] [background-size:9px_9px]" />

        <PosterBand t={t} rotate={-11} top="27%" delay={120} ink dir={1} />
        <PosterBand t={t} rotate={8} top="38%" delay={300} ink={false} dir={-1} />
        <div
          className="absolute top-[35%] left-1/2 flex size-[92px] items-center justify-center rounded-full border-[3px] border-black"
          style={{
            background: PAPER,
            boxShadow: `5px 5px 0 0 ${INK}`,
            opacity: logo > 0 ? 1 : 0,
            transform: `translate(-50%, -50%) scale(${lerp(2.4, 1, logo)}) rotate(${lerp(-40, -8, logo)}deg)`,
          }}
        >
          <BrandMark className="h-[58px] w-auto" />
        </div>

        <div className="relative flex h-full flex-col px-5 pt-14 pb-8">
          <div className="font-display flex justify-between text-[16px] tracking-[0.04em]" style={{ opacity: seg(t, 0, 300) }}>
            <span>N°001</span>
            <span>STREET DROPS</span>
          </div>
          <div
            className="mt-2 h-[3px] w-full bg-black"
            style={{ transform: `scaleX(${outCubic(seg(t, 80, 500))})`, transformOrigin: "0 0" }}
          />

          <div className="mt-auto">
            <Rise t={t} at={420} className="font-display text-[92px] leading-[0.78]">ACTION</Rise>
            <Rise t={t} at={560} className="font-display text-[92px] leading-[0.78]">TOKENS</Rise>
            <div className="mt-2 flex items-center gap-2">
              <span
                className="font-display inline-flex h-[44px] items-center rounded-[12px] bg-black px-3 pt-1 text-[34px] text-[hsl(var(--ar-accent))]"
                style={{
                  transform: `scale(${lerp(2.6, 1, ar)}) rotate(${lerp(-30, -6, ar)}deg)`,
                  opacity: ar > 0 ? 1 : 0,
                  boxShadow: `3px 3px 0 0 ${PAPER}`,
                }}
              >
                AR
              </span>
              <Rise t={t} at={700} className="font-display text-[17px] leading-[0.9] tracking-[0.03em]">
                COLLECT THE
                <br />
                REAL WORLD
              </Rise>
            </div>
          </div>

          <div className="mt-5" style={{ opacity: seg(t, 700, 250) }}>
            <div className="flex items-end justify-between gap-3">
              <p className="font-display mb-2 min-w-0 text-[16px] leading-[0.95] tracking-[0.03em]">{statusLine(p)}…</p>
              <div className="flex shrink-0 items-start gap-1">
                <span className="font-display text-[96px] leading-[0.75]">{pct3(p)}</span>
                <span className="font-display rotate-6 border-[3px] border-black bg-[hsl(var(--st-paper))] px-1.5 pt-1 text-[22px] leading-none shadow-[2px_2px_0_0_#000]">
                  %
                </span>
              </div>
            </div>
            <div className="mt-2 h-[14px] w-full border-[3px] border-black bg-[hsl(var(--st-paper))]">
              <div className="h-full bg-black" style={{ width: `${p * 100}%` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
