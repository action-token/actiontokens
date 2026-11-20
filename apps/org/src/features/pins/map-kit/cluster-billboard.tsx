"use client";

import { memo } from "react";
import { Marker } from "react-map-gl/mapbox";

import { cn } from "@actiontokens/ui/lib/cn";

const W = 66;
const H = 58;
const PAD = 4;
const GAP = 3;

/**
 * A group of nearby spots, drawn as a little roadside billboard (the AR map's ClusterBillboard in
 * the portal's colours): a card on a post with a bento of the pins' pictures (1 → full panel,
 * 2 → split, 3 → one tall and two stacked, 4 → 2×2) and the spot count on a badge. Click to zoom
 * in until it opens up. Anchored at the foot of the post.
 */
export const ClusterBillboard = memo(function ClusterBillboard({
  latitude,
  longitude,
  count,
  images,
  onOpen,
}: {
  latitude: number;
  longitude: number;
  count: number;
  /** Up to four different pictures from inside the cluster. */
  images: string[];
  onOpen: () => void;
}) {
  return (
    <Marker
      latitude={latitude}
      longitude={longitude}
      anchor="bottom"
      style={{ zIndex: 5 }}
      onClick={(event) => {
        event.originalEvent.stopPropagation();
        onOpen();
      }}
    >
      <button
        type="button"
        aria-label={`${count} spots here. Zoom in`}
        title={`${count} spots here · click to zoom in`}
        className="group relative flex flex-col items-center"
        style={{ width: W + 16, height: H + 26 }}
      >
        {/* Ground shadow and post. */}
        <span className="absolute bottom-0 h-[5px] w-[26px] rounded-full bg-black/45" />
        <span className="bg-primary/70 absolute bottom-[2px] h-[18px] w-[3px] rounded-full" />

        {/* The board. */}
        <span
          className="bg-surface border-primary relative overflow-hidden rounded-[12px] border-2 shadow-md transition-transform duration-200 group-hover:-translate-y-0.5"
          style={{ width: W, height: H, padding: PAD }}
        >
          <Bento images={images.slice(0, 4)} />
        </span>

        {/* Count badge on the board's top-right corner. */}
        <span
          className={cn(
            "font-hud bg-primary text-primary-foreground border-surface absolute -top-1.5 right-[1px] flex h-5 min-w-6 items-center justify-center rounded-full border-2 px-1 text-[11px] leading-none font-bold",
          )}
        >
          {count > 999 ? `${Math.floor(count / 1000)}k` : count}
        </span>
      </button>
    </Marker>
  );
});

function Bento({ images }: { images: string[] }) {
  const inner = { w: W - PAD * 2 - 4, h: H - PAD * 2 - 4 }; // minus the 2 px border each side
  const half = { w: (inner.w - GAP) / 2, h: (inner.h - GAP) / 2 };
  const [a, b, c, d] = images;

  if (images.length <= 1) return <Tile uri={a} w={inner.w} h={inner.h} />;
  if (images.length === 2)
    return (
      <span className="flex" style={{ gap: GAP }}>
        <Tile uri={a} w={half.w} h={inner.h} />
        <Tile uri={b} w={half.w} h={inner.h} />
      </span>
    );
  if (images.length === 3)
    return (
      <span className="flex" style={{ gap: GAP }}>
        <Tile uri={a} w={half.w} h={inner.h} />
        <span className="flex flex-col" style={{ gap: GAP }}>
          <Tile uri={b} w={half.w} h={half.h} />
          <Tile uri={c} w={half.w} h={half.h} />
        </span>
      </span>
    );
  return (
    <span className="flex flex-col" style={{ gap: GAP }}>
      <span className="flex" style={{ gap: GAP }}>
        <Tile uri={a} w={half.w} h={half.h} />
        <Tile uri={b} w={half.w} h={half.h} />
      </span>
      <span className="flex" style={{ gap: GAP }}>
        <Tile uri={c} w={half.w} h={half.h} />
        <Tile uri={d} w={half.w} h={half.h} />
      </span>
    </span>
  );
}

function Tile({ uri, w, h }: { uri?: string; w: number; h: number }) {
  return (
    <span
      className="bg-surface-2 block overflow-hidden rounded-[6px]"
      style={{ width: w, height: h }}
    >
      {uri ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={uri}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
          className="h-full w-full object-cover"
        />
      ) : null}
    </span>
  );
}
