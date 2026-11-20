"use client";

import { Loader2, Pause, Pencil, Play, X, Zap } from "lucide-react";

import { Button } from "@actiontokens/ui/components/button";
import { StatusPill } from "@actiontokens/ui/patterns/status-pill";

import { formatWhen } from "~/lib/datetime";
import type { RouterOutputs } from "~/trpc/react";

import { useMapFormCard } from "../pins/map-form-card";
import { HOTSPOT_STATUS } from "./status";
import { useHotspotActions } from "./use-hotspot-actions";

type Hotspot = RouterOutputs["hotspots"]["hotspots"][number];

/** A hotspot's area on the map: when it drops, and pause, drop now or edit it right there. */
export function HotspotCard({ hotspot, onClose }: { hotspot: Hotspot; onClose: () => void }) {
  const { pause, dropNow } = useHotspotActions();
  const status = HOTSPOT_STATUS[hotspot.status];
  const ended = hotspot.status === "ENDED";
  const paused = hotspot.status === "PAUSED";
  const every = hotspot.dropEveryDays === 1 ? "every day" : `every ${hotspot.dropEveryDays} days`;

  return (
    <section
      className="bg-surface border-fg/10 absolute inset-x-3 bottom-3 z-20 grid gap-3 rounded-[1.4rem] border-2 p-4 shadow-lg sm:inset-x-auto sm:top-20 sm:right-4 sm:bottom-auto sm:w-80"
      aria-label={hotspot.title}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="display min-w-0 text-2xl leading-snug">{hotspot.title}</h2>
        <div className="flex shrink-0 items-center gap-1">
          <StatusPill tone={status.tone}>{status.label}</StatusPill>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </div>
      </div>
      <p className="text-fg-muted text-sm">
        {hotspot.spotsPerDrop} spot{hotspot.spotsPerDrop === 1 ? "" : "s"} {every}, each lasting{" "}
        {hotspot.pinDurationDays} day{hotspot.pinDurationDays === 1 ? "" : "s"}
      </p>
      <p className="text-fg-faint text-xs">
        {formatWhen(hotspot.startsAt)} to {formatWhen(hotspot.endsAt)} · {hotspot.drops} drop
        {hotspot.drops === 1 ? "" : "s"} so far
        {hotspot.status === "ACTIVE" || hotspot.status === "SCHEDULED"
          ? hotspot.nextDropAt
            ? ` · next ${formatWhen(hotspot.nextDropAt)}`
            : " · no more drops"
          : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        {!ended && (
          <Button
            variant="outline"
            disabled={pause.isPending}
            onClick={() => pause.mutate({ hotspotId: hotspot.id, paused: !paused })}
          >
            {pause.isPending ? <Loader2 className="animate-spin" /> : paused ? <Play /> : <Pause />}
            {paused ? "Resume" : "Pause"}
          </Button>
        )}
        {!ended && (
          <Button
            variant="outline"
            disabled={dropNow.isPending}
            onClick={() => dropNow.mutate({ hotspotId: hotspot.id })}
          >
            {dropNow.isPending ? <Loader2 className="animate-spin" /> : <Zap />} Drop now
          </Button>
        )}
        <Button
          className="flex-1"
          onClick={() => {
            useMapFormCard.getState().open({ kind: "editHotspot", id: hotspot.id });
            onClose();
          }}
        >
          <Pencil /> Edit
        </Button>
      </div>
    </section>
  );
}
