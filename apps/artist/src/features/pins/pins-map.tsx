"use client";

import { Hexagon, MapPinOff, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Marker, type MapRef } from "react-map-gl/mapbox";

import { shapeScale } from "@actiontokens/ar-core/shape-size";
import { PinGlyph } from "@actiontokens/ui/patterns/pin-glyph";

import { toMapboxFeature } from "@actiontokens/geo/map-geometry";
import { Button } from "@actiontokens/ui/components/button";
import { Label } from "@actiontokens/ui/components/label";
import { Switch } from "@actiontokens/ui/components/switch";
import { cn } from "@actiontokens/ui/lib/cn";
import { ConfirmDialog } from "@actiontokens/ui/patterns/confirm-dialog";

import { AgentChat } from "~/features/agent/agent-chat";
import { AgentMapLayer } from "~/features/agent/agent-map";
import { setAreaDraft } from "~/features/hotspots/area-draft";
import {
  SHAPES,
  DrawButtons,
  DrawingLayers,
  drawMessage,
  DrawStartMarker,
  useAreaDrawing,
  type AreaShape,
} from "~/features/hotspots/area-draw";
import { HotspotCard } from "~/features/hotspots/hotspot-card";
import { EditHotspotView, NewHotspotView } from "~/features/hotspots/hotspot-pages";
import { DraftAreaLayer, HOTSPOT_FILL, HotspotLayer } from "~/features/hotspots/hotspot-layer";
import { api } from "~/trpc/react";

import { FormCardProvider } from "@actiontokens/ui/patterns/form-card";

import { LayerSwitcher } from "./layers/layer-switcher";
import { type MapFormCard, useMapFormCard } from "./map-form-card";
import { onSelectedLayer } from "./layers/layer-view";
import { useSelectedLayer } from "./layers/selected-layer";
import { BaseMap, WORLD_VIEW } from "./map-kit/base-map";
import { ClusterBillboard } from "./map-kit/cluster-billboard";
import { PinLegend, PinMarker, pinIcon, pinLook } from "./map-kit/pin-marker";
import {
  buildSpotIndex,
  clusterExpansionZoom,
  itemsInView,
  type SpotIndex,
} from "./map-kit/spot-clusters";
import { PlaceSearch } from "./map-kit/place-search";
import { MAPBOX_TOKEN } from "./mapbox";
import { InViewPanel, type InViewPin } from "./in-view-panel";
import { PinCard } from "./pin-card";
import { EditPinView, NewPinView } from "./pin-pages";

type Placing = { mode: "copy" | "move"; spotId: string };
type Bounds = { north: number; south: number; east: number; west: number };

/**
 * Pins › Map. Your pins and hotspot areas as fans find them: click the map to
 * start a pin there, draw an area to start a hotspot, click a pin or an area
 * to see it and act on it. Managing pins as a list is its own page
 * (/pins/manage, in the sidebar). On Admin › All maps it is an artist's map an admin works on as
 * them, with `toolbarStart` holding the artist picker.
 */
export function PinsMap({ toolbarStart }: { toolbarStart?: ReactNode } = {}) {
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
  const [zoom, setZoom] = useState(0);
  const pins = api.pins.pins.useQuery();
  const allHotspots = api.hotspots.hotspots.useQuery();
  // The layer you work in, plus any switched on with an eye; what is made goes in the layer picked.
  const layer = useSelectedLayer((state) => state.id);
  const layersShown = useSelectedLayer((state) => state.shown);
  const layerQuery = layer ? `?layer=${layer}` : "";
  const hotspots = useMemo(
    () => ({
      ...allHotspots,
      data: allHotspots.data?.filter((item) => onSelectedLayer(item.layerId, layer, layersShown)),
    }),
    [allHotspots, layer, layersShown],
  );

  const draw = useAreaDrawing(
    map,
    shape,
    (feature) => {
      setAreaDraft({ shape, feature });
      stopDrawing();
      // The new hotspot opens as a card beside the map, keeping the area just drawn.
      setSelected(null);
      setHotspotId(null);
      useMapFormCard.getState().open({ kind: "newHotspot" });
    },
    // Esc cancels, Enter finishes, Backspace undoes, while the drawing tool is open.
    { keys: drawing, onCancel: () => stopDrawing() },
  );
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
    () =>
      pins.data?.filter(
        (pin) =>
          (showEnded || pin.status !== "ENDED") &&
          onSelectedLayer(pin.layer?.id, layer, layersShown),
      ) ?? [],
    [pins.data, showEnded, layer, layersShown],
  );
  const pin = shown.find((item) => item.id === selected?.pinId) ?? null;

  // A pin can have dozens of spots; drawing each as its own marker froze the page. Group them into
  // clusters (as the AR map does) and draw only what's in view, never more than a few hundred.
  const spotIndex = useMemo<SpotIndex>(
    () =>
      buildSpotIndex(
        shown.flatMap((item) =>
          item.spotPoints.map((spot) => ({
            pinId: item.id,
            spotId: spot.id,
            latitude: spot.latitude,
            longitude: spot.longitude,
            image: item.imageUrl,
          })),
        ),
      ),
    [shown],
  );
  const spotLookup = useMemo(
    () =>
      new Map(shown.flatMap((item) => item.spotPoints.map((spot) => [spot.id, { item, spot }]))),
    [shown],
  );
  const onScreen = useMemo(
    () =>
      bounds ? itemsInView(spotIndex, bounds, zoom, { selectedSpotId: selected?.spotId }) : [],
    [spotIndex, bounds, zoom, selected?.spotId],
  );
  const hotspot = hotspots.data?.find((item) => item.id === hotspotId) ?? null;
  const formCard = useMapFormCard((state) => state.card);
  const cardAt = useMapFormCard((state) => state.at);
  const draftPin = useMapFormCard((state) => state.draft);
  const draftArea = useMapFormCard((state) => state.draftArea);
  // Leaving the map closes the card.
  useEffect(() => () => useMapFormCard.getState().close(), []);

  const refreshBounds = () => {
    const box = map.current?.getBounds();
    if (box)
      setBounds({
        north: box.getNorth(),
        south: box.getSouth(),
        east: box.getEast(),
        west: box.getWest(),
      });
    setZoom(map.current?.getZoom() ?? 0);
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
          <h1 className="display text-2xl">The map isn&apos;t switched on</h1>
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
  const message = drawMessage(draw);

  return (
    // The portal pads its pages; cancel that so the map fills the page. The canvas runs on
    // under the floating sidebar, which shows it blurred; the overlays stay beside it.
    <div className="relative -mt-4 -mb-24 h-[calc(100dvh-3.75rem-env(safe-area-inset-bottom))] sm:mt-0 sm:-mb-12 sm:h-dvh">
      <div className="absolute inset-y-0 right-0 left-0 sm:-left-(--side-w)">
        <BaseMap
          ref={map}
          // Bottom-right, above the "Ask the map" button.
          controlsPosition="bottom-right"
          controlsInset="4.5rem"
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
          onDblClick={() => drawing && draw.doubleClick()}
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
            // A click starts a new pin there, or moves the pin of the card that is open.
            const open = useMapFormCard.getState();
            if (open.card?.kind === "newPin") open.moveTo(at);
            else if (!open.card) open.open({ kind: "newPin" }, at);
          }}
        >
          {hotspots.data && <HotspotLayer hotspots={hotspots.data} />}
          {!drawing &&
            onScreen.map((entry) => {
              if (entry.kind === "cluster")
                return (
                  <ClusterBillboard
                    key={`cluster:${entry.id}`}
                    latitude={entry.latitude}
                    longitude={entry.longitude}
                    count={entry.count}
                    images={entry.images}
                    onOpen={() =>
                      map.current?.easeTo({
                        center: [entry.longitude, entry.latitude],
                        zoom: clusterExpansionZoom(spotIndex, entry.id),
                        duration: 500,
                      })
                    }
                  />
                );
              const found = spotLookup.get(entry.spotId);
              if (!found) return null;
              const { item, spot } = found;
              return (
                <PinMarker
                  key={`${item.id}:${spot.id}`}
                  lat={spot.latitude}
                  lng={spot.longitude}
                  glyph={item.look}
                  icon={pinIcon(item.type)}
                  count={spot.collected}
                  label={item.title}
                  look={pinLook(item.status)}
                  selected={spot.id === selected?.spotId}
                  onClick={() => selectPin(item.id, spot.id)}
                />
              );
            })}
          {/* The pin in the card, where it was clicked, as its Look tab has it so far. */}
          {!drawing &&
            formCard &&
            cardAt &&
            (formCard.kind === "newPin" || formCard.kind === "editPin") && (
              <Marker
                latitude={cardAt.lat}
                longitude={cardAt.lng}
                anchor={draftPin?.anchor ?? "bottom"}
              >
                {draftPin ? (
                  <span className="relative block" aria-label="Where the pin goes" role="img">
                    <span
                      className="bg-primary/25 absolute inset-1 animate-ping rounded-full"
                      aria-hidden
                    />
                    <PinGlyph
                      path={draftPin.path}
                      size={Math.round(48 * shapeScale(draftPin.path))}
                      color={draftPin.color}
                      defaultColor="var(--color-surface-2)"
                      imageUrl={draftPin.imageUrl}
                      imageFit={draftPin.imageFit}
                      ringColor="var(--color-primary)"
                      ringWidth={3.5}
                      badge={draftPin.badge}
                    />
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className="bg-primary border-surface block size-5 rounded-full border-[3px] shadow-lg ring-2 ring-black/20"
                  />
                )}
              </Marker>
            )}
          {!drawing && <AgentMapLayer />}
          {drawing && <DrawingLayers draftShape={draw.draftShape} points={draw.points} />}
          {drawing && <DrawStartMarker draw={draw} />}
          {/* The new hotspot's area, kept on the map while its card is open. */}
          {!drawing && formCard?.kind === "newHotspot" && draftArea && (
            <DraftAreaLayer feature={draftArea.feature} />
          )}
        </BaseMap>
      </div>

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
          <p
            className={cn(
              "bg-surface pointer-events-auto rounded-lg border px-3 py-2 text-xs shadow-sm",
              message.tone === "bad" && "text-danger",
              message.tone === "warn" && "text-warning",
            )}
          >
            {message.text}
          </p>
          <DrawButtons
            draw={draw}
            onCancel={stopDrawing}
            className="bg-surface pointer-events-auto ml-auto rounded-2xl border p-1.5 shadow-sm"
          />
        </div>
      ) : (
        <div
          className={cn(
            "pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-start gap-2 lg:inset-x-4 lg:top-4",
            // A form card takes the left side: the toolbar moves over.
            formCard && "lg:left-[26rem]",
          )}
        >
          {toolbarStart}
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
            <LayerSwitcher />
            {/* With a form card open the create buttons step aside; the layer switcher stays. */}
            {!formCard && (
              <>
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
                <Button
                  className="shadow-sm"
                  onClick={() => {
                    setSelected(null);
                    setHotspotId(null);
                    setPlacing(null);
                    useMapFormCard.getState().open({ kind: "newPin" });
                  }}
                >
                  <Plus /> <span className="hidden sm:inline">New pin</span>
                </Button>
              </>
            )}
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

      {/* Right side, under the toolbar; the pin and hotspot cards take the same spot, so it steps aside for them. */}
      {!drawing && !formCard && !(pin && selected) && !hotspot && (
        <InViewPanel
          className="absolute top-16 right-4 z-10"
          items={inView}
          selectedId={selected?.pinId ?? null}
          onSelect={(item) => {
            flyTo(item.latitude, item.longitude, 15);
            selectPin(item.pin.id, item.spotId);
          }}
        />
      )}
      {!drawing && !formCard && (
        <PinLegend className="absolute bottom-8 left-4 z-10 hidden sm:block" />
      )}

      {!drawing && <AgentChat />}

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

      {/* A pin or hotspot form as a floating card (left, beside the map) */}
      {formCard && !drawing && (
        <>
          {formCard.kind === "newPin" && (
            <div className="bg-primary text-primary-foreground pointer-events-none absolute bottom-6 left-1/2 z-10 hidden -translate-x-1/2 rounded-full px-4 py-1.5 text-xs font-semibold shadow-lg lg:block">
              {cardAt ? "Click the map to move the pin" : "Click the map where the pin goes"}
            </div>
          )}
          <div className="absolute inset-x-3 bottom-3 z-20 flex max-h-[62%] lg:inset-x-auto lg:top-4 lg:bottom-4 lg:left-4 lg:max-h-none">
            <MapFormCardHost card={formCard} at={cardAt} layerId={layer} />
          </div>
        </>
      )}

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

/**
 * The form card's content: the same forms as /pins/new, /pins/[id], /hotspots/new and
 * /hotspots/[id], in card mode (`@actiontokens/ui/patterns/form-card`). Keyed per form (and per
 * restart), so each opens fresh.
 */
function MapFormCardHost({
  card,
  at,
  layerId,
}: {
  card: MapFormCard;
  at: { lat: number; lng: number } | null;
  layerId: string | null;
}) {
  const close = useMapFormCard((state) => state.close);
  const [restarts, setRestarts] = useState(0);
  const value = useMemo(
    () => ({
      onClose: close,
      onDone: close,
      at,
      layerId,
      restart: () => setRestarts((count) => count + 1),
    }),
    [close, at, layerId],
  );
  const key = `${card.kind}${"id" in card ? card.id : ""}:${restarts}`;
  return (
    <FormCardProvider value={value}>
      {card.kind === "newPin" ? (
        <NewPinView key={key} />
      ) : card.kind === "editPin" ? (
        <EditPinView key={key} pinId={card.id} />
      ) : card.kind === "newHotspot" ? (
        <NewHotspotView key={key} />
      ) : (
        <EditHotspotView key={key} hotspotId={card.id} />
      )}
    </FormCardProvider>
  );
}
