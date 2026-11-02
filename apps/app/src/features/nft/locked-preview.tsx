"use client";

import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Footprints,
  Image as ImageIcon,
  Link2,
  MapPin,
  Music,
  Sparkles,
  Unlock,
  Video,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";

import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { cn } from "@bandcoin/ui/lib/cn";

import type { RouterOutputs } from "~/trpc/react";

import { directionsLink } from "./map-view";

/** Mapbox is heavy, so it only loads for items that have places. */
const PlacesMap = dynamic(() => import("./places-map"), {
  ssr: false,
  loading: () => <Skeleton className="h-72 w-full rounded-lg" />,
});
const MAP_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_API;

export type Preview = RouterOutputs["item"]["bySlug"]["lockedContent"][number];
type Kind = Preview["type"];
type Place = { lat: number; lng: number; label: string | null };

/** The old Bandcoin's look for locked content: an icon and colour per kind. */
export const KIND: Record<Kind, { icon: typeof Music; name: string; tone: string }> = {
  SONG: {
    icon: Music,
    name: "Song",
    tone: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  },
  VIDEO: { icon: Video, name: "Video", tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  IMAGE: { icon: ImageIcon, name: "Image", tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  OTHER: {
    icon: Link2,
    name: "Link",
    tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
};

export const labelOf = (type: Kind, label: string | null, index: number) =>
  label || `${KIND[type].name} ${index + 1}`;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** Places to visit across every piece, and how many pieces need any. */
export function travelOf(pieces: Preview[]) {
  return {
    places: pieces.reduce((sum, piece) => sum + (piece.unlock?.places.length ?? 0), 0),
    gated: pieces.filter((piece) => (piece.unlock?.places.length ?? 0) > 0).length,
  };
}

/** "2 tracks, 1 video, 1 link" */
export function summaryOf(pieces: Preview[]) {
  const count = (type: Kind) => pieces.filter((piece) => piece.type === type).length;
  return [
    [count("SONG"), "track"],
    [count("VIDEO"), "video"],
    [count("IMAGE"), "image"],
    [count("OTHER"), "link"],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, word]) => plural(n as number, word as string))
    .join(", ");
}

/** The distance a fan must be within, as set on the pieces (50 m unless the artist chose). */
export const radiusOf = (pieces: Preview[]) =>
  pieces.find((piece) => piece.unlock)?.unlock?.radiusMeters ?? 50;

export const scrollToPlaces = () =>
  document.getElementById("unlock-places")?.scrollIntoView({ behavior: "smooth", block: "start" });

/**
 * Before buying: will the rewards come with the copy, or only after a trip?
 * Amber when some need travel, green when everything opens right away.
 */
export function UnlockNotice({ pieces }: { pieces: Preview[] }) {
  if (pieces.length === 0) return null;
  const radius = radiusOf(pieces);
  const { places, gated } = travelOf(pieces);

  if (places === 0)
    return (
      <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
        <Unlock className="mt-0.5 size-4 shrink-0 text-emerald-600" />
        <p className="text-fg-muted text-sm">
          <span className="text-fg font-semibold">Unlocks right away. </span>
          All {plural(pieces.length, "reward")} open as soon as you own a copy. No travel needed.
        </p>
      </div>
    );

  return (
    <div className="grid gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="flex items-start gap-3">
        <Footprints className="mt-0.5 size-4 shrink-0 text-amber-600" />
        <div className="grid gap-1">
          <p className="text-sm font-semibold">Requires travel to unlock</p>
          <p className="text-fg-muted text-sm">
            {gated >= pieces.length ? (
              <>
                This item&apos;s rewards stay locked until you visit{" "}
                <b className="text-fg">{plural(places, "place")}</b> in person.
              </>
            ) : (
              <>
                {pieces.length - gated} of {pieces.length} rewards open as soon as you own a copy.
                {gated === 1 ? " The other one stays" : ` The other ${gated} stay`} locked until you
                visit <b className="text-fg">{plural(places, "place")}</b> in person.
              </>
            )}{" "}
            Be within {radius} meters of each place, with your phone, to collect it. Every copy you
            buy unlocks on its own.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={scrollToPlaces}
        className="ml-7 justify-self-start text-xs font-semibold text-amber-700 hover:underline dark:text-amber-500"
      >
        Check where before you buy →
      </button>
    </div>
  );
}

/** "What you get": one tile per reward, with what it takes to open it. */
export function RewardTiles({
  pieces,
  maxVisible = 4,
}: {
  pieces: Preview[];
  maxVisible?: number;
}) {
  const [all, setAll] = useState(false);
  if (pieces.length === 0) return null;
  const more = pieces.length - maxVisible;
  const shown = more > 0 && !all ? pieces.slice(0, maxVisible) : pieces;

  return (
    <div className="grid gap-1.5">
      <div className="grid gap-1.5 sm:grid-cols-2">
        {shown.map((piece, index) => {
          const kind = KIND[piece.type];
          const pins = piece.unlock?.places.length ?? 0;
          const label = labelOf(piece.type, piece.label, index);
          return (
            <div
              key={piece.id}
              className="group bg-surface-2/60 hover:border-border-strong flex items-center justify-between gap-2 rounded-lg border p-2 transition-colors"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-md transition-transform group-hover:scale-105",
                    kind.tone,
                  )}
                >
                  <kind.icon className="size-3.5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium" title={label}>
                    {label}
                  </span>
                  <span className="text-fg-muted block text-[10px]">{kind.name}</span>
                </span>
              </div>
              {pins > 0 ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                  <Footprints className="size-2.5" /> {plural(pins, "pin")}
                </span>
              ) : (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                  <Unlock className="size-2.5" /> Instant
                </span>
              )}
            </div>
          );
        })}
      </div>
      {more > 0 && (
        <button
          type="button"
          onClick={() => setAll((open) => !open)}
          className="text-fg-muted hover:text-fg hover:bg-surface-2/60 flex items-center justify-center gap-1 rounded-md border border-dashed py-1 text-[11px] font-medium"
        >
          {all ? (
            <>
              <ChevronUp className="size-3" /> Show less
            </>
          ) : (
            <>
              <ChevronDown className="size-3" /> and {plural(more, "more reward")}
            </>
          )}
        </button>
      )}
    </div>
  );
}

/** Where each reward unlocks, and how collecting a place works. */
export function UnlockPlaces({ pieces, radius }: { pieces: Preview[]; radius: number }) {
  const gated = pieces.filter((piece) => (piece.unlock?.places.length ?? 0) > 0);
  return (
    <div className="grid gap-4">
      {gated.length > 0 ? (
        <div className="grid gap-2">
          <p className="text-sm font-semibold">How to unlock after buying</p>
          <ol className="text-fg-muted list-decimal space-y-1 pl-5 text-sm">
            <li>
              Go to the place: within <b className="text-fg">{radius} meters</b>, in person, with
              your phone.
            </li>
            <li>Open the Bandcoin AR app once you&apos;re there.</li>
            <li>Collect the pin. The reward unlocks on its own from there.</li>
          </ol>
        </div>
      ) : (
        <p className="text-fg-muted text-sm">
          Owning a copy opens its rewards right away. No places to visit.
        </p>
      )}
      {gated.length > 0 && MAP_TOKEN ? (
        <div className="grid gap-2 border-t pt-4">
          <PlacesMap
            token={MAP_TOKEN}
            places={gated.flatMap((piece, index) =>
              piece.unlock!.places.map((place) => ({
                ...place,
                reward: labelOf(piece.type, piece.label, index),
              })),
            )}
          />
          <p className="text-fg-muted text-xs">Tap a pin to see the place and get directions.</p>
        </div>
      ) : (
        gated.map((piece, index) => (
          <div key={piece.id} className="grid gap-2 border-t pt-4">
            <p className="text-xs font-semibold">
              {labelOf(piece.type, piece.label, index)} ·{" "}
              {plural(piece.unlock!.places.length, "place")}
            </p>
            <Places places={piece.unlock!.places} />
          </div>
        ))
      )}
    </div>
  );
}

/** The plain list, for when the map isn't set up. */
function Places({ places }: { places: Place[] }) {
  return (
    <ol className="grid gap-1.5 sm:grid-cols-2">
      {places.map((place, index) => (
        <li key={index}>
          <a
            href={directionsLink(place)}
            target="_blank"
            rel="noreferrer"
            className="bg-surface-2/60 hover:border-border-strong flex items-center gap-2 rounded-lg border p-2 text-xs"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400">
              <MapPin className="size-3" />
            </span>
            <span className="min-w-0 flex-1 truncate">
              {place.label || `${place.lat.toFixed(4)}, ${place.lng.toFixed(4)}`}
            </span>
            <ExternalLink className="text-fg-muted size-3 shrink-0" />
          </a>
        </li>
      ))}
    </ol>
  );
}

/** Under the title: how many rewards, and how many places they take (jumps to them). */
export function RewardsLine({ pieces }: { pieces: Preview[] }) {
  if (pieces.length === 0) return null;
  const { places } = travelOf(pieces);
  return (
    <p className="flex flex-wrap items-center gap-2 text-xs text-white/75">
      <span className="inline-flex items-center gap-1 font-semibold text-white">
        <Sparkles className="size-3.5 text-emerald-400" /> {plural(pieces.length, "reward")}
      </span>
      {places > 0 && (
        <>
          <span className="text-white/40">•</span>
          <button
            type="button"
            onClick={scrollToPlaces}
            className="inline-flex items-center gap-1 text-amber-300 hover:underline"
          >
            <MapPin className="size-3.5" /> {plural(places, "place")} to visit
          </button>
        </>
      )}
    </p>
  );
}

/** On the cover: a VIP badge, and "Travel to unlock" when some rewards need it. */
export function CoverBadges({ pieces }: { pieces: Preview[] }) {
  if (pieces.length === 0) return null;
  const { places } = travelOf(pieces);
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap gap-1.5">
      <span className="inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white">
        <Sparkles className="size-3" /> VIP item
      </span>
      {places > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white">
          <Footprints className="size-3" /> Travel to unlock
        </span>
      )}
    </div>
  );
}
