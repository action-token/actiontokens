import {
  Anton,
  Archivo,
  Archivo_Black,
  Bowlby_One,
  Dela_Gothic_One,
  Manrope,
  Onest,
  Permanent_Marker,
  Rubik,
  Rubik_Mono_One,
  Space_Grotesk,
  Titan_One,
  Unbounded,
} from "next/font/google";
import type { Metadata } from "next";
import type { CSSProperties } from "react";

import { Building2, LayoutGrid, Map as MapIcon, ShoppingBag } from "lucide-react";

import { Art, ITEMS, RARITY } from "../kit";

export const metadata: Metadata = { title: "Font review", robots: { index: false } };

/**
 * Font review: the Street Sticker UI (concept B) set in different type pairings, on the
 * same dummy content, so the owner can pick the one that fits the mood. Static.
 */

const anton = Anton({ subsets: ["latin"], weight: "400" });
const onest = Onest({ subsets: ["latin"], weight: ["400", "600"] });
const dela = Dela_Gothic_One({ subsets: ["latin"], weight: "400" });
const grotesk = Space_Grotesk({ subsets: ["latin"], weight: ["400", "600"] });
const rubikMono = Rubik_Mono_One({ subsets: ["latin"], weight: "400" });
const rubik = Rubik({ subsets: ["latin"], weight: ["400", "600"] });
const unbounded = Unbounded({ subsets: ["latin"], weight: ["800", "900"] });
const manrope = Manrope({ subsets: ["latin"], weight: ["400", "600"] });
const bowlby = Bowlby_One({ subsets: ["latin"], weight: "400" });
const archivo = Archivo({ subsets: ["latin"], weight: ["400", "600"] });
const marker = Permanent_Marker({ subsets: ["latin"], weight: "400" });
const archivoBlack = Archivo_Black({ subsets: ["latin"], weight: "400" });
const titan = Titan_One({ subsets: ["latin"], weight: "400" });

type Option = {
  id: string;
  name: string;
  mood: string;
  /** Titles. */
  title: CSSProperties;
  /** Tags, buttons, dock labels. */
  label: CSSProperties;
  body: CSSProperties;
  /** Scale for the title, since widths differ a lot. */
  size: number;
};

const OPTIONS: Option[] = [
  {
    id: "0",
    name: "Anton + Onest (current)",
    mood: "Tall and condensed. Reads like a poster, not a sticker.",
    title: anton.style,
    label: anton.style,
    body: onest.style,
    size: 48,
  },
  {
    id: "1",
    name: "Dela Gothic One + Space Grotesk",
    mood: "Heavy Tokyo street-sign type. Chunky and stamped.",
    title: dela.style,
    label: dela.style,
    body: grotesk.style,
    size: 27,
  },
  {
    id: "2",
    name: "Rubik Mono One + Rubik",
    mood: "Wide, blocky and loud. Skate-deck graphics.",
    title: rubikMono.style,
    label: rubikMono.style,
    body: rubik.style,
    size: 24,
  },
  {
    id: "3",
    name: "Unbounded Black + Manrope",
    mood: "Wide, round and modern. Streetwear-drop energy.",
    title: { ...unbounded.style, fontWeight: 900 },
    label: { ...unbounded.style, fontWeight: 800 },
    body: manrope.style,
    size: 27,
  },
  {
    id: "4",
    name: "Bowlby One + Archivo",
    mood: "Fat and bouncy. Feels like a die-cut vinyl sticker.",
    title: bowlby.style,
    label: bowlby.style,
    body: archivo.style,
    size: 32,
  },
  {
    id: "5",
    name: "Permanent Marker + Archivo Black",
    mood: "Hand-tagged titles, blocky labels. Graffiti on a wall.",
    title: marker.style,
    label: archivoBlack.style,
    body: archivo.style,
    size: 35,
  },
  {
    id: "6",
    name: "Titan One + Rubik",
    mood: "Rounded bubble letters. Playful, toy-like stickers.",
    title: titan.style,
    label: titan.style,
    body: rubik.style,
    size: 34,
  },
];

function Specimen({ o }: { o: Option }) {
  const up = (s: CSSProperties): CSSProperties => ({ ...s, textTransform: "uppercase" });
  return (
    <div className="relative w-[330px] shrink-0 overflow-hidden rounded-[30px] border border-white/10 bg-[#070907] p-4 pb-5">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(77,255,42,0.06)_1px,transparent_1.3px)] [background-size:9px_9px]" />
      <div className="relative">
        <span
          className="inline-block -rotate-2 border-[3px] border-black bg-[#4dff2a] px-2 py-0.5 text-[12px] text-black shadow-[3px_3px_0_#000]"
          style={up(o.label)}
        >
          Your stash
        </span>
        <h3
          className="mt-2 whitespace-nowrap leading-[0.95] text-[#f2f7f2]"
          style={{ ...up(o.title), fontSize: o.size }}
        >
          My collection
        </h3>
        <p className="mt-2 text-[13px] leading-snug text-white/65" style={o.body}>
          Walk to pins organizations dropped around the city and collect them in AR.
        </p>

        <div className="mt-3 flex gap-2">
          {["All", "Rare", "Epic", "Legend"].map((t, i) => (
            <span
              key={t}
              className={
                "border-2 border-black px-2 py-0.5 text-[12px] text-black shadow-[2px_2px_0_#000] " +
                (i === 0 ? "bg-[#4dff2a]" : "bg-[#f2f7f2]")
              }
              style={{ ...up(o.label), transform: `rotate(${i % 2 ? 2 : -2}deg)` }}
            >
              {t}
            </span>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          {ITEMS.slice(0, 2).map((it, i) => (
            <div
              key={it.id}
              className="border-[3px] border-[#f2f7f2] bg-black shadow-[4px_4px_0_#4dff2a]"
              style={{ transform: `rotate(${i ? 2 : -2}deg)` }}
            >
              <Art art={it.art} className="h-16" />
              <div className="px-2 py-1.5">
                <p className="truncate text-[14px] leading-none text-[#f2f7f2]" style={up(o.label)}>
                  {it.name}
                </p>
                <p className="mt-1 text-[10px] font-semibold" style={{ ...o.body, color: RARITY[it.rarity] }}>
                  ★ {it.rarity} · {it.artist}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-[3px] border-black bg-[#f2f7f2] p-2.5 text-black shadow-[4px_4px_0_#4dff2a]">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-black/60" style={o.body}>
              Price
            </p>
            <p className="whitespace-nowrap text-[15px] leading-none" style={o.label}>
              1,250 ACTN
            </p>
          </div>
          <span
            className="-rotate-3 whitespace-nowrap border-[2.5px] border-black bg-[#4dff2a] shrink-0 px-2.5 py-1.5 text-[13px] shadow-[3px_3px_0_#000]"
            style={up(o.label)}
          >
            Collect →
          </span>
        </div>

        <div className="mt-5 grid h-[58px] grid-cols-5 items-center rounded-[20px] border-[3px] border-black bg-[#f2f7f2] text-black shadow-[4px_4px_0_#4dff2a]">
          {[
            { l: "Map", I: MapIcon, on: false },
            { l: "Stash", I: LayoutGrid, on: true },
            null,
            { l: "Market", I: ShoppingBag, on: false },
            { l: "Orgs", I: Building2, on: false },
          ].map((t, i) =>
            t ? (
              <span key={t.l} className="flex flex-col items-center gap-0.5">
                <span
                  className={
                    "flex h-6 w-9 items-center justify-center rounded-full " +
                    (t.on ? "bg-black text-[#4dff2a]" : "")
                  }
                >
                  <t.I className="size-4" strokeWidth={2.4} />
                </span>
                <span className="text-[10px] leading-none" style={up(o.label)}>
                  {t.l}
                </span>
              </span>
            ) : (
              <span key={i} className="flex justify-center">
                <span
                  className="-mt-7 flex size-[54px] -rotate-6 items-center justify-center rounded-[16px] border-[3px] border-black bg-[#4dff2a] text-[20px] shadow-[3px_3px_0_#000]"
                  style={o.label}
                >
                  AR
                </span>
              </span>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

export default function FontReviewPage() {
  return (
    <div className="fixed inset-0 overflow-y-auto bg-[#030403] text-white">
      <header className="mx-auto max-w-[1180px] px-6 pt-12 pb-6">
        <p className="font-mono text-[11px] tracking-[0.2em] text-[#4dff2a] uppercase">
          ActionTokens AR · Font review
        </p>
        <h1 className="font-display mt-2 text-[44px] leading-none">Pick the type</h1>
        <p className="mt-3 max-w-[620px] text-[15px] leading-relaxed text-white/60">
          The same Street Sticker screen in seven type pairings. Reply with a number.
        </p>
      </header>
      <main className="mx-auto flex max-w-[1180px] flex-wrap gap-8 px-6 pb-24">
        {OPTIONS.map((o) => (
          <section key={o.id} className="flex flex-col gap-3">
            <div className="flex items-baseline gap-3">
              <span className="font-display flex size-9 items-center justify-center rounded-[10px] bg-[#4dff2a] text-[20px] text-black">
                {o.id}
              </span>
              <div>
                <h2 className="text-[15px] font-semibold">{o.name}</h2>
                <p className="text-[12.5px] text-white/55">{o.mood}</p>
              </div>
            </div>
            <Specimen o={o} />
          </section>
        ))}
      </main>
    </div>
  );
}
