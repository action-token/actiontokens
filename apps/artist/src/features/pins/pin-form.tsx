"use client";

import {
  CalendarClock,
  Layers,
  Loader2,
  MapPin,
  Settings2,
  Sparkles,
  Tag,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@bandcoin/ui/components/select";
import { Textarea } from "@bandcoin/ui/components/textarea";
import { cn } from "@bandcoin/ui/lib/cn";
import {
  Field,
  FormPage,
  FormSection,
  OptionList,
  SwitchRow,
} from "@bandcoin/ui/patterns/form-page";

import { DeleteCard } from "~/components/delete-card";
import { fromLocalInput, toLocalInput } from "~/lib/datetime";
import { api, type RouterOutputs } from "~/trpc/react";

import { AiFillCard } from "../ai/ai-fill-card";
import { AiImagePanel } from "../ai/ai-image-panel";
import { AiTextButton } from "../ai/ai-text-button";
import { FileField, type PickedFile } from "../catalog/file-field";
import { Note } from "../catalog/form-parts";
import { MapPicker } from "./map-kit/map-picker";
import { PIN_TYPES, PinSummary, type PinTypeName } from "./pin-summary";
import { PinRewardFields, type RewardState } from "./pin-reward-fields";
import { PinSpotsCard } from "./pin-spots-card";
import { PinTagsField } from "./pin-tags-field";

type Existing = RouterOutputs["pins"]["pin"];
type Visibility = "PUBLIC" | "FOLLOWERS" | "MEMBERS" | "TIER";

const NO_EVENT = "none";
const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";
const asCover = (url: string): PickedFile => ({ url, name: "cover", mime: "image" });
const number = (value: string) => (value.trim() === "" ? NaN : Number(value));
const DAY_MS = 86_400_000;
const DURATIONS = [
  { label: "1 day", days: 1 },
  { label: "1 week", days: 7 },
  { label: "1 month", days: 30 },
];

/** One form for a new pin and for editing one: where it is, what it gives, who can collect it and for how long. */
export function PinForm({ existing }: { existing?: Existing }) {
  const router = useRouter();
  const utils = api.useUtils();
  const options = api.pins.pinOptions.useQuery();
  const editing = Boolean(existing);
  // Clicking the map on /pins starts a pin right there.
  const search = useSearchParams();
  const fromMap = { lat: search?.get("lat") ?? "", lng: search?.get("lng") ?? "" };

  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [cover, setCover] = useState<PickedFile | null>(
    existing?.imageUrl ? asCover(existing.imageUrl) : null,
  );
  const [imageBrief, setImageBrief] = useState("");
  const [link, setLink] = useState(existing?.link ?? "");
  const [type, setType] = useState<PinTypeName>(existing?.type ?? "OTHER");
  const [visibility, setVisibility] = useState<Visibility>(existing?.visibility ?? "PUBLIC");
  const [tierId, setTierId] = useState(existing?.tierId ?? "");
  const [reward, setReward] = useState<RewardState>({
    kind: existing?.reward.kind ?? "NONE",
    itemId: existing?.reward.kind === "ITEM" ? existing.reward.itemId : "",
    claimLimit: existing && existing.claimLimit > 0 ? String(existing.claimLimit) : "",
  });
  const [startsAt, setStartsAt] = useState(existing ? toLocalInput(existing.startsAt) : "");
  const [endsAt, setEndsAt] = useState(existing ? toLocalInput(existing.endsAt) : "");
  const [lat, setLat] = useState(
    existing ? String(existing.latitude) : Number.isFinite(Number(fromMap.lat)) ? fromMap.lat : "",
  );
  const [lng, setLng] = useState(
    existing ? String(existing.longitude) : Number.isFinite(Number(fromMap.lng)) ? fromMap.lng : "",
  );
  const [radius, setRadius] = useState(existing ? String(existing.radiusMeters) : "50");
  const [spotCount, setSpotCount] = useState("1");
  const [autoCollect, setAutoCollect] = useState(existing?.autoCollect ?? false);
  const [isMultiSpot, setIsMultiSpot] = useState(existing?.isMultiSpot ?? false);
  const [eventId, setEventId] = useState(existing?.eventId ?? NO_EVENT);
  const [tags, setTags] = useState<string[]>(existing?.tags ?? []);
  const [place, setPlace] = useState("");

  const done = (message: string) => {
    toast.success(message);
    void utils.pins.invalidate();
    router.push("/pins");
  };
  const fail = (error: unknown) => toast.error(messageOf(error));
  const create = api.pins.createPin.useMutation({
    onSuccess: () => done("Pin is live"),
    onError: fail,
  });
  const update = api.pins.updatePin.useMutation({ onSuccess: () => done("Saved"), onError: fail });
  const remove = api.pins.removePin.useMutation({
    onSuccess: () => done("Pin deleted"),
    onError: fail,
  });
  const hide = api.pins.setPinHidden.useMutation({
    onSuccess: (_, input) => done(input.hidden ? "Pin hidden" : "Pin is live again"),
    onError: fail,
  });
  const saving = create.isPending || update.isPending;

  const latitude = number(lat);
  const longitude = number(lng);
  const point =
    Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
      ? { lat: latitude, lng: longitude }
      : null;
  const radiusMeters = Number.isFinite(number(radius)) ? number(radius) : 0;
  const spots = Math.max(1, Math.min(100, Number(spotCount) || 1));

  const start = fromLocalInput(startsAt);
  const end = fromLocalInput(endsAt);
  const timeProblem = end && end <= (start ?? new Date()) ? "It has to end after it starts." : null;
  const claimLimit = Number(reward.claimLimit) || 0;
  const rewardOk =
    reward.kind === "NONE" ||
    (claimLimit >= 1 && (reward.kind === "FAN_TOKEN" || reward.itemId !== ""));
  const tierOk = visibility !== "TIER" || tierId !== "";
  const ready =
    title.trim().length >= 3 &&
    Boolean(end) &&
    !timeProblem &&
    rewardOk &&
    tierOk &&
    (editing || Boolean(point));

  const rewardName =
    reward.kind === "FAN_TOKEN"
      ? `Fan token${options.data?.fanToken?.code ? ` (${options.data.fanToken.code})` : ""}`
      : reward.kind === "ITEM"
        ? (options.data?.items.find((item) => item.id === reward.itemId)?.title ?? null)
        : null;
  const who =
    visibility === "TIER"
      ? (options.data?.tiers.find((tier) => tier.id === tierId)?.name ?? "A tier")
      : { PUBLIC: "Everyone", FOLLOWERS: "Followers", MEMBERS: "Members" }[visibility];
  const aiContext = { title, description, type, place };
  const imagePrompt = imageBrief || [title, description.slice(0, 400)].filter(Boolean).join(". ");

  function endIn(days: number) {
    setEndsAt(toLocalInput(new Date((start ?? new Date()).getTime() + days * DAY_MS)));
  }

  function submit(submitted: FormEvent) {
    submitted.preventDefault();
    if (!ready || !end) return;
    const fields = {
      title,
      description,
      imageUrl: cover?.url ?? null,
      link,
      type,
      visibility,
      tierId: visibility === "TIER" ? tierId : null,
      reward:
        reward.kind === "ITEM"
          ? { kind: "ITEM" as const, itemId: reward.itemId }
          : { kind: reward.kind },
      claimLimit,
      startsAt: start ?? new Date(),
      endsAt: end,
      autoCollect,
      isMultiSpot,
      eventId: eventId === NO_EVENT ? null : eventId,
      tags,
    };
    if (existing) return void update.mutate({ pinId: existing.id, ...fields });
    if (point)
      create.mutate({
        ...fields,
        latitude: point.lat,
        longitude: point.lng,
        radiusMeters,
        spotCount: spots,
      });
  }

  const actions = (
    <>
      <Button asChild type="button" variant="ghost">
        <Link href="/pins">Cancel</Link>
      </Button>
      <Button type="submit" disabled={!ready || saving}>
        {saving && <Loader2 className="animate-spin" />}
        {existing ? "Save changes" : "Create pin"}
      </Button>
    </>
  );

  return (
    <FormPage
      title={existing ? existing.title : "New pin"}
      eyebrow="Fans"
      description="A reward drop on the map that fans collect when they're nearby. Pins are free and go live as soon as you save."
      back={{ href: "/pins", label: "Pins" }}
      onSubmit={submit}
      actions={actions}
      aside={
        <>
          <FormSection
            title="Location"
            icon={MapPin}
            description={
              editing
                ? "A pin's place is fixed once it's created. Take out spots you don't want from the list below."
                : "Click the map, search, or type coordinates. The spots scatter inside the circle."
            }
          >
            <MapPicker
              value={point}
              radiusMetres={radiusMeters}
              spots={existing?.spots.map((spot) => ({
                id: spot.id,
                latitude: spot.latitude,
                longitude: spot.longitude,
                hidden: spot.isHidden,
              }))}
              onChange={
                editing
                  ? undefined
                  : (next) => {
                      setLat(String(next.lat));
                      setLng(String(next.lng));
                    }
              }
              onPlace={setPlace}
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <Field
                label="Spread (metres)"
                htmlFor="pin-radius"
                hint="How far from the centre the spots may land. 0 puts them all on the pin."
              >
                <Input
                  id="pin-radius"
                  inputMode="numeric"
                  value={radius}
                  disabled={editing}
                  onChange={(event) => setRadius(event.target.value.replace(/\D/g, "").slice(0, 4))}
                />
              </Field>
              {!editing && (
                <Field
                  label="Number of spots"
                  htmlFor="pin-spots"
                  hint="Up to 100. Each is a place fans can collect it."
                >
                  <Input
                    id="pin-spots"
                    inputMode="numeric"
                    value={spotCount}
                    onChange={(event) =>
                      setSpotCount(event.target.value.replace(/\D/g, "").slice(0, 3))
                    }
                  />
                </Field>
              )}
            </div>
          </FormSection>
          <PinSummary
            title={title}
            imageUrl={cover?.url}
            type={type}
            autoCollect={autoCollect}
            who={who}
            reward={rewardName}
            limit={claimLimit}
            spots={existing ? existing.spots.filter((spot) => !spot.isHidden).length : spots}
            startsAt={start}
            endsAt={end}
          />
          {existing && (
            <>
              <PinSpotsCard pin={existing} />
              <ManageCard
                existing={existing}
                busy={hide.isPending || remove.isPending}
                onHide={() => hide.mutate({ pinId: existing.id, hidden: !existing.isHidden })}
                onDelete={() => remove.mutate({ pinId: existing.id })}
              />
            </>
          )}
        </>
      }
    >
      {!editing && (
        <AiFillCard
          form="pin"
          context={aiContext}
          examples={[
            "A signed poster hidden near the old fountain this weekend, 30 fans can collect it",
            "Album launch pin outside the venue on Friday night",
            "Five street-art stickers around the city centre for the next two weeks",
          ]}
          apply={(result) => {
            const before = {
              title,
              description,
              type,
              startsAt,
              endsAt,
              reward,
              spotCount,
              radius,
              link,
              tags,
              imageBrief,
            };
            setTitle(result.title);
            setDescription(result.description);
            setType(result.type);
            if (result.startsAt) setStartsAt(result.startsAt);
            if (result.endsAt) setEndsAt(result.endsAt);
            if (result.claimLimit)
              setReward((current) => ({ ...current, claimLimit: String(result.claimLimit) }));
            if (result.spotCount) setSpotCount(String(result.spotCount));
            if (result.radiusMeters) setRadius(String(result.radiusMeters));
            if (result.link) setLink(result.link);
            setTags((current) => [...new Set([...current, ...result.tags])].slice(0, 10));
            setImageBrief(result.imagePrompt);
            return () => {
              setTitle(before.title);
              setDescription(before.description);
              setType(before.type);
              setStartsAt(before.startsAt);
              setEndsAt(before.endsAt);
              setReward(before.reward);
              setSpotCount(before.spotCount);
              setRadius(before.radius);
              setLink(before.link);
              setTags(before.tags);
              setImageBrief(before.imageBrief);
            };
          }}
        />
      )}

      <FormSection title="How fans collect it" icon={Settings2}>
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Collection mode">
          {(
            [
              [false, "Tap to collect", "Fans tap to collect when they're in range."],
              [true, "Auto collect", "Collected automatically when fans walk into the area."],
            ] as const
          ).map(([auto, label, text]) => (
            <button
              key={label}
              type="button"
              role="radio"
              aria-checked={autoCollect === auto}
              onClick={() => setAutoCollect(auto)}
              className={cn(
                "rounded-lg border p-3 text-left transition-colors",
                autoCollect === auto ? "border-primary bg-primary-soft" : "hover:bg-surface-2",
              )}
            >
              <span className="block text-sm font-semibold">{label}</span>
              <span className="text-fg-muted mt-0.5 block text-xs">{text}</span>
            </button>
          ))}
        </div>
      </FormSection>

      <FormSection title="Details" icon={Sparkles}>
        <Field
          label="Title"
          htmlFor="pin-title"
          required
          action={
            <AiTextButton
              form="pin"
              field="title"
              maxChars={100}
              value={title}
              context={aiContext}
              onChange={setTitle}
            />
          }
        >
          <Input
            id="pin-title"
            value={title}
            maxLength={100}
            placeholder="A catchy name fans will see"
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <Field
          label="Description"
          htmlFor="pin-description"
          action={
            <AiTextButton
              form="pin"
              field="description"
              maxChars={2000}
              value={description}
              context={aiContext}
              onChange={setDescription}
            />
          }
        >
          <Textarea
            id="pin-description"
            value={description}
            rows={4}
            maxLength={2000}
            placeholder="What makes this drop worth walking to?"
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Pin type" htmlFor="pin-type">
            <Select value={type} onValueChange={(value) => setType(value as PinTypeName)}>
              <SelectTrigger id="pin-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PIN_TYPES.map((entry) => (
                  <SelectItem key={entry.value} value={entry.value}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Link" htmlFor="pin-link" hint="Optional. Where the pin sends fans.">
            <Input
              id="pin-link"
              type="url"
              placeholder="https://example.com"
              value={link}
              onChange={(event) => setLink(event.target.value.trim())}
            />
          </Field>
        </div>
        <Field label="Cover image" hint="Optional. Shown on the map and the pin card.">
          <FileField id="pin-cover" accept="image/*" preview value={cover} onChange={setCover} />
          <AiImagePanel
            form="pin"
            aspect="wide"
            suggestedPrompt={imagePrompt}
            onImage={(url) => setCover(asCover(url))}
          />
        </Field>
        <Field
          label="Linked event"
          htmlFor="pin-event"
          hint="Optional. Show this pin on one of your events."
        >
          <Select value={eventId} onValueChange={setEventId}>
            <SelectTrigger id="pin-event" className="w-full sm:max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_EVENT}>None</SelectItem>
              {options.data?.events.map((event) => (
                <SelectItem key={event.id} value={event.id}>
                  {event.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </FormSection>

      <FormSection
        title="Collection & tier"
        icon={Users}
        description="Who can collect it, how many, and what they get."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Open to" htmlFor="pin-who">
            <Select
              value={visibility}
              onValueChange={(value) => setVisibility(value as Visibility)}
            >
              <SelectTrigger id="pin-who" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PUBLIC">Everyone</SelectItem>
                <SelectItem value="FOLLOWERS">Only followers</SelectItem>
                <SelectItem value="MEMBERS" disabled={!options.data?.tiers.length}>
                  Members: anyone in a tier
                </SelectItem>
                <SelectItem value="TIER" disabled={!options.data?.tiers.length}>
                  One tier or higher
                </SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {visibility === "TIER" && (
            <Field label="Tier" htmlFor="pin-tier" required>
              <Select value={tierId} onValueChange={setTierId}>
                <SelectTrigger id="pin-tier" className="w-full">
                  <SelectValue placeholder="Pick a tier" />
                </SelectTrigger>
                <SelectContent>
                  {options.data?.tiers.map((tier) => (
                    <SelectItem key={tier.id} value={tier.id}>
                      {tier.name} · {Number(tier.requiredTokens).toLocaleString("en-US")}{" "}
                      {options.data?.fanToken?.code ?? "tokens"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        </div>
        {options.data?.tiers.length === 0 && (
          <Note>Members and tier pins need a membership tier. Create one under Memberships.</Note>
        )}
        <Note>Everyone sees the pin on the map. This only decides who can collect it.</Note>
        <PinRewardFields
          value={reward}
          onChange={setReward}
          options={options.data}
          locked={editing && (existing?.collected ?? 0) > 0}
          claimed={existing?.collected}
        />
      </FormSection>

      <FormSection title="Schedule" icon={CalendarClock}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Starts" htmlFor="pin-starts" hint="Empty starts it as soon as you save.">
            <Input
              id="pin-starts"
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
            />
          </Field>
          <Field label="Ends" htmlFor="pin-ends" required error={timeProblem}>
            <Input
              id="pin-ends"
              type="datetime-local"
              value={endsAt}
              aria-invalid={Boolean(timeProblem)}
              onChange={(event) => setEndsAt(event.target.value)}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-fg-muted text-xs">Run it for</span>
          {DURATIONS.map((duration) => (
            <Button
              key={duration.days}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => endIn(duration.days)}
            >
              {duration.label}
            </Button>
          ))}
        </div>
      </FormSection>

      <FormSection
        title="Tags & options"
        icon={Tag}
        description="Tags help fans find it when they search the map."
      >
        <PinTagsField
          tags={tags}
          onChange={setTags}
          known={options.data?.tags ?? []}
          brief={{ title, description, type, place }}
        />
        <OptionList>
          <SwitchRow
            icon={Layers}
            title="Each spot separately"
            hint="Off: collecting any spot collects the whole pin. On: a fan can collect every spot."
            checked={isMultiSpot}
            onChange={setIsMultiSpot}
          />
        </OptionList>
      </FormSection>
    </FormPage>
  );
}

/** Hide the pin, or delete it while nobody has collected it. */
function ManageCard({
  existing,
  busy,
  onHide,
  onDelete,
}: {
  existing: Existing;
  busy: boolean;
  onHide: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <section className="bg-surface grid gap-3 rounded-[1.4rem] border-2 p-5">
        <h2 className="display text-lg">
          {existing.isHidden ? "Hidden from the map" : "On the map"}
        </h2>
        <p className="text-fg-muted text-sm">
          {existing.isHidden
            ? "Fans can't see or collect it. Show it again whenever you like."
            : "Hide it to take it off the map without losing what fans collected."}
        </p>
        <Button type="button" variant="outline" disabled={busy} onClick={onHide}>
          {existing.isHidden ? "Show on the map" : "Hide from the map"}
        </Button>
      </section>
      {existing.collected === 0 ? (
        <DeleteCard
          title="Delete this pin"
          confirmTitle={`Delete ${existing.title}?`}
          description="Its spots are removed too. This can't be undone."
          busy={busy}
          onDelete={onDelete}
        />
      ) : (
        <p className="text-fg-muted px-1 text-xs">
          {existing.collected} fans collected this pin, so it can only be hidden.
        </p>
      )}
    </>
  );
}
