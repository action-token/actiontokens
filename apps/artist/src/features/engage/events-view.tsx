"use client";

import { CalendarDays, MapPin, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";
import { StatusPill } from "@bandcoin/ui/patterns/status-pill";

import { formatWhen } from "~/lib/datetime";
import { api, type RouterOutputs } from "~/trpc/react";

type Event = RouterOutputs["engage"]["events"][number];

/** Your gigs, signings and listening parties. */
export function EventsView() {
  const events = api.engage.events.useQuery();

  const add = (
    <Button asChild>
      <Link href="/events/new">
        <Plus /> New event
      </Link>
    </Button>
  );

  return (
    <PageBody className="grid gap-6">
      <PageHeader
        eyebrow="Fans"
        title="Events"
        description="Fans find your events in the AR app and RSVP. Link a pin or a bounty to an event when you create it."
        actions={events.data && events.data.length > 0 ? add : undefined}
      />
      {events.isPending ? (
        <Skeleton className="h-40 w-full max-w-3xl rounded-xl" />
      ) : events.isError ? (
        <ErrorState message="Couldn't load your events." onRetry={() => void events.refetch()} />
      ) : events.data.length === 0 ? (
        <EmptyState icon={CalendarDays} title="No events yet" description="Add a gig, a signing or an online listening party." action={add} />
      ) : (
        <ul className="grid max-w-3xl gap-3">
          {events.data.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </ul>
      )}
    </PageBody>
  );
}

function EventCard({ event }: { event: Event }) {
  const [now] = useState(() => Date.now());
  const status = new Date(event.endsAt).getTime() < now ? "Past" : new Date(event.startsAt).getTime() <= now ? "On now" : "Upcoming";
  const linked = event.pins + event.bounties;

  return (
    <li>
      <Link href={`/events/${event.id}`} className="bg-surface hover:bg-surface-2 grid gap-3 rounded-xl border p-4 transition-colors sm:grid-cols-[auto_minmax(0,1fr)] sm:p-5">
        {event.coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.coverUrl} alt="" className="bg-surface-2 h-24 w-full rounded-lg object-cover sm:w-36" />
        )}
        <div className="grid min-w-0 content-start gap-2 sm:col-start-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="display min-w-0 text-lg">{event.title}</h3>
            <StatusPill tone={status === "Past" ? "neutral" : "success"}>{status}</StatusPill>
          </div>
          <p className="text-fg-muted text-sm">{formatWhen(event.startsAt)}</p>
          {(event.venueName ?? event.address) && (
            <p className="text-fg-muted flex items-center gap-1.5 text-sm">
              <MapPin className="size-4 shrink-0" />
              <span className="truncate">{[event.venueName, event.address].filter(Boolean).join(", ")}</span>
            </p>
          )}
          <p className="text-fg-faint text-xs">
            {event.rsvps} RSVP{event.rsvps === 1 ? "" : "s"}
            {event.capacity ? ` of ${event.capacity}` : ""}
            {linked > 0 ? ` · ${event.pins} pin${event.pins === 1 ? "" : "s"}, ${event.bounties} bount${event.bounties === 1 ? "y" : "ies"} linked` : ""}
          </p>
        </div>
      </Link>
    </li>
  );
}
