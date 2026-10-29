"use client";

import { Gift, Map as MapIcon, MapPin, Plus, Tag } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { cn } from "@bandcoin/ui/lib/cn";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";
import { StatusPill, type Tone } from "@bandcoin/ui/patterns/status-pill";

import { formatWhen } from "~/lib/datetime";
import { api, type RouterOutputs } from "~/trpc/react";

type Pin = RouterOutputs["pins"]["pins"][number];
type Status = Pin["status"];

export const STATUS: Record<Status, { label: string; tone: Tone }> = {
  LIVE: { label: "Live", tone: "success" },
  SCHEDULED: { label: "Scheduled", tone: "info" },
  ENDED: { label: "Ended", tone: "neutral" },
  HIDDEN: { label: "Hidden", tone: "neutral" },
  ALL_COLLECTED: { label: "All collected", tone: "warning" },
};
const FILTERS: { value: Status | "ALL"; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "LIVE", label: "Live" },
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "ENDED", label: "Ended" },
  { value: "HIDDEN", label: "Hidden" },
];

/** Pin management: every pin you've dropped, as a list. */
export function PinsView() {
  const pins = api.pins.pins.useQuery();
  const [filter, setFilter] = useState<Status | "ALL">("ALL");

  const add = (
    <Button asChild>
      <Link href="/pins/new">
        <Plus /> New pin
      </Link>
    </Button>
  );
  const actions = (
    <div className="flex items-center gap-2">
      <Button asChild variant="outline">
        <Link href="/pins">
          <MapIcon /> Map
        </Link>
      </Button>
      {pins.data && pins.data.length > 0 && add}
    </div>
  );
  const shown = pins.data?.filter((pin) => filter === "ALL" || pin.status === filter) ?? [];
  const count = (value: Status | "ALL") => (value === "ALL" ? (pins.data?.length ?? 0) : (pins.data?.filter((pin) => pin.status === value).length ?? 0));

  return (
    <PageBody className="grid gap-6">
      <PageHeader eyebrow="Fans" title="Manage pins" description="Every reward drop you've placed. Fans walk up to a pin in the AR app to collect it." back={{ href: "/pins", label: "Pins" }} actions={actions} />
      {pins.isPending ? (
        <Skeleton className="h-40 w-full max-w-3xl rounded-xl" />
      ) : pins.isError ? (
        <ErrorState message="Couldn't load your pins." onRetry={() => void pins.refetch()} />
      ) : pins.data.length === 0 ? (
        <EmptyState icon={MapPin} title="No pins yet" description="Drop a reward on the map for fans to find: a signed poster, a free track, a token." action={add} />
      ) : (
        <>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter pins">
            {FILTERS.filter((entry) => entry.value === "ALL" || count(entry.value) > 0 || filter === entry.value).map((entry) => (
              <button
                key={entry.value}
                type="button"
                role="tab"
                aria-selected={filter === entry.value}
                onClick={() => setFilter(entry.value)}
                className={cn("rounded-full border px-3 py-1 text-sm", filter === entry.value ? "bg-primary text-primary-foreground border-primary font-semibold" : "hover:bg-surface-2")}
              >
                {entry.label} <span className="num opacity-70">{count(entry.value)}</span>
              </button>
            ))}
          </div>
          <ul className="grid max-w-3xl gap-3">
            {shown.map((pin) => (
              <PinCard key={pin.id} pin={pin} />
            ))}
          </ul>
          {shown.length === 0 && <p className="text-fg-muted text-sm">Nothing here.</p>}
        </>
      )}
    </PageBody>
  );
}

function PinCard({ pin }: { pin: Pin }) {
  const status = STATUS[pin.status];
  return (
    <li>
      <Link href={`/pins/${pin.id}`} className="bg-surface hover:bg-surface-2 grid gap-3 rounded-xl border p-4 transition-colors sm:grid-cols-[auto_minmax(0,1fr)] sm:p-5">
        {pin.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pin.imageUrl} alt="" className="bg-surface-2 h-24 w-full rounded-lg object-cover sm:w-36" />
        )}
        <div className="grid min-w-0 content-start gap-2 sm:col-start-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="display min-w-0 text-lg">{pin.title}</h3>
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
          </div>
          <p className="text-fg-muted text-sm">
            {formatWhen(pin.startsAt)} to {formatWhen(pin.endsAt)}
          </p>
          <p className="text-fg-muted flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="flex items-center gap-1.5">
              <MapPin className="size-4 shrink-0" /> {pin.spots} spot{pin.spots === 1 ? "" : "s"}
            </span>
            {pin.reward && (
              <span className="flex items-center gap-1.5">
                <Gift className="size-4 shrink-0" /> {pin.reward}
              </span>
            )}
          </p>
          <p className="text-fg-faint text-xs">
            {pin.collected} collected
            {pin.claimLimit > 0 ? ` · ${pin.claimsLeft} of ${pin.claimLimit} left` : ""}
            {pin.event ? ` · ${pin.event}` : ""}
          </p>
          {pin.tags.length > 0 && (
            <p className="text-fg-faint flex flex-wrap items-center gap-1.5 text-xs">
              <Tag className="size-3" /> {pin.tags.join(", ")}
            </p>
          )}
        </div>
      </Link>
    </li>
  );
}
