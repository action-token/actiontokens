"use client";

import { Hexagon, MapPinOff, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import type { MapRef } from "react-map-gl/mapbox";

import { toMapboxFeature } from "@bandcoin/geo/map-geometry";
import { Button } from "@bandcoin/ui/components/button";
import { Label } from "@bandcoin/ui/components/label";
import { Switch } from "@bandcoin/ui/components/switch";
import { cn } from "@bandcoin/ui/lib/cn";
import { ConfirmDialog } from "@bandcoin/ui/patterns/confirm-dialog";

import { setAreaDraft } from "~/features/hotspots/area-draft";
import {
  SHAPES,
  DrawingLayers,
  useAreaDrawing,
  type AreaShape,
} from "~/features/hotspots/area-draw";
import { HotspotCard } from "~/features/hotspots/hotspot-card";
import { HOTSPOT_FILL, HotspotLayer } from "~/features/hotspots/hotspot-layer";
import { api } from "~/trpc/react";

import { BaseMap, WORLD_VIEW } from "./map-kit/base-map";
import { PinLegend, PinMarker, pinIcon, pinLook } from "./map-kit/pin-marker";
import { PlaceSearch } from "./map-kit/place-search";
import { MAPBOX_TOKEN } from "./mapbox";
import { InViewPanel, type InViewPin } from "./in-view-panel";
import { PinCard } from "./pin-card";

type Placing = { mode: "copy" | "move"; spotId: string };
type Bounds = { north: number; south: number; east: number; west: number };

/**
 * Pins › Map. Your pins and hotspot areas as fans find them: click the map to
 * start a pin there, draw an area to start a hotspot, click a pin or an area
 * to see it and act on it. Managing pins as a list is its own page
 * (/pins/manage, in the sidebar).
 */
export function PinsMap() {
  const router = useRouter();
  const utils = api.useUtils();
  const map = useRef<MapRef>(null);
  const framed = useRef(false);
  const [ready, setReady] = useState(false);
  const [showEnded, setShowEnded] = useState(false);
  const [selected, setSelected] = useState<{ pinId: string; spotId: string } | null>(null);
  const [hotspotId, setHotspotId] = useState<string | null>(null);
  const [placing, setPlacing] = useState<Placing | null>(null);
  const [target, setTarget] = useState<{ lat: number; lng: number } | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [shape, setShape] = useState<AreaShape>("polygon");
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const pins = api.pins.pins.useQuery();
  const hotspots = api.hotspots.hotspots.useQuery();

  const draw = useAreaDrawing(map, shape, (feature) => {
    setAreaDraft({ shape, feature });
    router.push("/hotspots/new");
  });
  const stopDrawing = () => {
    draw.reset();
    setDrawing(false);
  };

  const placed = () => {
    setTarget(null);
    setPlacing(null);
    void utils.pins.invalidate();
  };
  const copy = api.pins.addSpot.useMutation({
    onSuccess: () => {
      toast.success("Spot copied");
      placed();
    },
    onError: (error) => toast.error(error.message),
  });
  const move = api.pins.moveSpot.useMutation({
    onSuccess: () => {
      toast.success("Spot moved");
      placed();
    },
    onError: (error) => toast.error(error.message),
  });

  const shown = useMemo(
    () => pins.data?.filter((pin) => showEnded || pin.status !== "ENDED") ?? [],
    [pins.data, showEnded],
  );
  const pin = shown.find((item) => item.id === selected?.pinId) ?? null;
  const hotspot = hotspots.data?.find((item) => item.id === hotspotId) ?? null;

  const refreshBounds = () => {
    const box = map.current?.getBounds();
    if (box)
      setBounds({
        north: box.getNorth(),
        south: box.getSouth(),
        east: box.getEast(),
        west: box.getWest(),
      });
  };
  const inView = useMemo<InViewPin[]>(() => {
    if (!bounds) return [];
    return shown.flatMap((item) => {
      const here = item.spotPoints.filter(
        (spot) =>
          spot.latitude <= bounds.north &&
          spot.latitude >= bounds.south &&
          spot.longitude <= bounds.east &&
          spot.longitude >= bounds.west,
      );
      const first = here[0];
      return first
        ? [
            {
              pin: item,
              spotId: first.id,
              latitude: first.latitude,
              longitude: first.longitude,
              inView: here.length,
            },
          ]
        : [];
    });
  }, [shown, bounds]);

  // Start on the artist's own pins and hotspots, else near where they are.
  useEffect(() => {
    if (framed.current || !ready || pins.isPending || hotspots.isPending || !map.current) return;
    framed.current = true;
    const points = [
      ...(pins.data ?? [])
        .filter((item) => item.status !== "ENDED")
        .flatMap((item) => item.spotPoints.map((spot) => [spot.longitude, spot.latitude] as const)),
      ...(hotspots.data ?? [])
        .filter((item) => item.status !== "ENDED")
        .flatMap(
          (item) =>
            toMapboxFeature(
              item.geoJson as Parameters<typeof toMapboxFeature>[0],
            )?.geometry.coordinates[0]?.map(([lng, lat]) => [lng!, lat!] as const) ?? [],
        ),
    ];
    if (points.length > 0) {
      const lngs = points.map((point) => point[0]);
      const lats = points.map((point) => point[1]);
      map.current.fitBounds(
        [
          [Math.min(...lngs), Math.min(...lats)],
          [Math.max(...lngs), Math.max(...lats)],
        ],
        { padding: 90, maxZoom: 15, duration: 0 },
      );
    } else {
      navigator.geolocation?.getCurrentPosition((position) =>
        map.current?.flyTo({
          center: [position.coords.longitude, position.coords.latitude],
          zoom: 12,
          duration: 800,
        }),
      );
    }
  }, [ready, pins.isPending, pins.data, hotspots.isPending, hotspots.data]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="grid min-h-[60dvh] place-items-center p-6">
        <div className="grid max-w-sm justify-items-center gap-3 text-center">
          <MapPinOff className="text-fg-faint size-8" />
          <h1 className="display text-xl">The map isn&apos;t switched on</h1>
          <p className="text-fg-muted text-sm">
            Add a Mapbox token (NEXT_PUBLIC_MAPBOX_API) to see your pins on the map. You can still
            manage them as a list.
          </p>
          <Button asChild>
            <Link href="/pins/manage">Manage pins</Link>
          </Button>
        </div>
      </div>
    );
  }

  const selectPin = (pinId: string, spotId: string) => {
    setHotspotId(null);
    setSelected({ pinId, spotId });
  };
  const flyTo = (lat: number, lng: number, zoom = 14) =>
    map.current?.flyTo({
      center: [lng, lat],
      zoom: Math.max(zoom, map.current.getZoom()),
      duration: 700,
    });

  const cardOpen = !drawing && !placing;
  const SHAPE_HINT = SHAPES.find((entry) => entry.value === shape)!.hint;

  return (
    // The portal pads its pages; cancel that so the map fills the space beside the sidebar.
    <div className="relative -mt-4 -mb-24 h-[calc(100dvh-3.75rem-env(safe-area-inset-bottom))] sm:mt-0 sm:-mb-12 sm:h-dvh">
      <BaseMap
        ref={map}
        controlsPosition="bottom-left"
        initialViewState={WORLD_VIEW}
        cursor={drawing ? "crosshair" : "pointer"}
        doubleClickZoom={!drawing}
        interactiveLayerIds={drawing ? [] : [HOTSPOT_FILL]}
        onLoad={() => {
          setReady(true);
          refreshBounds();
        }}
        onMoveEnd={refreshBounds}
        onMouseMove={(event) => draw.move({ lat: event.lngLat.lat, lng: event.lngLat.lng })}
        onClick={(event) => {
          const at = { lat: event.lngLat.lat, lng: event.lngLat.lng };
          if (drawing) return draw.click(at);
          if (placing) return setTarget(at);
          // An area under the click opens that hotspot; it must not also start a pin.
          const area = (event.features?.[0]?.properties as { id?: string } | undefined)?.id;
          if (area) {
            setSelected(null);
            return setHotspotId(area);
          }
          setSelected(null);
          setHotspotId(null);
          router.push(`/pins/new?lat=${at.lat.toFixed(6)}&lng=${at.lng.toFixed(6)}`);
        }}
      >
        {hotspots.data && <HotspotLayer hotspots={hotspots.data} />}
        {!drawing &&
          shown.flatMap((item) =>
            item.spotPoints.map((spot) => (
              <PinMarker
                key={`${item.id}:${spot.id}`}
                lat={spot.latitude}
                lng={spot.longitude}
                image={item.imageUrl}
                icon={pinIcon(item.type)}
                count={spot.collected}
                label={item.title}
                look={pinLook(item.status)}
                autoCollect={item.autoCollect}
                selected={spot.id === selected?.spotId}
                onClick={() => selectPin(item.id, spot.id)}
              />
            )),
          )}
        {drawing && <DrawingLayers draftShape={draw.draftShape} points={draw.points} />}
      </BaseMap>

      {drawing ? (
        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-start gap-2 lg:inset-x-4 lg:top-4">
          <div className="bg-surface pointer-events-auto flex flex-wrap items-center gap-1.5 rounded-2xl border p-1.5 shadow-sm">
            <div role="radiogroup" aria-label="Area shape" className="flex gap-1">
              {SHAPES.map((entry) => (
                <button
                  key={entry.value}
                  type="button"
                  role="radio"
                  aria-checked={shape === entry.value}
                  onClick={() => {
                    setShape(entry.value);
                    draw.reset();
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                    shape === entry.value
                      ? "bg-primary text-primary-foreground border-fg"
                      : "hover:bg-surface-2 text-fg-muted hover:text-fg border-transparent",
                  )}
                >
                  <entry.icon className="size-4" /> {entry.label}
                </button>
              ))}
            </div>
          </div>
          <p className="bg-surface pointer-events-auto rounded-lg border px-3 py-2 text-xs shadow-sm">
            {SHAPE_HINT}
          </p>
          <div className="pointer-events-auto ml-auto flex items-center gap-2">
            {shape === "polygon" && draw.points.length >= 3 && (
              <Button className="shadow-sm" onClick={draw.finishShape}>
                Finish shape
              </Button>
            )}
            <Button variant="outline" className="shadow-sm" onClick={stopDrawing}>
              <X /> Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-start gap-2 lg:inset-x-4 lg:top-4">
          <PlaceSearch
            className="pointer-events-auto w-full sm:w-80"
            onSelect={(place) => flyTo(place.lat, place.lng)}
          />
          <div className="bg-surface pointer-events-auto flex h-10 items-center gap-2 rounded-lg border px-3 shadow-sm">
            <Switch id="show-ended" checked={showEnded} onCheckedChange={setShowEnded} />
            <Label htmlFor="show-ended" className="text-xs font-medium">
              Show ended
            </Label>
          </div>
          <div className="pointer-events-auto ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              className="shadow-sm"
              onClick={() => {
                setSelected(null);
                setHotspotId(null);
                setPlacing(null);
                setDrawing(true);
              }}
            >
              <Hexagon /> <span className="hidden sm:inline">Draw hotspot</span>
            </Button>
            <Button asChild className="shadow-sm">
              <Link href="/pins/new">
                <Plus /> <span className="hidden sm:inline">New pin</span>
              </Link>
            </Button>
          </div>
        </div>
      )}

      {placing && (
        <div className="bg-primary text-primary-foreground absolute top-28 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full py-1.5 pr-1.5 pl-4 text-xs font-semibold shadow-lg sm:top-20">
          Click the map to {placing.mode === "move" ? "move the spot" : "place the copy"}
          <Button size="sm" variant="outline" onClick={() => setPlacing(null)}>
            Cancel
          </Button>
        </div>
      )}

      {pins.data?.length === 0 && !drawing && (
        <p className="bg-surface/95 pointer-events-none absolute bottom-24 left-1/2 z-10 -translate-x-1/2 rounded-full border px-4 py-1.5 text-xs font-medium shadow sm:bottom-8">
          Click anywhere on the map to drop your first pin
        </p>
      )}

      {!drawing && (
        <InViewPanel
          className="absolute top-16 left-4 z-10"
          items={inView}
          selectedId={selected?.pinId ?? null}
          onSelect={(item) => {
            flyTo(item.latitude, item.longitude, 15);
            selectPin(item.pin.id, item.spotId);
          }}
        />
      )}
      {!drawing && <PinLegend className="absolute bottom-8 left-14 z-10 hidden sm:block" />}

      {cardOpen && pin && selected && (
        <PinCard
          key={selected.spotId}
          pin={pin}
          spotId={selected.spotId}
          onPlace={(mode) => setPlacing({ mode, spotId: selected.spotId })}
          onClose={() => setSelected(null)}
        />
      )}
      {cardOpen && hotspot && <HotspotCard hotspot={hotspot} onClose={() => setHotspotId(null)} />}

      <ConfirmDialog
        open={target !== null && placing !== null}
        onOpenChange={(open) => !open && !copy.isPending && !move.isPending && setTarget(null)}
        title={placing?.mode === "move" ? "Move this spot here?" : "Put a copy of this spot here?"}
        description={
          placing?.mode === "move"
            ? "The spot goes to the place you clicked. Its QR code stays the same."
            : "The pin gets another spot at the place you clicked, with a QR code of its own."
        }
        confirmLabel={placing?.mode === "move" ? "Move here" : "Place here"}
        destructive={false}
        busy={copy.isPending || move.isPending}
        onConfirm={() => {
          if (!placing || !target) return;
          const input = { spotId: placing.spotId, latitude: target.lat, longitude: target.lng };
          if (placing.mode === "move") move.mutate(input);
          else copy.mutate(input);
        }}
      />
    </div>
  );
}
