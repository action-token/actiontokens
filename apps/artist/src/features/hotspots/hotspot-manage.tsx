"use client";

import { Loader2, Pause, Play, Zap } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@bandcoin/ui/components/button";
import { StatusPill } from "@bandcoin/ui/patterns/status-pill";

import { DeleteCard } from "~/components/delete-card";
import { formatWhen } from "~/lib/datetime";
import type { RouterOutputs } from "~/trpc/react";

import { HOTSPOT_STATUS } from "./status";
import { useHotspotActions } from "./use-hotspot-actions";

type Hotspot = RouterOutputs["hotspots"]["hotspot"];

/** Beside the form when editing: pause or resume, an extra drop now, recent drops, and remove. */
export function HotspotManage({ hotspot }: { hotspot: Hotspot }) {
  const router = useRouter();
  const { pause, dropNow, remove } = useHotspotActions(() => router.push("/hotspots"));
  const status = HOTSPOT_STATUS[hotspot.status];
  const ended = hotspot.status === "ENDED";
  const paused = hotspot.status === "PAUSED";

  return (
    <>
      <section className="bg-surface grid gap-3 rounded-[1.4rem] border-2 p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="display text-lg">Drops</h2>
          <StatusPill tone={status.tone}>{status.label}</StatusPill>
        </div>
        <p className="text-fg-muted text-sm">
          {ended
            ? "No more drops: the end date has passed. Move it later to start again."
            : paused
              ? "Paused. Nothing drops until you resume."
              : hotspot.nextDropAt
                ? `Next drop ${formatWhen(hotspot.nextDropAt)}.`
                : "No more drops before the end date."}
        </p>
        <div className="flex flex-wrap gap-2">
          {!ended && (
            <Button
              type="button"
              variant="outline"
              disabled={pause.isPending}
              onClick={() => pause.mutate({ hotspotId: hotspot.id, paused: !paused })}
            >
              {pause.isPending ? (
                <Loader2 className="animate-spin" />
              ) : paused ? (
                <Play />
              ) : (
                <Pause />
              )}
              {paused ? "Resume" : "Pause"}
            </Button>
          )}
          {!ended && (
            <Button
              type="button"
              variant="outline"
              disabled={dropNow.isPending}
              onClick={() => dropNow.mutate({ hotspotId: hotspot.id })}
            >
              {dropNow.isPending ? <Loader2 className="animate-spin" /> : <Zap />} Drop now
            </Button>
          )}
        </div>
        {hotspot.drops.length > 0 && (
          <ul className="divide-y border-t text-sm">
            {hotspot.drops.map((drop) => (
              <li key={drop.id} className="flex items-center justify-between gap-2 py-2">
                <Link href={`/pins/${drop.id}`} className="hover:underline">
                  {formatWhen(drop.startsAt)}
                </Link>
                <span className="text-fg-muted text-xs">
                  {drop.spots} spot{drop.spots === 1 ? "" : "s"}
                  {drop.claimLimit > 0
                    ? ` · ${drop.claimLimit - drop.claimsLeft} of ${drop.claimLimit} collected`
                    : ""}
                  {drop.isHidden ? " · hidden" : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <DeleteCard
        title="Remove this hotspot"
        confirmTitle={`Remove ${hotspot.title}?`}
        description="It stops dropping, and it and every pin it dropped leave the map. What fans collected stays theirs."
        busy={remove.isPending}
        onDelete={() => remove.mutate({ hotspotId: hotspot.id })}
      />
    </>
  );
}
