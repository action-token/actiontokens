"use client";

import { Circle, Hexagon, Plus, Radar, RectangleHorizontal } from "lucide-react";
import Link from "next/link";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";
import { StatusPill } from "@bandcoin/ui/patterns/status-pill";

import { formatWhen } from "~/lib/datetime";
import { api, type RouterOutputs } from "~/trpc/react";

import { HOTSPOT_STATUS } from "./status";

type Hotspot = RouterOutputs["hotspots"]["hotspots"][number];

const SHAPE_ICON = { circle: Circle, rectangle: RectangleHorizontal, polygon: Hexagon } as const;

/** Hotspots: areas where pins drop on their own every few days. */
export function HotspotsView() {
  const hotspots = api.hotspots.hotspots.useQuery();
  const add = (
    <Button asChild>
      <Link href="/hotspots/new">
        <Plus /> New hotspot
      </Link>
    </Button>
  );

  return (
    <PageBody className="grid gap-6">
      <PageHeader
        eyebrow="Drops"
        title="Hotspots"
        back={{ href: "/pins", label: "Map & pins" }}
        description="Draw an area once; pins drop inside it every few days at random spots, until the end date."
        actions={hotspots.data && hotspots.data.length > 0 ? add : undefined}
      />
      {hotspots.isPending ? (
        <div className="grid gap-3">
          {[0, 1].map((key) => (
            <Skeleton key={key} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      ) : hotspots.isError ? (
        <ErrorState
          message="Couldn't load your hotspots."
          onRetry={() => void hotspots.refetch()}
        />
      ) : hotspots.data.length === 0 ? (
        <EmptyState
          icon={Radar}
          title="No hotspots yet"
          description="A hotspot keeps fans coming back: draw a neighbourhood or a park, and fresh pins drop there on a schedule."
          action={add}
        />
      ) : (
        <ul className="grid gap-3">
          {hotspots.data.map((hotspot) => (
            <HotspotCard key={hotspot.id} hotspot={hotspot} />
          ))}
        </ul>
      )}
    </PageBody>
  );
}

function HotspotCard({ hotspot }: { hotspot: Hotspot }) {
  const status = HOTSPOT_STATUS[hotspot.status];
  const Shape = SHAPE_ICON[hotspot.shape as keyof typeof SHAPE_ICON] ?? Hexagon;
  const every = hotspot.dropEveryDays === 1 ? "every day" : `every ${hotspot.dropEveryDays} days`;
  return (
    <li>
      <Link
        href={`/hotspots/${hotspot.id}`}
        className="bg-surface hover:bg-surface-2 grid gap-2 rounded-xl border p-4 transition-colors sm:p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="display flex min-w-0 items-center gap-2 text-2xl">
            <Shape className="text-primary-text size-4 shrink-0" />
            <span className="truncate">{hotspot.title}</span>
          </h3>
          <StatusPill tone={status.tone}>{status.label}</StatusPill>
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
      </Link>
    </li>
  );
}
