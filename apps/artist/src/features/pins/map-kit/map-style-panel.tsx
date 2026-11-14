"use client";

import { Check, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { Label } from "@bandcoin/ui/components/label";
import { Switch } from "@bandcoin/ui/components/switch";
import { cn } from "@bandcoin/ui/lib/cn";
import { Segmented } from "@bandcoin/ui/patterns/segmented";

import { MAPBOX_TOKEN } from "../mapbox";
import {
  MAP_BASE_LABEL,
  MAP_BASES,
  setMapBase,
  setMapMode,
  setMapTerrain,
  useMapBase,
  useMapMode,
  useMapTerrain,
  type MapBase,
} from "./map-mode";

/** Where the previews look: the map's centre and zoom when the panel opened. */
export type PreviewView = { lng: number; lat: number; zoom: number };
/** Before the map has a view: a hilly town, where every type looks different. */
export const DEFAULT_PREVIEW: PreviewView = { lng: 8.6806, lat: 49.4105, zoom: 13.2 };

const PREVIEW_STYLE: Record<MapBase, (theme: "light" | "dark") => string> = {
  default: (theme) => (theme === "dark" ? "mapbox/dark-v11" : "mapbox/light-v11"),
  streets: () => "mapbox/streets-v12",
  outdoors: () => "mapbox/outdoors-v12",
  satellite: () => "mapbox/satellite-streets-v12",
  light: () => "mapbox/light-v11",
  dark: () => "mapbox/dark-v11",
};

/** A small picture of a map type (its flat style) at the place being looked at. */
export function previewUrl(base: MapBase, theme: "light" | "dark", view: PreviewView) {
  // Zoomed out a little from the map, so a thumbnail shows the area around it.
  const zoom = Math.min(16, Math.max(1, view.zoom - 1)).toFixed(1);
  return `https://api.mapbox.com/styles/v1/${PREVIEW_STYLE[base](theme)}/static/${view.lng.toFixed(4)},${view.lat.toFixed(4)},${zoom}/160x104@2x?attribution=false&logo=false&access_token=${MAPBOX_TOKEN ?? ""}`;
}

/** The options themselves: map type, 2D / 3D and terrain. Separate from the panel so they render alone. */
export function MapStyleOptions({ theme, view }: { theme: "light" | "dark"; view: PreviewView }) {
  const base = useMapBase();
  const mode = useMapMode();
  const terrain = useMapTerrain();
  return (
    <>
      <p className="text-fg-muted text-[11px] font-semibold tracking-wider uppercase">Map type</p>
      <div className="mt-1.5 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Map type">
        {MAP_BASES.map((b) => {
          const on = b === base;
          return (
            <button
              key={b}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setMapBase(b)}
              className="text-left"
            >
              <span
                className={cn(
                  "bg-surface-2 relative block aspect-[160/104] overflow-hidden rounded-lg border-2",
                  on ? "border-primary" : "border-transparent",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl(b, theme, view)}
                  alt=""
                  loading="lazy"
                  className="size-full object-cover"
                />
                {on && (
                  <span className="bg-primary text-primary-ink absolute top-1 right-1 flex size-4 items-center justify-center rounded-full">
                    <Check className="size-3" strokeWidth={3.5} />
                  </span>
                )}
              </span>
              <span className={cn("mt-0.5 block text-xs font-medium", !on && "text-fg-muted")}>
                {MAP_BASE_LABEL[b]}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
        <span className="text-fg-muted text-[11px] font-semibold tracking-wider uppercase">
          View
        </span>
        <Segmented
          label="View"
          value={mode}
          onChange={setMapMode}
          options={[
            { id: "2d", label: "2D" },
            { id: "3d", label: "3D" },
          ]}
        />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
        <div>
          <Label htmlFor="map-terrain" className="text-sm">
            Terrain
          </Label>
          <p className="text-fg-muted text-xs">Hills and contour lines with heights</p>
        </div>
        <Switch id="map-terrain" checked={terrain} onCheckedChange={setMapTerrain} />
      </div>
    </>
  );
}

/** The base map's Layers panel, shared by every portal map. Esc or a click elsewhere closes it. */
export function MapStylePanel({
  theme,
  view,
  onClose,
  className,
}: {
  theme: "light" | "dark";
  view: PreviewView;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      // Not the Layers button: that toggles it.
      if (!ref.current?.contains(t) && !t.closest("[data-layers-button]")) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Map layers"
      className={cn("bg-surface z-40 w-[296px] rounded-2xl border p-3 shadow-xl", className)}
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold">Map layers</p>
        <Button size="icon-sm" variant="ghost" aria-label="Close map layers" onClick={onClose}>
          <X />
        </Button>
      </div>
      <MapStyleOptions theme={theme} view={view} />
    </div>
  );
}
