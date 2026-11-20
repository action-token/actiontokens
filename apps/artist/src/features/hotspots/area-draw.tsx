"use client";

import {
  Check,
  Circle,
  Hexagon,
  MapPinOff,
  RectangleHorizontal,
  RotateCcw,
  Undo2,
  X,
} from "lucide-react";
import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Layer, Marker, Source, type MapRef } from "react-map-gl/mapbox";

import { Button } from "@actiontokens/ui/components/button";
import { cn } from "@actiontokens/ui/lib/cn";
import {
  areaBounds,
  circleFeature,
  featureCenter,
  haversineMetres,
  type LatLng,
  polygonFeature,
  rectangleFeature,
  type StoredFeature,
  toMapboxFeature,
} from "@actiontokens/geo/map-geometry";

import { BaseMap, WORLD_VIEW } from "../pins/map-kit/base-map";
import { PlaceSearch } from "../pins/map-kit/place-search";
import { MAPBOX_TOKEN } from "../pins/mapbox";

export type AreaShape = "circle" | "rectangle" | "polygon";
export type DrawnArea = { shape: AreaShape; feature: StoredFeature };

export const AREA = "#dbdc2c";
export const SHAPES: {
  value: AreaShape;
  label: string;
  icon: typeof Circle;
  /** What to do before the first click, and after it */
  hints: [string, string];
}[] = [
  {
    value: "circle",
    label: "Circle",
    icon: Circle,
    hints: ["Click the centre", "Click to set the radius · then Finish area"],
  },
  {
    value: "rectangle",
    label: "Rectangle",
    icon: RectangleHorizontal,
    hints: ["Click one corner", "Click the opposite corner · then Finish area"],
  },
  {
    value: "polygon",
    label: "Shape",
    icon: Hexagon,
    hints: [
      "Click to place the first corner",
      "Keep clicking to add corners · click the green starting point or Finish area to close",
    ],
  },
];

/** "1.2 km" / "350 m": how far the area reaches from its centre. */
export function areaReach(feature: StoredFeature) {
  const center = featureCenter(feature);
  const ring = feature.geometry.coordinates[0] ?? [];
  const metres = Math.max(
    0,
    ...ring.map(([lat, lng]) => haversineMetres(center, { lat: lat!, lng: lng! })),
  );
  return metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`;
}

/** Smaller than this across is almost certainly a mis-click, not a hotspot. */
export const MIN_SPAN_M = 10;
/** Bigger than this spreads pins very thin: allowed, but worth a warning. */
export const LARGE_SPAN_M = 50_000;
/** Below this zoom a click can land kilometres off: zoom in first. */
const MIN_DRAW_ZOOM = 9;
/** How close (in screen pixels) a click has to be to the first corner to close a shape. */
const SNAP_PX = 28;

/** The farthest two of the points are from each other, in metres. */
export function spanOf(points: LatLng[]) {
  let max = 0;
  for (const a of points) for (const b of points) max = Math.max(max, haversineMetres(a, b));
  return max;
}

function featureOf(shape: AreaShape, points: LatLng[]) {
  if (shape === "polygon") return polygonFeature(points);
  return shape === "rectangle"
    ? rectangleFeature(points[0]!, points[1]!)
    : circleFeature(points[0]!, points[1]!);
}

/** The shape as it stands, following the mouse until it is complete. */
function draftFeature(shape: AreaShape, points: LatLng[], hover: LatLng | null) {
  if (shape === "polygon") {
    const all = hover ? [...points, hover] : points;
    return all.length >= 3 ? polygonFeature(all) : null;
  }
  if (points.length >= 2) return featureOf(shape, points);
  if (points.length === 1 && hover) return featureOf(shape, [points[0]!, hover]);
  return null;
}

/**
 * The drawing itself, for any map, as in Wadzzo: click a circle's centre then its edge, a
 * rectangle's two corners, or each corner of a shape. Nothing is saved until Finish area (or, for a
 * shape, a click on its green starting corner, a double-click or Enter). A third click on a circle
 * or rectangle starts it over. `onFinish` gets the stored feature.
 *
 * Keys, when `keys` is on: Esc cancels (`onCancel`), Enter finishes, Backspace or ⌘Z undoes the
 * last corner.
 */
export function useAreaDrawing(
  map: RefObject<MapRef | null>,
  shape: AreaShape,
  onFinish: (feature: StoredFeature) => void,
  { keys = false, onCancel }: { keys?: boolean; onCancel?: () => void } = {},
) {
  const [points, setPoints] = useState<LatLng[]>([]);
  const [hover, setHover] = useState<LatLng | null>(null);
  const drawing = points.length > 0;

  const reset = () => {
    setPoints([]);
    setHover(null);
  };

  const enough = shape === "polygon" ? points.length >= 3 : points.length >= 2;
  const extent = enough ? spanOf(points) : 0;
  const tooSmall = enough && extent < MIN_SPAN_M;
  const large = extent > LARGE_SPAN_M;
  const complete = enough && !tooSmall;

  const finish = () => {
    if (!complete) return;
    onFinish(featureOf(shape, points));
    reset();
  };
  const undo = () => setPoints((current) => current.slice(0, -1));

  /** Whether a click at `at` lands within a few pixels of the first corner. */
  const nearStart = (at: LatLng) => {
    const first = points[0];
    const mapbox = map.current?.getMap();
    if (!first || !mapbox) return false;
    const a = mapbox.project([first.lng, first.lat]);
    const b = mapbox.project([at.lng, at.lat]);
    return Math.hypot(a.x - b.x, a.y - b.y) <= SNAP_PX;
  };

  const click = (at: LatLng) => {
    const mapbox = map.current?.getMap();
    if (mapbox && mapbox.getZoom() < MIN_DRAW_ZOOM) {
      mapbox.flyTo({ center: [at.lng, at.lat], zoom: 14, duration: 650 });
      toast(
        drawing
          ? "Zoomed in to drawing level: click to continue placing corners"
          : "Zoomed in to drawing level: click now to start drawing",
        { icon: "🔍", id: "draw-zoom-in" },
      );
      return;
    }
    if (
      shape === "polygon" &&
      points.length >= 3 &&
      nearStart(at) &&
      spanOf(points) >= MIN_SPAN_M
    ) {
      onFinish(polygonFeature(points));
      return reset();
    }
    setPoints((current) => (shape !== "polygon" && current.length >= 2 ? [at] : [...current, at]));
  };

  /** A double-click is two clicks: drop the duplicate corner, and close a shape that has enough. */
  const doubleClick = () => {
    const kept = points.slice(0, -1);
    setPoints(kept);
    if (shape === "polygon" && kept.length >= 3 && spanOf(kept) >= MIN_SPAN_M) {
      onFinish(polygonFeature(kept));
      reset();
    }
  };

  // The keys read the latest state through a ref, so the listener is added once.
  const live = useRef({ finish, undo, onCancel });
  useEffect(() => {
    live.current = { finish, undo, onCancel };
  });
  useEffect(() => {
    if (!keys) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=true]")) return;
      if (event.key === "Escape") live.current.onCancel?.();
      else if (event.key === "Enter") live.current.finish();
      else if (
        event.key === "Backspace" ||
        (event.key === "z" && (event.metaKey || event.ctrlKey))
      ) {
        event.preventDefault();
        live.current.undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keys]);

  const draft = drawing ? draftFeature(shape, points, hover) : null;
  return {
    shape,
    points,
    drawing,
    draftShape: draft ? toMapboxFeature(draft) : null,
    complete,
    tooSmall,
    large,
    extent,
    click,
    doubleClick,
    move: (at: LatLng) => drawing && setHover(at),
    undo,
    finish,
    reset,
  };
}

export type AreaDrawing = ReturnType<typeof useAreaDrawing>;

/** What to tell the artist under the shape buttons: the next step, or what is wrong with the shape. */
export function drawMessage(draw: AreaDrawing) {
  const hints = SHAPES.find((entry) => entry.value === draw.shape)!.hints;
  if (draw.tooSmall)
    return {
      tone: "bad" as const,
      text: `That's under ${MIN_SPAN_M} m across: make the area bigger.`,
    };
  if (draw.large)
    return {
      tone: "warn" as const,
      text: `That's about ${Math.round(draw.extent / 1000)} km across: pins will be spread very thin.`,
    };
  return { tone: "plain" as const, text: hints[draw.drawing ? 1 : 0] };
}

/** Cancel, Undo and Finish area. Finish glows green when the shape is ready. */
export function DrawButtons({
  draw,
  onCancel,
  className,
}: {
  draw: AreaDrawing;
  onCancel: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        <X /> Cancel
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!draw.drawing}
        onClick={draw.undo}
      >
        <Undo2 /> Undo
      </Button>
      <Button
        type="button"
        size="sm"
        disabled={!draw.complete}
        onClick={draw.finish}
        className={cn(
          "transition-all",
          draw.complete &&
            "bg-success hover:bg-success ring-success/50 text-white shadow-md ring-2",
        )}
      >
        <Check /> Finish area
      </Button>
    </div>
  );
}

/**
 * The green starting corner of a shape with three or more corners: click it to close the shape.
 * Goes inside a map.
 */
export function DrawStartMarker({ draw }: { draw: AreaDrawing }) {
  const first = draw.points[0];
  if (draw.shape !== "polygon" || draw.points.length < 3 || !first) return null;
  return (
    <Marker
      latitude={first.lat}
      longitude={first.lng}
      anchor="center"
      onClick={(event) => {
        event.originalEvent.stopPropagation();
        draw.finish();
      }}
    >
      <div className="group relative flex cursor-pointer items-center justify-center">
        <span className="bg-success/40 absolute -inset-2.5 animate-ping rounded-full" />
        <button
          type="button"
          title="Click here to complete the area"
          className="bg-success relative flex size-7 items-center justify-center rounded-full border-2 border-white text-white shadow-xl transition-transform hover:scale-125 focus:outline-hidden"
        >
          <Check className="size-4 stroke-[3]" />
        </button>
        <div className="bg-success pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 animate-bounce rounded-md px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-white shadow-lg">
          Click to finish
          <div className="border-t-success absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent" />
        </div>
      </div>
    </Marker>
  );
}

/** The dashed outline and corner dots of a drawing in progress. Goes inside a map. */
export function DrawingLayers({
  draftShape,
  points,
}: {
  draftShape: ReturnType<typeof toMapboxFeature>;
  points: LatLng[];
}) {
  return (
    <>
      {draftShape && (
        <Source id="hotspot-draft" type="geojson" data={draftShape}>
          <Layer
            id="hotspot-draft-fill"
            type="fill"
            paint={{ "fill-color": AREA, "fill-opacity": 0.12 }}
          />
          <Layer
            id="hotspot-draft-line"
            type="line"
            paint={{ "line-color": AREA, "line-width": 2, "line-dasharray": [2, 1] }}
          />
        </Source>
      )}
      {points.map((point, index) => (
        <Marker key={index} latitude={point.lat} longitude={point.lng} anchor="center">
          <span className="bg-fg block size-2.5 rounded-full border-2 border-white shadow" />
        </Marker>
      ))}
    </>
  );
}

/**
 * Draw where a hotspot's pins drop: a circle, a rectangle or any shape, on the
 * portal's map. The drawing is stored in the portal's usual format (see
 * @actiontokens/geo/map-geometry). `drops` shows recent spots for context.
 */
export function AreaDraw({
  value,
  onChange,
  drops = [],
  className,
}: {
  value: DrawnArea | null;
  onChange: (next: DrawnArea | null) => void;
  drops?: { latitude: number; longitude: number }[];
  className?: string;
}) {
  const map = useRef<MapRef>(null);
  const [shape, setShape] = useState<AreaShape>(value?.shape ?? "circle");
  const draw = useAreaDrawing(map, shape, (feature) => onChange({ shape, feature }), {
    keys: true,
    onCancel: () => draw.reset(),
  });
  const { points, drawing, draftShape, click, move, reset } = draw;

  // Open on the drawn area when editing.
  const initialBounds = useMemo(() => (value ? areaBounds([value.feature]) : null), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (initialBounds || value) return;
    navigator.geolocation?.getCurrentPosition((position) =>
      map.current?.flyTo({
        center: [position.coords.longitude, position.coords.latitude],
        zoom: 13,
        duration: 600,
      }),
    );
  }, [initialBounds, value]);

  const committed = value ? toMapboxFeature(value.feature) : null;
  const message = drawMessage(draw);

  if (!MAPBOX_TOKEN)
    return (
      <div className="bg-surface-2 text-fg-muted grid h-72 place-items-center rounded-xl border p-6 text-center text-sm">
        <span className="grid justify-items-center gap-2">
          <MapPinOff className="size-6" />
          Add a Mapbox token (NEXT_PUBLIC_MAPBOX_API) to draw hotspots.
        </span>
      </div>
    );

  return (
    <div className={cn("grid gap-3", className)}>
      <div role="radiogroup" aria-label="Area shape" className="flex flex-wrap gap-2">
        {SHAPES.map((entry) => (
          <button
            key={entry.value}
            type="button"
            role="radio"
            aria-checked={shape === entry.value}
            onClick={() => {
              setShape(entry.value);
              reset();
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
              shape === entry.value
                ? "bg-primary text-primary-foreground border-fg"
                : "bg-surface hover:bg-surface-2 text-fg-muted hover:text-fg",
            )}
          >
            <entry.icon className="size-4" /> {entry.label}
          </button>
        ))}
      </div>

      <div className="bg-surface-2 relative h-80 overflow-hidden rounded-xl border">
        <BaseMap
          ref={map}
          initialViewState={
            initialBounds
              ? { bounds: initialBounds, fitBoundsOptions: { padding: 40 } }
              : { ...WORLD_VIEW, zoom: 2 }
          }
          cursor="crosshair"
          doubleClickZoom={false}
          onClick={(event) => click({ lat: event.lngLat.lat, lng: event.lngLat.lng })}
          onDblClick={() => draw.doubleClick()}
          onMouseMove={(event) => move({ lat: event.lngLat.lat, lng: event.lngLat.lng })}
        >
          {committed && !drawing && (
            <Source id="hotspot-area" type="geojson" data={committed}>
              <Layer
                id="hotspot-area-fill"
                type="fill"
                paint={{ "fill-color": AREA, "fill-opacity": 0.2 }}
              />
              <Layer
                id="hotspot-area-line"
                type="line"
                paint={{ "line-color": AREA, "line-width": 2.5 }}
              />
            </Source>
          )}
          <DrawingLayers draftShape={draftShape} points={points} />
          <DrawStartMarker draw={draw} />
          {drops.map((spot, index) => (
            <Marker
              key={`drop-${index}`}
              latitude={spot.latitude}
              longitude={spot.longitude}
              anchor="center"
            >
              <span className="bg-primary-strong block size-2 rounded-full border border-white" />
            </Marker>
          ))}
        </BaseMap>
        <PlaceSearch
          className="absolute inset-x-2 top-2 z-10 sm:right-auto sm:w-72"
          onSelect={(place) =>
            map.current?.flyTo({ center: [place.lng, place.lat], zoom: 14, duration: 600 })
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <p
          className={cn(
            "mr-auto text-xs",
            message.tone === "bad"
              ? "text-danger"
              : message.tone === "warn"
                ? "text-warning"
                : "text-fg-muted",
          )}
        >
          {drawing || !value
            ? message.text
            : `${SHAPES.find((entry) => entry.value === value.shape)?.label} drawn · reaches ${areaReach(value.feature)} from its centre. Draw again to replace it.`}
        </p>
        {drawing ? (
          <DrawButtons draw={draw} onCancel={reset} />
        ) : (
          value && (
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)}>
              <RotateCcw /> Clear
            </Button>
          )
        )}
      </div>
    </div>
  );
}
