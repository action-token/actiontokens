"use client";

import { CalendarClock, Layers, Loader2, Map as MapIcon, Sparkles, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useState } from "react";
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
import { useFormCard } from "@bandcoin/ui/patterns/form-card";
import { useActingArtist } from "../pins/acting";
import {
  CardTab,
  Field,
  FormPage,
  FormSection,
  MoreOptions,
  OptionGroup,
  OptionList,
  SwitchRow,
} from "@bandcoin/ui/patterns/form-page";

import { fromLocalInput, toLocalInput } from "~/lib/datetime";
import { api, type RouterOutputs } from "~/trpc/react";

import { FileField, type PickedFile } from "../catalog/file-field";
import { Note } from "../catalog/form-parts";
import { PIN_TYPES, type PinTypeName } from "../pins/pin-summary";
import { PinRewardFields, type RewardState } from "../pins/pin-reward-fields";
import { LayerField, LayerNote } from "../pins/layers/layer-field";
import { loadLastLook, saveLastLook, toLookValue } from "../pins/look/look-value";
import { PinLookSection } from "../pins/look/pin-look-section";
import { hotspotFormToTemplate, templateToHotspotForm } from "../pins/templates/mapping";
import { SaveTemplateDialog } from "../pins/templates/save-template-dialog";
import { TemplatePicker, type HotspotTemplateRow } from "../pins/templates/template-picker";
import { useFormTemplate } from "../pins/templates/use-template-param";
import { PinTagsField } from "../pins/pin-tags-field";
import { amountProblem } from "../pins/reward-amount";
import { AreaDraw, type DrawnArea } from "./area-draw";
import { useMapFormCard } from "~/features/pins/map-form-card";

import { clearAreaDraft, peekAreaDraft } from "./area-draft";
import { HotspotManage } from "./hotspot-manage";
import { dropPlan } from "./schedule";

type Existing = RouterOutputs["hotspots"]["hotspot"];
type Visibility = "PUBLIC" | "FOLLOWERS" | "SUBSCRIBERS" | "MEMBERS" | "TIER";

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";
const asCover = (url: string): PickedFile => ({ url, name: "cover", mime: "image" });
const digits = (value: string, max: number) => value.replace(/\D/g, "").slice(0, max);

const CARD_TABS = [
  { id: "details", label: "Details" },
  { id: "rules", label: "Rules" },
  { id: "look", label: "Look" },
];

/**
 * One form for a new hotspot and for editing one: the area, what each drop's
 * pin is, and how often it drops. Edits change future drops only.
 */
export function HotspotForm({ existing }: { existing?: Existing }) {
  const router = useRouter();
  const utils = api.useUtils();
  const options = api.pins.pinOptions.useQuery();
  const template = existing?.template;
  const started = Boolean(existing && new Date(existing.startsAt) <= new Date());

  const [area, setArea] = useState<DrawnArea | null>(
    existing
      ? {
          shape: existing.shape as DrawnArea["shape"],
          feature: existing.geoJson as unknown as DrawnArea["feature"],
        }
      : peekAreaDraft(), // an area just drawn on the Pins map
  );
  const [title, setTitle] = useState(existing?.title ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [cover, setCover] = useState<PickedFile | null>(
    template?.imageUrl ? asCover(template.imageUrl) : null,
  );
  const [link, setLink] = useState(template?.link ?? "");
  const [type, setType] = useState<PinTypeName>(template?.type ?? "OTHER");
  const [visibility, setVisibility] = useState<Visibility>(template?.visibility ?? "PUBLIC");
  const [tierId, setTierId] = useState(template?.tierId ?? "");
  const [reward, setReward] = useState<RewardState>({
    kind: template?.reward.kind ?? "NONE",
    itemId: template?.reward.kind === "ITEM" ? template.reward.itemId : "",
    amount:
      template?.reward.kind === "FAN_TOKEN" && template.reward.amount ? template.reward.amount : "",
    claimLimit: template && template.claimLimit > 0 ? String(template.claimLimit) : "",
  });
  const [autoCollect, setAutoCollect] = useState(template?.autoCollect ?? false);
  const [isMultiSpot, setIsMultiSpot] = useState(template?.isMultiSpot ?? false);
  const [tags, setTags] = useState<string[]>(template?.tags ?? []);
  // A new hotspot starts from the look you chose last (this browser); an existing one from its own.
  const [look, setLook] = useState(() => toLookValue(existing?.look));
  useEffect(() => {
    if (!existing) setLook(loadLastLook());
  }, [existing]);
  // The layer picked on the Pins map arrives as ?layer=; a new hotspot goes in it.
  const layerParam = useSearchParams()?.get("layer") ?? null;
  const card = useFormCard();
  // In a map card the area is drawn on the map itself (it has no map of its own here).
  const areaFeature = area?.feature ?? null;
  const inCard = Boolean(card);
  useEffect(() => {
    if (!inCard || existing) return;
    useMapFormCard.getState().setDraftArea(areaFeature ? { feature: areaFeature } : null);
    return () => useMapFormCard.getState().setDraftArea(null);
  }, [inCard, existing, areaFeature]);
  // An admin acting as the artist: templates are the admin's own, so none are offered.
  const acting = useActingArtist();
  const [layerId, setLayerId] = useState<string | null>(
    existing ? existing.layerId : card ? (card.layerId ?? null) : layerParam,
  );
  // In a map card, a new hotspot goes in the layer picked on the map.
  const layer = !existing && card ? (card.layerId ?? null) : layerId;
  const [startsAt, setStartsAt] = useState(existing ? toLocalInput(existing.startsAt) : "");
  const [endsAt, setEndsAt] = useState(existing ? toLocalInput(existing.endsAt) : "");
  const [every, setEvery] = useState(String(existing?.dropEveryDays ?? 7));
  const [lasts, setLasts] = useState(String(existing?.pinDurationDays ?? 3));
  const [spots, setSpots] = useState(String(existing?.spotsPerDrop ?? 3));
  const [saveTemplate, setSaveTemplate] = useState(false);

  // Fills what the template has; everything else stays as it is. The schedule comes back as a
  // fresh end date, counted from now.
  const applyTemplate = useCallback((saved: HotspotTemplateRow) => {
    const fill = templateToHotspotForm(saved.data);
    if (fill.title !== undefined) setTitle(fill.title);
    if (fill.description !== undefined) setDescription(fill.description);
    if (fill.imageUrl !== undefined) setCover(fill.imageUrl ? asCover(fill.imageUrl) : null);
    if (fill.link !== undefined) setLink(fill.link);
    if (fill.type !== undefined) setType(fill.type);
    if (fill.visibility !== undefined) setVisibility(fill.visibility);
    if (fill.tierId !== undefined) setTierId(fill.tierId);
    if (fill.reward !== undefined) setReward(fill.reward);
    if (fill.autoCollect !== undefined) setAutoCollect(fill.autoCollect);
    if (fill.isMultiSpot !== undefined) setIsMultiSpot(fill.isMultiSpot);
    if (fill.tags !== undefined) setTags(fill.tags);
    if (fill.look !== undefined) setLook(fill.look);
    if (fill.every !== undefined) setEvery(fill.every);
    if (fill.lasts !== undefined) setLasts(fill.lasts);
    if (fill.spots !== undefined) setSpots(fill.spots);
    if (fill.end !== undefined) {
      setStartsAt("");
      setEndsAt(toLocalInput(fill.end));
    }
    if (fill.area) setArea(fill.area);
  }, []);
  const fromTemplate = useFormTemplate("HOTSPOT", applyTemplate);

  const done = (message: string) => {
    toast.success(message);
    clearAreaDraft();
    void utils.hotspots.invalidate();
    void utils.pins.invalidate();
    if (card) card.onDone();
    else router.push("/hotspots");
  };
  const create = api.hotspots.createHotspot.useMutation({
    onSuccess: (result) => {
      saveLastLook(look);
      done(result.dropped ? "Hotspot is live: the first pins just dropped" : "Hotspot saved");
    },
    onError: (error) => toast.error(messageOf(error)),
  });
  const update = api.hotspots.updateHotspot.useMutation({
    onSuccess: () => done("Saved. Future drops use the changes."),
    onError: (error) => toast.error(messageOf(error)),
  });
  const saving = create.isPending || update.isPending;

  const start = fromLocalInput(startsAt) ?? (existing ? new Date(existing.startsAt) : null);
  const end = fromLocalInput(endsAt);
  const dropEveryDays = Number(every) || 0;
  const pinDurationDays = Number(lasts) || 0;
  const spotsPerDrop = Number(spots) || 0;
  const claimLimit = Number(reward.claimLimit) || 0;
  const plan = dropPlan({ start: start ?? new Date(), end, dropEveryDays });

  const problem = !area
    ? "Draw the area on the map."
    : title.trim().length < 3
      ? "Give it a title of at least 3 characters."
      : !end
        ? "Pick an end date."
        : end <= (start ?? new Date())
          ? "It has to end after it starts."
          : dropEveryDays < 1 || dropEveryDays > 365
            ? "Drop every 1 to 365 days."
            : pinDurationDays < 1 || pinDurationDays > 365
              ? "Each drop lasts 1 to 365 days."
              : spotsPerDrop < 1 || spotsPerDrop > 100
                ? "Drop 1 to 100 spots each time."
                : visibility === "TIER" && !tierId
                  ? "Pick the tier that can collect."
                  : reward.kind !== "NONE" && claimLimit < 1
                    ? "Set how many fans can collect each drop."
                    : reward.kind === "FAN_TOKEN" && amountProblem(reward.amount)
                      ? amountProblem(reward.amount)
                      : reward.kind === "ITEM" && !reward.itemId
                        ? "Pick the item fans get."
                        : null;

  function submit(submitted: FormEvent) {
    submitted.preventDefault();
    if (problem || !area || !end) return;
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
          : reward.kind === "FAN_TOKEN"
            ? { kind: "FAN_TOKEN" as const, amount: reward.amount.trim() || "1" }
            : { kind: "NONE" as const },
      claimLimit,
      autoCollect,
      isMultiSpot,
      tags,
      layerId: layer,
      look,
      area: area as never,
      dropEveryDays,
      pinDurationDays,
      endsAt: end,
      spotsPerDrop,
    };
    if (existing)
      return void update.mutate({
        hotspotId: existing.id,
        ...fields,
        ...(started ? {} : { startsAt: start ?? new Date() }),
      });
    create.mutate({ ...fields, startsAt: start ?? new Date() });
  }

  const actions = (
    <>
      <span className="mr-auto flex flex-wrap items-center gap-2">
        {!existing && !card && !acting && (
          <TemplatePicker formType="HOTSPOT" onPick={fromTemplate.use} />
        )}
        {!acting && (
          <Button type="button" variant="outline" onClick={() => setSaveTemplate(true)}>
            {card ? "Template" : "Save as template"}
          </Button>
        )}
        {problem && <span className="text-fg-muted text-xs">{problem}</span>}
      </span>
      {card ? (
        <Button type="button" variant="ghost" onClick={card.onClose}>
          Cancel
        </Button>
      ) : (
        <Button asChild type="button" variant="ghost">
          <Link href="/hotspots">Cancel</Link>
        </Button>
      )}
      <Button type="submit" disabled={Boolean(problem) || saving}>
        {saving && <Loader2 className="animate-spin" />}
        {existing ? "Save changes" : "Create hotspot"}
      </Button>
    </>
  );

  return (
    <FormPage
      title={existing ? existing.title : "New hotspot"}
      description="An area where pins drop on their own, every few days, at random spots inside it. Each drop goes live straight away."
      back={{ href: "/hotspots", label: "Hotspots" }}
      onSubmit={submit}
      actions={actions}
      cardTabs={CARD_TABS}
      cardHeaderAction={
        card && !acting ? (
          existing ? (
            <Button asChild variant="outline">
              <Link href={`/hotspots/${existing.id}`}>Full page</Link>
            </Button>
          ) : (
            <TemplatePicker formType="HOTSPOT" label="Template" onPick={fromTemplate.use} />
          )
        ) : undefined
      }
      aside={
        <>
          <FormSection
            title="Area"
            icon={MapIcon}
            description="Draw where the pins may drop. Up to 50 km from its centre."
          >
            <AreaDraw value={area} onChange={setArea} />
          </FormSection>
          {existing && <HotspotManage hotspot={existing} />}
        </>
      }
    >
      <FormSection title="Each drop's pin" icon={Sparkles} tab="details">
        <Field label="Title" htmlFor="hotspot-title" required>
          <Input
            id="hotspot-title"
            value={title}
            maxLength={100}
            placeholder="What fans see on every drop"
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <Field label="Description" htmlFor="hotspot-description">
          <Textarea
            id="hotspot-description"
            value={description}
            rows={3}
            maxLength={2000}
            placeholder="What makes these drops worth finding?"
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <Field label="Cover image" hint="Optional. Shown on the map and the pin card.">
          <FileField
            id="hotspot-cover"
            accept="image/*"
            preview
            value={cover}
            onChange={setCover}
          />
        </Field>
      </FormSection>

      <FormSection title="Schedule" icon={CalendarClock} description={plan} tab="rules">
        <div className="grid gap-5 @md:grid-cols-2">
          <Field
            label="Starts"
            htmlFor="hotspot-starts"
            hint={
              started
                ? "It has started, so the start date stays."
                : "The first drop is on this date. Empty starts it now."
            }
          >
            <Input
              id="hotspot-starts"
              type="datetime-local"
              value={startsAt}
              disabled={started}
              onChange={(event) => setStartsAt(event.target.value)}
            />
          </Field>
          <Field label="Ends" htmlFor="hotspot-ends" required hint="No drops after this.">
            <Input
              id="hotspot-ends"
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
            />
          </Field>
          <Field label="Drop every (days)" htmlFor="hotspot-every">
            <Input
              id="hotspot-every"
              inputMode="numeric"
              value={every}
              onChange={(event) => setEvery(digits(event.target.value, 3))}
            />
          </Field>
          <Field label="Each drop lasts (days)" htmlFor="hotspot-lasts">
            <Input
              id="hotspot-lasts"
              inputMode="numeric"
              value={lasts}
              onChange={(event) => setLasts(digits(event.target.value, 3))}
            />
          </Field>
          <Field
            label="Spots per drop"
            htmlFor="hotspot-spots"
            hint="Up to 100 random places inside the area."
          >
            <Input
              id="hotspot-spots"
              inputMode="numeric"
              value={spots}
              onChange={(event) => setSpots(digits(event.target.value, 3))}
            />
          </Field>
        </div>
      </FormSection>

      <FormSection
        title="Who can collect each drop"
        icon={Users}
        tab="rules"
        description="How many fans per drop, and what they get."
      >
        <Field label="Open to" htmlFor="hotspot-who">
          <Select value={visibility} onValueChange={(value) => setVisibility(value as Visibility)}>
            <SelectTrigger id="hotspot-who" className="w-full sm:max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="PUBLIC">Everyone</SelectItem>
              <SelectItem value="FOLLOWERS">Only followers</SelectItem>
              <SelectItem value="SUBSCRIBERS">Only subscribers</SelectItem>
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
          <Field label="Tier" htmlFor="hotspot-tier" required>
            <Select value={tierId} onValueChange={setTierId}>
              <SelectTrigger id="hotspot-tier" className="w-full sm:max-w-sm">
                <SelectValue placeholder="Pick a tier" />
              </SelectTrigger>
              <SelectContent>
                {options.data?.tiers.map((tier) => (
                  <SelectItem key={tier.id} value={tier.id}>
                    {tier.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <PinRewardFields value={reward} onChange={setReward} options={options.data} />
        {reward.kind !== "NONE" && (
          <Note>
            The limit is per drop: every drop can be collected by that many fans, each getting the
            reward.
          </Note>
        )}
      </FormSection>

      <PinLookSection
        tab="look"
        value={look}
        onChange={setLook}
        autoCollect={autoCollect}
        pinImage={cover?.url ?? null}
        artistImage={options.data?.artistImage ?? null}
      />

      <CardTab tab="look">
        {existing ? (
          <LayerField
            value={layerId}
            onChange={setLayerId}
            hint="Its drops go in this layer, the ones already made too."
          />
        ) : (
          <LayerNote layerId={layer} what="hotspot" />
        )}
      </CardTab>

      <MoreOptions tab="rules" hint="How fans collect it, pin type, link, tags">
        <OptionGroup title="How fans collect it">
          <div
            className="grid gap-2 @md:grid-cols-2"
            role="radiogroup"
            aria-label="Collection mode"
          >
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
        </OptionGroup>
        <OptionGroup title="Type and link">
          <div className="grid gap-5 @md:grid-cols-2">
            <Field label="Pin type" htmlFor="hotspot-type">
              <Select value={type} onValueChange={(value) => setType(value as PinTypeName)}>
                <SelectTrigger id="hotspot-type" className="w-full">
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
            <Field label="Link" htmlFor="hotspot-link" hint="Optional. Where the pin sends fans.">
              <Input
                id="hotspot-link"
                type="url"
                placeholder="https://example.com"
                value={link}
                onChange={(event) => setLink(event.target.value.trim())}
              />
            </Field>
          </div>
        </OptionGroup>
        <OptionGroup title="Tags">
          <PinTagsField
            tags={tags}
            onChange={setTags}
            known={options.data?.tags ?? []}
            brief={{ title, description, type, place: "" }}
          />
          <OptionList>
            <SwitchRow
              icon={Layers}
              title="Each spot separately"
              hint="Off: collecting any spot collects the drop. On: a fan can collect every spot."
              checked={isMultiSpot}
              onChange={setIsMultiSpot}
            />
          </OptionList>
        </OptionGroup>
      </MoreOptions>

      <SaveTemplateDialog
        open={saveTemplate}
        onOpenChange={setSaveTemplate}
        formType="HOTSPOT"
        defaultName={fromTemplate.active?.name ?? title.trim()}
        from={fromTemplate.active}
        location={area ? `${area.shape} area` : null}
        build={(includeArea) =>
          hotspotFormToTemplate(
            {
              title,
              description,
              imageUrl: cover?.url ?? null,
              link,
              type,
              visibility,
              tierId,
              reward,
              autoCollect,
              isMultiSpot,
              tags,
              look,
              every,
              lasts,
              spots,
              start: fromLocalInput(startsAt),
              end: fromLocalInput(endsAt),
              area,
            },
            { includeArea },
          )
        }
      />
    </FormPage>
  );
}
