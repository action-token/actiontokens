"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { Textarea } from "@bandcoin/ui/components/textarea";

import { fromLocalInput, toLocalInput } from "~/lib/datetime";
import { api, type RouterOutputs } from "~/trpc/react";

import { FileField, type PickedFile } from "../catalog/file-field";
import { Field, Note } from "../catalog/form-parts";

type Existing = RouterOutputs["engage"]["events"][number];

const messageOf = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong.");
const toNumber = (value: string) => (value.trim() === "" ? null : Number(value));

/** One form for a new event and for editing one: when, where (in person, online or both) and how many can RSVP. */
export function EventForm({ existing }: { existing?: Existing }) {
  const router = useRouter();
  const utils = api.useUtils();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [cover, setCover] = useState<PickedFile | null>(existing?.coverUrl ? { url: existing.coverUrl, name: "cover", mime: "image" } : null);
  const [startsAt, setStartsAt] = useState(existing ? toLocalInput(existing.startsAt) : "");
  const [endsAt, setEndsAt] = useState(existing ? toLocalInput(existing.endsAt) : "");
  const [venue, setVenue] = useState(existing?.venueName ?? "");
  const [address, setAddress] = useState(existing?.address ?? "");
  const [latitude, setLatitude] = useState(existing?.latitude?.toString() ?? "");
  const [longitude, setLongitude] = useState(existing?.longitude?.toString() ?? "");
  const [link, setLink] = useState(existing?.link ?? "");
  const [linkLabel, setLinkLabel] = useState(existing?.linkLabel ?? "");
  const [capacity, setCapacity] = useState(existing?.capacity?.toString() ?? "");

  const done = (message: string) => {
    toast.success(message);
    void utils.engage.events.invalidate();
    router.push("/events");
  };
  const create = api.engage.createEvent.useMutation({ onSuccess: () => done("Event created"), onError: (error) => toast.error(messageOf(error)) });
  const update = api.engage.updateEvent.useMutation({ onSuccess: () => done("Saved"), onError: (error) => toast.error(messageOf(error)) });
  const saving = create.isPending || update.isPending;

  const start = fromLocalInput(startsAt);
  const end = fromLocalInput(endsAt);
  const timeProblem = start && end && end <= start ? "The event has to end after it starts." : null;
  const ready = title.trim().length > 0 && description.trim().length > 0 && Boolean(start) && Boolean(end) && !timeProblem;

  function submit(submitted: FormEvent) {
    submitted.preventDefault();
    if (!ready || !start || !end) return;
    const fields = {
      title,
      description,
      coverUrl: cover?.url ?? null,
      startsAt: start,
      endsAt: end,
      venueName: venue,
      address,
      latitude: toNumber(latitude),
      longitude: toNumber(longitude),
      link,
      linkLabel,
      capacity: toNumber(capacity),
    };
    if (existing) update.mutate({ eventId: existing.id, ...fields });
    else create.mutate(fields);
  }

  return (
    <form onSubmit={submit} className="bg-surface grid max-w-2xl gap-6 rounded-xl border p-5 sm:p-6">
      <Field label="Title" htmlFor="event-title">
        <Input id="event-title" value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="What's happening" htmlFor="event-description">
        <Textarea id="event-description" value={description} rows={5} maxLength={4000} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Cover image" htmlFor="event-cover">
        <FileField id="event-cover" accept="image/*" preview value={cover} onChange={setCover} />
      </Field>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Starts" htmlFor="event-starts">
          <Input id="event-starts" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </Field>
        <Field label="Ends" htmlFor="event-ends" error={timeProblem}>
          <Input id="event-ends" type="datetime-local" value={endsAt} aria-invalid={Boolean(timeProblem)} onChange={(e) => setEndsAt(e.target.value)} />
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Venue (optional)" htmlFor="event-venue">
          <Input id="event-venue" value={venue} maxLength={100} onChange={(e) => setVenue(e.target.value)} />
        </Field>
        <Field label="Address (optional)" htmlFor="event-address">
          <Input id="event-address" value={address} maxLength={200} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field label="Latitude (optional)" htmlFor="event-lat">
          <Input id="event-lat" inputMode="decimal" value={latitude} onChange={(e) => setLatitude(e.target.value.trim())} />
        </Field>
        <Field label="Longitude (optional)" htmlFor="event-lng">
          <Input id="event-lng" inputMode="decimal" value={longitude} onChange={(e) => setLongitude(e.target.value.trim())} />
        </Field>
        <div className="sm:col-span-2">
          <Note>Leave the place empty for an online event. Give both coordinates to show it on the map.</Note>
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Link (optional)" htmlFor="event-link">
          <Input id="event-link" type="url" placeholder="https://" value={link} onChange={(e) => setLink(e.target.value.trim())} />
        </Field>
        <Field label="Link label" htmlFor="event-link-label">
          <Input id="event-link-label" value={linkLabel} maxLength={30} placeholder="Get tickets" onChange={(e) => setLinkLabel(e.target.value)} />
        </Field>
      </div>
      <Field label="RSVP limit (optional)" htmlFor="event-capacity">
        <Input id="event-capacity" inputMode="numeric" value={capacity} className="max-w-40" onChange={(e) => setCapacity(e.target.value.trim())} />
        <Note>Leave empty for no limit.</Note>
      </Field>
      <div className="flex flex-wrap items-center gap-3 border-t pt-5">
        <Button type="submit" disabled={!ready || saving}>
          {saving && <Loader2 className="animate-spin" />}
          {existing ? "Save changes" : "Create event"}
        </Button>
        <Button asChild variant="ghost">
          <Link href="/events">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
