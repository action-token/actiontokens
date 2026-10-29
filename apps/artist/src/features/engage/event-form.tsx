"use client";

import { CalendarClock, ImageIcon, Link2, Loader2, MapPin, Type } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { Textarea } from "@bandcoin/ui/components/textarea";
import { Field, FormPage, FormSection } from "@bandcoin/ui/patterns/form-page";

import { DeleteCard } from "~/components/delete-card";
import { fromLocalInput, toLocalInput } from "~/lib/datetime";
import { api, type RouterOutputs } from "~/trpc/react";

import { AiFillCard } from "../ai/ai-fill-card";
import { AiImagePanel } from "../ai/ai-image-panel";
import { AiTextButton } from "../ai/ai-text-button";
import { FileField, type PickedFile } from "../catalog/file-field";
import { Note } from "../catalog/form-parts";
import { EventPreview } from "./event-preview";

type Existing = RouterOutputs["engage"]["events"][number];

const messageOf = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong.");
const toNumber = (value: string) => (value.trim() === "" ? null : Number(value));
const asCover = (url: string): PickedFile => ({ url, name: "cover", mime: "image" });

/** One form for a new event and for editing one: when, where (in person, online or both) and how many can RSVP. */
export function EventForm({ existing }: { existing?: Existing }) {
  const router = useRouter();
  const utils = api.useUtils();
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [cover, setCover] = useState<PickedFile | null>(existing?.coverUrl ? asCover(existing.coverUrl) : null);
  const [imageBrief, setImageBrief] = useState("");
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
  const remove = api.engage.removeEvent.useMutation({ onSuccess: () => done("Event deleted"), onError: (error) => toast.error(messageOf(error)) });
  const saving = create.isPending || update.isPending;

  const start = fromLocalInput(startsAt);
  const end = fromLocalInput(endsAt);
  const timeProblem = start && end && end <= start ? "The event has to end after it starts." : null;
  const ready = title.trim().length > 0 && description.trim().length > 0 && Boolean(start) && Boolean(end) && !timeProblem;

  const aiContext = { title, description, starts: startsAt, ends: endsAt, venue, address };
  const imagePrompt = imageBrief || [title, description.slice(0, 400)].filter(Boolean).join(". ");

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

  const actions = (
    <>
      <Button asChild type="button" variant="ghost">
        <Link href="/events">Cancel</Link>
      </Button>
      <Button type="submit" disabled={!ready || saving}>
        {saving && <Loader2 className="animate-spin" />}
        {existing ? "Save changes" : "Create event"}
      </Button>
    </>
  );

  return (
    <FormPage
      title={existing ? existing.title : "New event"}
      eyebrow="Fans"
      description="A gig, signing or listening party. Fans see it in the AR app and can RSVP."
      back={{ href: "/events", label: "Events" }}
      onSubmit={submit}
      actions={actions}
      aside={
        <>
          <EventPreview title={title} coverUrl={cover?.url} startsAt={start} venue={venue} address={address} />
          {existing && (
            <DeleteCard
              title="Delete this event"
              confirmTitle={`Delete ${existing.title}?`}
              description={`${existing.rsvps} RSVPs and all comments will be removed.${existing.pins + existing.bounties > 0 ? " Linked pins and bounties stay, but lose the link." : ""} This can't be undone.`}
              busy={remove.isPending}
              onDelete={() => remove.mutate({ eventId: existing.id })}
            />
          )}
        </>
      }
    >
      {!existing && (
        <AiFillCard
          form="event"
          context={aiContext}
          examples={["Album launch party this Friday at 8pm, free entry", "Online listening session for my new EP next Sunday", "Signing at the record shop on Saturday, 100 spots"]}
          apply={(result) => {
            const before = { title, description, startsAt, endsAt, venue, address, link, linkLabel, capacity, imageBrief };
            setTitle(result.title);
            setDescription(result.description);
            if (result.startsAt) setStartsAt(result.startsAt);
            if (result.endsAt) setEndsAt(result.endsAt);
            setVenue(result.inPerson ? (result.venueName ?? "") : "");
            setAddress(result.inPerson ? (result.address ?? "") : "");
            if (result.link) setLink(result.link);
            if (result.linkLabel) setLinkLabel(result.linkLabel);
            if (result.capacity) setCapacity(String(result.capacity));
            setImageBrief(result.imagePrompt);
            return () => {
              setTitle(before.title);
              setDescription(before.description);
              setStartsAt(before.startsAt);
              setEndsAt(before.endsAt);
              setVenue(before.venue);
              setAddress(before.address);
              setLink(before.link);
              setLinkLabel(before.linkLabel);
              setCapacity(before.capacity);
              setImageBrief(before.imageBrief);
            };
          }}
        />
      )}

      <FormSection title="The event" icon={Type}>
        <Field label="Title" htmlFor="event-title" required action={<AiTextButton form="event" field="title" maxChars={100} value={title} context={aiContext} onChange={setTitle} />}>
          <Input id="event-title" value={title} maxLength={100} placeholder="Album launch party" onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="What's happening" htmlFor="event-description" required action={<AiTextButton form="event" field="description" maxChars={4000} value={description} context={aiContext} onChange={setDescription} />}>
          <Textarea id="event-description" value={description} rows={6} maxLength={4000} placeholder="Who it's for, what to expect, what to bring…" onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </FormSection>

      <FormSection title="Cover image" icon={ImageIcon} description="Optional. Shown on the event and in the AR app.">
        <FileField id="event-cover" accept="image/*" preview value={cover} onChange={setCover} />
        <AiImagePanel form="event" aspect="wide" suggestedPrompt={imagePrompt} onImage={(url) => setCover(asCover(url))} />
      </FormSection>

      <FormSection title="When" icon={CalendarClock}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Starts" htmlFor="event-starts" required>
            <Input id="event-starts" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </Field>
          <Field label="Ends" htmlFor="event-ends" required error={timeProblem}>
            <Input id="event-ends" type="datetime-local" value={endsAt} aria-invalid={Boolean(timeProblem)} onChange={(e) => setEndsAt(e.target.value)} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Where" icon={MapPin} description="Leave it empty for an online event. Give both coordinates to show it on the map.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Venue" htmlFor="event-venue">
            <Input id="event-venue" value={venue} maxLength={100} onChange={(e) => setVenue(e.target.value)} />
          </Field>
          <Field label="Address" htmlFor="event-address">
            <Input id="event-address" value={address} maxLength={200} onChange={(e) => setAddress(e.target.value)} />
          </Field>
          <Field label="Latitude" htmlFor="event-lat">
            <Input id="event-lat" inputMode="decimal" value={latitude} onChange={(e) => setLatitude(e.target.value.trim())} />
          </Field>
          <Field label="Longitude" htmlFor="event-lng">
            <Input id="event-lng" inputMode="decimal" value={longitude} onChange={(e) => setLongitude(e.target.value.trim())} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Link and RSVPs" icon={Link2}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Link" htmlFor="event-link">
            <Input id="event-link" type="url" placeholder="https://" value={link} onChange={(e) => setLink(e.target.value.trim())} />
          </Field>
          <Field label="Link label" htmlFor="event-link-label">
            <Input id="event-link-label" value={linkLabel} maxLength={30} placeholder="Get tickets" onChange={(e) => setLinkLabel(e.target.value)} />
          </Field>
        </div>
        <Field label="RSVP limit" htmlFor="event-capacity">
          <Input id="event-capacity" inputMode="numeric" value={capacity} className="max-w-40" onChange={(e) => setCapacity(e.target.value.trim())} />
          <Note>Leave empty for no limit.</Note>
        </Field>
      </FormSection>
    </FormPage>
  );
}
