"use client";

import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";

import { api } from "~/trpc/react";

import { EventForm } from "./event-form";

export const NewEventView = () => <EventForm />;

export function EditEventView({ eventId }: { eventId: string }) {
  const events = api.engage.events.useQuery();
  const event = events.data?.find((row) => row.id === eventId);
  if (event) return <EventForm existing={event} />;
  return (
    <PageBody className="grid gap-6">
      <PageHeader back={{ href: "/events", label: "Events" }} eyebrow="Drops" title="Edit event" />
      {events.isPending ? (
        <Skeleton className="h-96 w-full max-w-2xl rounded-xl" />
      ) : events.isError ? (
        <ErrorState message="Couldn't load this event." onRetry={() => void events.refetch()} />
      ) : (
        <ErrorState message="This event doesn't exist." />
      )}
    </PageBody>
  );
}
