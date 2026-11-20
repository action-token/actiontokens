import type { Metadata } from "next";
import type { ReactNode } from "react";

import { FieldOps } from "./concept-field-ops";
import { Sheets } from "./concept-sheets";
import { Sticker } from "./concept-sticker";
import { TicketPass } from "./concept-ticket";

export const metadata: Metadata = {
  title: "Layout review",
  robots: { index: false },
};

/**
 * Layout review: four layout concepts for the ActionTokens AR app, side by side, all on the
 * same dummy data so only the design differs. The owner picks one (or mixes parts) before
 * any real screen is rebuilt. Static, no API calls.
 */

const CONCEPTS: {
  id: string;
  letter: string;
  name: string;
  idea: string;
  changes: string[];
  screens: ReactNode;
}[] = [
  {
    id: "field-ops",
    letter: "A",
    name: "Field Ops",
    idea: "A tactical scanner. You're an operative locking onto drops.",
    changes: [
      "Square edges, hairline frames, AR-camera corners everywhere",
      "Flat command bar with a wide SCAN key, no raised round AR button",
      "Collection is a data list with IDs, not a card grid",
    ],
    screens: <FieldOps />,
  },
  {
    id: "sticker",
    letter: "B",
    name: "Street Sticker",
    idea: "Phonk street culture. Your collection is a wall of stickers.",
    changes: [
      "Heavy condensed type, thick outlines, hard offset shadows, tape",
      "Floating sticker dock with a big tilted AR sticker",
      "Tilted sticker cards and a halftone texture over the map",
    ],
    screens: <Sticker />,
  },
  {
    id: "sheets",
    letter: "C",
    name: "Map-first Sheets",
    idea: "The map is the app. Everything else slides up over it.",
    changes: [
      "No tab bar. A floating button cluster with AR in the middle",
      "Collection, market and artists open as bottom sheets over the map",
      "Glass panels, search on the map, a nearby carousel",
    ],
    screens: <Sheets />,
  },
  {
    id: "ticket",
    letter: "D",
    name: "Ticket Pass",
    idea: "Every drop is a ticket. Collecting is like keeping event passes.",
    changes: [
      "Big text tabs across the top instead of a bottom bar",
      "Map in a rounded window, collectibles as tear-off tickets",
      "AR is a floating 'Open AR' pill in the corner",
    ],
    screens: <TicketPass />,
  },
];

export default function ReviewPage() {
  return (
    // The app locks document scroll (globals.css), so this page scrolls itself.
    <div className="fixed inset-0 overflow-y-auto bg-[#030403] text-white">
      <header className="mx-auto max-w-[1180px] px-6 pt-12 pb-6">
        <p className="font-mono text-[11px] tracking-[0.2em] text-[#4dff2a] uppercase">
          ActionTokens AR · Layout review
        </p>
        <h1 className="font-display mt-2 text-[44px] leading-none sm:text-[56px]">
          Pick a direction
        </h1>
        <p className="mt-3 max-w-[620px] text-[15px] leading-relaxed text-white/60">
          Four layouts, all with the same dummy drops, so only the design differs. Choose one
          letter, or mix parts, for example “A’s command bar with D’s tickets”.
        </p>
        <nav className="mt-6 flex flex-wrap gap-2">
          {CONCEPTS.map((c) => (
            <a
              key={c.id}
              href={`#${c.id}`}
              className="flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-[13px] text-white/80 transition-colors hover:border-[#4dff2a] hover:text-white"
            >
              <span className="font-display text-[#4dff2a]">{c.letter}</span>
              {c.name}
            </a>
          ))}
        </nav>
      </header>

      <main className="mx-auto flex max-w-[1180px] flex-col gap-6 px-6 pb-24">
        {CONCEPTS.map((c) => (
          <section
            key={c.id}
            id={c.id}
            className="scroll-mt-6 rounded-[28px] border border-white/[0.07] bg-[#080a08] p-6 sm:p-8"
          >
            <div className="flex flex-col gap-8 lg:flex-row">
              <div className="lg:w-[300px] lg:shrink-0">
                <span className="font-display flex size-12 items-center justify-center rounded-[14px] bg-[#4dff2a] text-[28px] text-black">
                  {c.letter}
                </span>
                <h2 className="font-display mt-4 text-[34px] leading-none">{c.name}</h2>
                <p className="mt-2 text-[15px] text-white/70">{c.idea}</p>
                <ul className="mt-5 flex flex-col gap-2.5">
                  {c.changes.map((x) => (
                    <li key={x} className="flex gap-2.5 text-[13.5px] leading-snug text-white/60">
                      <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[#4dff2a]" />
                      {x}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="-mx-2 flex gap-6 overflow-x-auto px-2 pb-2">{c.screens}</div>
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
