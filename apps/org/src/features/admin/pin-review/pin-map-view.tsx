"use client";

import { Check, ExternalLink, List, Loader2, MapPinOff, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import type { MapRef } from "react-map-gl/mapbox";

import { Button } from "@actiontokens/ui/components/button";
import { Label } from "@actiontokens/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@actiontokens/ui/components/select";
import { Switch } from "@actiontokens/ui/components/switch";
import { StatusPill } from "@actiontokens/ui/patterns/status-pill";

import { formatWhen } from "~/lib/datetime";
import { api, type RouterOutputs } from "~/trpc/react";

import { BaseMap, WORLD_VIEW } from "../../pins/map-kit/base-map";
import { LayerTag } from "../../pins/layers/layer-tag";
import { PinLegend, PinMarker, pinIcon, pinLook } from "../../pins/map-kit/pin-marker";
import { PlaceSearch } from "../../pins/map-kit/place-search";
import { MAPBOX_TOKEN } from "../../pins/mapbox";
import { STATUS } from "../../pins/pins-view";
import { messageOf } from "../murals/model";

type Pin = RouterOutputs["admin"]["pins"]["map"]["pins"][number];
const EVERYONE = "__all";

/**
 * Admin › Pin review › Map: every artist's pins on one map (or one artist's),
 * the way the artist sees theirs. Click a pin to approve, reject or open its artist.
 */
export function PinMapView() {
  const map = useRef<MapRef>(null);
  const framedFor = useRef<string | null>(null);
  const [organizationId, setArtistId] = useState(EVERYONE);
  const [includeEnded, setIncludeEnded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const artists = api.admin.artists.list.useQuery({}, { refetchOnWindowFocus: false });
  const pins = api.admin.pins.map.useQuery(
    { organizationId: organizationId === EVERYONE ? undefined : organizationId, includeEnded },
    { refetchOnWindowFocus: false },
  );
  const selected = pins.data?.pins.find((pin) => pin.id === selectedId) ?? null;

  // Frame the pins shown whenever the artist changes.
  useEffect(() => {
    if (!pins.data || !map.current || framedFor.current === organizationId) return;
    framedFor.current = organizationId;
    const points = pins.data.pins.flatMap((pin) =>
      pin.spotPoints.map((spot) => [spot.longitude, spot.latitude] as const),
    );
    if (points.length === 0) return;
    const lngs = points.map((point) => point[0]);
    const lats = points.map((point) => point[1]);
    map.current.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 90, maxZoom: 15, duration: 600 },
    );
  }, [pins.data, organizationId]);

  if (!MAPBOX_TOKEN)
    return (
      <div className="grid min-h-[60dvh] place-items-center p-6 text-center">
        <div className="grid max-w-sm justify-items-center gap-3">
          <MapPinOff className="text-fg-faint size-8" />
          <h1 className="display text-2xl">The map isn&apos;t switched on</h1>
          <p className="text-fg-muted text-sm">Add a Mapbox token (NEXT_PUBLIC_MAPBOX_API).</p>
        </div>
      </div>
    );

  return (
    // The portal pads its pages; cancel that so the map fills the page. The canvas runs on
    // under the floating sidebar, which shows it blurred; the overlays stay beside it.
    <div className="relative -mt-4 -mb-24 h-[calc(100dvh-3.75rem-env(safe-area-inset-bottom))] sm:mt-0 sm:-mb-12 sm:h-dvh">
      <div className="absolute inset-y-0 right-0 left-0 sm:-left-(--side-w)">
        <BaseMap
          ref={map}
          controlsPosition="bottom-left"
          initialViewState={WORLD_VIEW}
          onClick={() => setSelectedId(null)}
        >
          {pins.data?.pins.flatMap((pin) =>
            pin.spotPoints.map((spot) => (
              <PinMarker
                key={`${pin.id}:${spot.id}`}
                lat={spot.latitude}
                lng={spot.longitude}
                glyph={pin.look}
                icon={pinIcon(pin.type)}
                count={spot.collected}
                label={`${pin.title} (${pin.artist.name})`}
                look={pinLook(pin.status)}
                selected={pin.id === selectedId}
                onClick={() => setSelectedId(pin.id)}
              />
            )),
          )}
        </BaseMap>
      </div>

      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex flex-wrap items-start gap-2 lg:inset-x-4 lg:top-4">
        <PlaceSearch
          className="pointer-events-auto w-full sm:w-72"
          onSelect={(place) =>
            map.current?.flyTo({ center: [place.lng, place.lat], zoom: 14, duration: 700 })
          }
        />
        <Select value={organizationId} onValueChange={setArtistId}>
          <SelectTrigger
            className="bg-surface pointer-events-auto h-10 w-full shadow-sm sm:w-56"
            aria-label="Artist"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={EVERYONE}>Every artist</SelectItem>
            {artists.data
              ?.filter((artist) => artist.pins > 0)
              .map((artist) => (
                <SelectItem key={artist.id} value={artist.id}>
                  {artist.name} · {artist.pins}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <div className="bg-surface pointer-events-auto flex h-10 items-center gap-2 rounded-lg border px-3 shadow-sm">
          <Switch id="show-ended" checked={includeEnded} onCheckedChange={setIncludeEnded} />
          <Label htmlFor="show-ended" className="text-xs font-medium">
            Show ended
          </Label>
        </div>
        <Button asChild variant="outline" className="pointer-events-auto ml-auto shadow-sm">
          <Link href="/admin/pins">
            <List /> <span className="hidden sm:inline">Pin review</span>
          </Link>
        </Button>
      </div>

      {pins.data && (
        <p className="bg-surface/95 pointer-events-none absolute bottom-24 left-1/2 z-10 -translate-x-1/2 rounded-full border px-4 py-1.5 text-xs font-medium shadow sm:bottom-8">
          {pins.data.pins.length.toLocaleString()} {pins.data.pins.length === 1 ? "pin" : "pins"}
          {pins.data.capped && " (the newest; pick an artist to see theirs)"}
        </p>
      )}
      <PinLegend className="absolute bottom-8 left-14 z-10 hidden sm:block" />
      {selected && <PinCard pin={selected} onClose={() => setSelectedId(null)} />}
    </div>
  );
}

function PinCard({ pin, onClose }: { pin: Pin; onClose: () => void }) {
  const utils = api.useUtils();
  const decide = api.admin.pins.decide.useMutation({
    onSuccess: (result) => {
      toast.success(
        result.approval === "APPROVED"
          ? "Approved: fans can see it"
          : result.approval === "REJECTED"
            ? "Pin rejected"
            : "Moved back to review",
      );
      void utils.admin.pins.invalidate();
    },
    onError: (error) => toast.error(messageOf(error)),
  });
  const set = (approval: "APPROVED" | "REJECTED" | "PENDING") =>
    decide.mutate({ pinIds: [pin.id], approval });
  const deciding = (approval: string) => decide.isPending && decide.variables.approval === approval;
  const status = STATUS[pin.status];
  const decided = pin.status !== "IN_REVIEW";

  return (
    <section
      className="bg-surface border-fg/10 absolute inset-x-3 bottom-3 z-20 grid gap-3 rounded-[1.4rem] border-2 p-4 shadow-lg sm:inset-x-auto sm:top-20 sm:right-4 sm:bottom-auto sm:w-80"
      aria-label={pin.title}
      onClick={(event) => event.stopPropagation()}
    >
      {pin.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- pin images come from our storage
        <img src={pin.imageUrl} alt="" className="aspect-video w-full rounded-lg object-cover" />
      )}
      <div className="flex items-start justify-between gap-2">
        <h2 className="display min-w-0 text-2xl leading-snug">{pin.title}</h2>
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
      </div>
      <Link
        href={`/admin/artists/${pin.artist.id}`}
        className="text-fg-muted hover:text-fg inline-flex items-center gap-1 text-sm"
      >
        {pin.artist.name} <ExternalLink className="size-3" />
      </Link>
      <LayerTag layer={pin.layer} />
      <p className="text-fg-muted text-sm">
        {formatWhen(pin.startsAt)} to {formatWhen(pin.endsAt)} ·{" "}
        <span className="num">{pin.collected} collected</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {pin.status !== "NOT_APPROVED" && (
          <Button
            variant="outline"
            className="text-danger hover:text-danger"
            disabled={decide.isPending}
            onClick={() => set("REJECTED")}
          >
            {deciding("REJECTED") ? <Loader2 className="animate-spin" /> : <X />} Reject
          </Button>
        )}
        {(pin.status === "IN_REVIEW" || pin.status === "NOT_APPROVED") && (
          <Button disabled={decide.isPending} onClick={() => set("APPROVED")}>
            {deciding("APPROVED") ? <Loader2 className="animate-spin" /> : <Check />} Approve
          </Button>
        )}
        {decided && (
          <Button variant="ghost" disabled={decide.isPending} onClick={() => set("PENDING")}>
            {deciding("PENDING") ? <Loader2 className="animate-spin" /> : <RotateCcw />} Back to
            review
          </Button>
        )}
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </section>
  );
}
