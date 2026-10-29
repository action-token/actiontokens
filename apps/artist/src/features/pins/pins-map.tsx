"use client";

import { Gift, List, MapPinOff, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import type { MapRef } from "react-map-gl/mapbox";

import { Button } from "@bandcoin/ui/components/button";
import { Label } from "@bandcoin/ui/components/label";
import { Switch } from "@bandcoin/ui/components/switch";
import { StatusPill } from "@bandcoin/ui/patterns/status-pill";

import { formatWhen } from "~/lib/datetime";
import { api, type RouterOutputs } from "~/trpc/react";

import { BaseMap, WORLD_VIEW } from "./map-kit/base-map";
import { PinLegend, PinMarker, pinIcon, pinLook } from "./map-kit/pin-marker";
import { PlaceSearch } from "./map-kit/place-search";
import { MAPBOX_TOKEN } from "./mapbox";
import { STATUS } from "./pins-view";

type Pin = RouterOutputs["pins"]["pins"][number];

/**
 * Pins › Map. Your pins as they look to fans: click the map to start a pin
 * there, click a pin to see it, edit it or hide it. Managing them as a list is
 * its own page (/pins/manage).
 */
export function PinsMap() {
  const router = useRouter();
  const utils = api.useUtils();
  const map = useRef<MapRef>(null);
  const framed = useRef(false);
  const [showEnded, setShowEnded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pins = api.pins.pins.useQuery();
  const hide = api.pins.setPinHidden.useMutation({
    onSuccess: (_, input) => {
      toast.success(input.hidden ? "Pin hidden" : "Pin is live again");
      void utils.pins.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const shown = pins.data?.filter((pin) => showEnded || pin.status !== "ENDED") ?? [];
  const selected = shown.find((pin) => pin.id === selectedId) ?? null;

  // Start on the artist's own pins, else near where they are.
  useEffect(() => {
    if (framed.current || !pins.data || !map.current) return;
    framed.current = true;
    const points = pins.data
      .filter((pin) => pin.status !== "ENDED")
      .flatMap((pin) => pin.spotPoints.map((spot) => [spot.longitude, spot.latitude] as const));
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
  }, [pins.data]);

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

  return (
    // The portal pads its pages; cancel that so the map fills the space beside the sidebar.
    <div className="relative -mt-4 -mb-24 h-[calc(100dvh-3.75rem-env(safe-area-inset-bottom))] sm:mt-0 sm:-mb-12 sm:h-dvh">
      <BaseMap
        ref={map}
        controlsPosition="bottom-left"
        initialViewState={WORLD_VIEW}
        cursor="pointer"
        onClick={(event) => {
          setSelectedId(null);
          router.push(
            `/pins/new?lat=${event.lngLat.lat.toFixed(6)}&lng=${event.lngLat.lng.toFixed(6)}`,
          );
        }}
      >
        {shown.flatMap((pin) =>
          pin.spotPoints.map((spot) => (
            <PinMarker
              key={`${pin.id}:${spot.id}`}
              lat={spot.latitude}
              lng={spot.longitude}
              image={pin.imageUrl}
              icon={pinIcon(pin.type)}
              count={spot.collected}
              label={pin.title}
              look={pinLook(pin.status)}
              autoCollect={pin.autoCollect}
              selected={pin.id === selectedId}
              onClick={() => setSelectedId(pin.id)}
            />
          )),
        )}
      </BaseMap>

      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-start gap-2 lg:inset-x-4 lg:top-4">
        <PlaceSearch
          className="pointer-events-auto w-full sm:w-80"
          onSelect={(place) =>
            map.current?.flyTo({ center: [place.lng, place.lat], zoom: 14, duration: 700 })
          }
        />
        <div className="bg-surface pointer-events-auto flex h-10 items-center gap-2 rounded-lg border px-3 shadow-sm">
          <Switch id="show-ended" checked={showEnded} onCheckedChange={setShowEnded} />
          <Label htmlFor="show-ended" className="text-xs font-medium">
            Show ended
          </Label>
        </div>
        <div className="pointer-events-auto ml-auto flex items-center gap-2">
          <Button asChild variant="outline" className="shadow-sm">
            <Link href="/pins/manage">
              <List /> <span className="hidden sm:inline">Manage</span>
            </Link>
          </Button>
          <Button asChild className="shadow-sm">
            <Link href="/pins/new">
              <Plus /> <span className="hidden sm:inline">New pin</span>
            </Link>
          </Button>
        </div>
      </div>

      {pins.data?.length === 0 && (
        <p className="bg-surface/95 pointer-events-none absolute bottom-24 left-1/2 z-10 -translate-x-1/2 rounded-full border px-4 py-1.5 text-xs font-medium shadow sm:bottom-8">
          Click anywhere on the map to drop your first pin
        </p>
      )}

      <PinLegend className="absolute bottom-8 left-14 z-10 hidden sm:block" />
      {selected && (
        <PinCard
          pin={selected}
          busy={hide.isPending}
          onHide={() => hide.mutate({ pinId: selected.id, hidden: selected.status !== "HIDDEN" })}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function PinCard({
  pin,
  busy,
  onHide,
  onClose,
}: {
  pin: Pin;
  busy: boolean;
  onHide: () => void;
  onClose: () => void;
}) {
  const status = STATUS[pin.status];
  return (
    <section
      className="bg-surface border-fg/10 absolute inset-x-3 bottom-3 z-20 grid gap-3 rounded-[1.4rem] border-2 p-4 shadow-lg sm:inset-x-auto sm:top-20 sm:right-4 sm:bottom-auto sm:w-80"
      aria-label={pin.title}
      onClick={(event) => event.stopPropagation()}
    >
      {pin.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pin.imageUrl} alt="" className="aspect-video w-full rounded-lg object-cover" />
      )}
      <div className="flex items-start justify-between gap-2">
        <h2 className="display min-w-0 text-lg leading-snug">{pin.title}</h2>
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
      </div>
      <p className="text-fg-muted text-sm">
        {formatWhen(pin.startsAt)} to {formatWhen(pin.endsAt)}
      </p>
      <p className="text-fg-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="num">
          {pin.collected} collected{pin.claimLimit > 0 ? ` · ${pin.claimsLeft} left` : ""}
        </span>
        <span>
          {pin.spots} spot{pin.spots === 1 ? "" : "s"}
        </span>
        {pin.reward && (
          <span className="flex items-center gap-1">
            <Gift className="size-4" /> {pin.reward}
          </span>
        )}
      </p>
      <div className="flex gap-2">
        <Button asChild className="flex-1">
          <Link href={`/pins/${pin.id}`}>
            <Pencil /> Edit
          </Link>
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onHide}>
          {pin.status === "HIDDEN" ? "Show" : "Hide"}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </section>
  );
}
