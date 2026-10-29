"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { ConfirmDialog } from "@bandcoin/ui/patterns/confirm-dialog";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";

import { api } from "~/trpc/react";

import { EventForm } from "./event-form";

const BACK = { href: "/events", label: "Events" };

export function NewEventView() {
  return (
    <PageBody className="grid gap-6">
      <PageHeader back={BACK} eyebrow="Fans" title="New event" description="A gig, signing or listening party. Fans see it in the AR app and can RSVP." />
      <EventForm />
    </PageBody>
  );
}

export function EditEventView({ eventId }: { eventId: string }) {
  const router = useRouter();
  const utils = api.useUtils();
  const events = api.engage.events.useQuery();
  const event = events.data?.find((row) => row.id === eventId);
  const [deleting, setDeleting] = useState(false);
  const remove = api.engage.removeEvent.useMutation({
    onSuccess: () => {
      toast.success("Event deleted");
      void utils.engage.events.invalidate();
      router.push("/events");
    },
    onError: (error) => {
      setDeleting(false);
      toast.error(error.message);
    },
  });
  const linked = event ? event.pins + event.bounties : 0;

  return (
    <PageBody className="grid gap-6">
      <PageHeader
        back={BACK}
        eyebrow="Fans"
        title={event?.title ?? "Edit event"}
        actions={
          event && (
            <Button variant="ghost" size="sm" onClick={() => setDeleting(true)}>
              <Trash2 /> Delete
            </Button>
          )
        }
      />
      {events.isPending ? (
        <Skeleton className="h-96 w-full max-w-2xl rounded-xl" />
      ) : events.isError ? (
        <ErrorState message="Couldn't load this event." onRetry={() => void events.refetch()} />
      ) : !event ? (
        <ErrorState message="This event doesn't exist." />
      ) : (
        <>
          <EventForm existing={event} />
          <ConfirmDialog
            open={deleting}
            onOpenChange={setDeleting}
            title={`Delete ${event.title}?`}
            description={`${event.rsvps} RSVPs and all comments will be removed.${linked > 0 ? " Linked pins and bounties stay, but lose the link." : ""} This can't be undone.`}
            confirmLabel={remove.isPending ? "Deleting…" : "Delete"}
            busy={remove.isPending}
            onConfirm={() => remove.mutate({ eventId })}
          />
        </>
      )}
    </PageBody>
  );
}
