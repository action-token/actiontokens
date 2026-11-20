"use client";

import {
  ExternalLink,
  Image as ImageIcon,
  Link2,
  Lock,
  MapPin,
  Music,
  Plus,
  Trash2,
  Video,
} from "lucide-react";

import { Button } from "@actiontokens/ui/components/button";
import { Input } from "@actiontokens/ui/components/input";
import { Field, FormSection, OptionList, SwitchRow } from "@actiontokens/ui/patterns/form-page";

import type { RouterOutputs } from "~/trpc/react";

import { FileField } from "../file-field";
import { Note, Toggle } from "../form-parts";
import {
  draftProblems,
  LOCKED_TYPES,
  type LockedDraft,
  MAX_LOCKED,
  newLocked,
  RADIUS,
} from "./drafts";
import { UnlockPlaces } from "./unlock-places";

const TYPE_ICON = { SONG: Music, IMAGE: ImageIcon, VIDEO: Video, OTHER: Link2 } as const;

/**
 * The NFT form's Locked content section: songs, images, videos or links only
 * owners can open, each optionally behind places to visit. At least one, up to
 * twenty; fixed once the NFT is created, as on the old Bandcoin.
 */
export function LockedContentField({
  value,
  onChange,
}: {
  value: LockedDraft[];
  onChange: (next: LockedDraft[]) => void;
}) {
  const update = (key: string, patch: Partial<LockedDraft>) =>
    onChange(value.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));

  return (
    <FormSection
      title="Locked content"
      icon={Lock}
      description="Songs, images, videos or links only owners can open. Turn on a condition to make owners visit places first. Fixed once you save."
    >
      {value.length === 0 && <Note>Add at least one piece.</Note>}
      {value.map((draft, index) => (
        <LockedPiece
          key={draft.key}
          draft={draft}
          index={index}
          onChange={(patch) => update(draft.key, patch)}
          onRemove={() => onChange(value.filter((entry) => entry.key !== draft.key))}
        />
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={value.length >= MAX_LOCKED}
        onClick={() => onChange([...value, newLocked()])}
      >
        <Plus /> {value.length >= MAX_LOCKED ? `Up to ${MAX_LOCKED} pieces` : "Add locked content"}
      </Button>
    </FormSection>
  );
}

function LockedPiece({
  draft,
  index,
  onChange,
  onRemove,
}: {
  draft: LockedDraft;
  index: number;
  onChange: (patch: Partial<LockedDraft>) => void;
  onRemove: () => void;
}) {
  const id = `locked-${index}`;
  const problems = draftProblems(draft);
  const kind = LOCKED_TYPES.find((entry) => entry.value === draft.type) ?? LOCKED_TYPES[0]!;

  return (
    <div className="grid gap-4 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">Piece {index + 1}</p>
        <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
          <Trash2 /> Remove
        </Button>
      </div>

      <Field label="What is it?" htmlFor={`${id}-type`}>
        <div className="flex flex-wrap gap-2" id={`${id}-type`}>
          {LOCKED_TYPES.map((entry) => (
            <Toggle
              key={entry.value}
              pressed={draft.type === entry.value}
              onClick={() =>
                // A file picked for one kind doesn't fit another.
                onChange({
                  type: entry.value,
                  file: entry.value === draft.type ? draft.file : null,
                })
              }
            >
              {entry.label}
            </Toggle>
          ))}
        </div>
      </Field>

      <Field
        label="Name"
        htmlFor={`${id}-label`}
        error={problems.label}
        hint="What owners see in the list, e.g. “Backstage video”."
      >
        <Input
          id={`${id}-label`}
          value={draft.label}
          maxLength={80}
          onChange={(event) => onChange({ label: event.target.value })}
        />
      </Field>

      {draft.type === "OTHER" ? (
        <Field
          label="Link"
          htmlFor={`${id}-link`}
          required
          error={draft.link ? problems.content : undefined}
        >
          <Input
            id={`${id}-link`}
            inputMode="url"
            placeholder="https://"
            value={draft.link}
            aria-invalid={Boolean(draft.link && problems.content)}
            onChange={(event) => onChange({ link: event.target.value })}
          />
        </Field>
      ) : (
        <Field label={`${kind.label} file`} htmlFor={`${id}-file`} required>
          <FileField
            id={`${id}-file`}
            accept={kind.accept}
            value={draft.file}
            preview={draft.type === "IMAGE"}
            onChange={(file) => onChange({ file })}
          />
        </Field>
      )}

      <OptionList>
        <SwitchRow
          icon={MapPin}
          title="Unlock condition"
          hint={
            draft.gated
              ? "Owners open it after visiting every place below."
              : "Off: every owner can open it right away."
          }
          checked={draft.gated}
          onChange={(gated) => onChange({ gated })}
        />
      </OptionList>

      {draft.gated && (
        <div className="grid gap-3">
          <Field
            label="How close owners must be (metres)"
            htmlFor={`${id}-radius`}
            error={problems.radius}
            hint={problems.radius ? undefined : `${RADIUS.min} to ${RADIUS.max} m.`}
          >
            <Input
              id={`${id}-radius`}
              inputMode="numeric"
              value={draft.radius}
              className="max-w-32"
              aria-invalid={Boolean(problems.radius)}
              onChange={(event) =>
                onChange({ radius: event.target.value.replace(/\D/g, "").slice(0, 4) })
              }
            />
          </Field>
          <UnlockPlaces
            idPrefix={id}
            places={draft.places}
            radiusMeters={Number(draft.radius) || 0}
            onChange={(places) => onChange({ places })}
          />
          {problems.places && <p className="text-danger text-xs">{problems.places}</p>}
        </div>
      )}
    </div>
  );
}

type Saved = RouterOutputs["catalog"]["get"]["lockedContents"][number];

/** The edit page: what's locked and where, read-only (fixed once created). */
export function LockedContentView({ items }: { items: Saved[] }) {
  if (items.length === 0) return null;
  return (
    <FormSection
      title="Locked content"
      icon={Lock}
      description="Fixed once created: owners' progress and the contract's unlock records point at each piece."
    >
      {items.map((item, index) => {
        const Icon = TYPE_ICON[item.type];
        const kind = LOCKED_TYPES.find((entry) => entry.value === item.type)?.label ?? item.type;
        return (
          <div key={item.id} className="grid gap-3 rounded-xl border p-4">
            <div className="flex items-center gap-3">
              <Icon className="text-primary-text size-4 shrink-0" />
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                {item.label || `Piece ${index + 1}`}
                <span className="text-fg-muted font-normal"> · {kind}</span>
              </p>
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="text-primary-text inline-flex items-center gap-1 text-xs font-medium hover:underline"
              >
                Open <ExternalLink className="size-3" />
              </a>
            </div>
            {item.unlock ? (
              <>
                <p className="text-fg-muted text-xs">
                  Owners visit {item.unlock.places.length}{" "}
                  {item.unlock.places.length === 1 ? "place" : "places"}, within{" "}
                  {item.unlock.radiusMeters} m, to open it.
                </p>
                <UnlockPlaces
                  idPrefix={`saved-${index}`}
                  radiusMeters={item.unlock.radiusMeters}
                  places={item.unlock.places.map((place) => ({
                    ...place,
                    label: place.label ?? "",
                  }))}
                />
              </>
            ) : (
              <p className="text-fg-muted text-xs">Every owner can open it right away.</p>
            )}
          </div>
        );
      })}
    </FormSection>
  );
}
