"use client";

import { Check, ChevronDown, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Input } from "@bandcoin/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@bandcoin/ui/components/popover";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { cn } from "@bandcoin/ui/lib/cn";
import { Field, FormSection } from "@bandcoin/ui/patterns/form-page";

import {
  type Access,
  ACCESS_LABEL,
  type Audience,
  AUDIENCE_LABEL,
  MAX_COPIES,
  type PostSettings,
} from "./post-settings-model";

type Tier = { id: string; name: string; isActive: boolean; requiredTokens: string };

const AUDIENCE_HINT: Record<Audience, string> = {
  EVERYONE: "Anyone can open it, signed in or not.",
  FOLLOWERS: "Only fans who follow you can open it. Others see the title and a Follow prompt.",
  SUBSCRIBERS:
    "Only followers who trust your fan token (subscribers) can open it. Others see the title and a Subscribe prompt.",
  MEMBERS: "Only fans holding enough of your fan token for this tier can open it.",
};
const ACCESS_HINT: Record<"comment" | "collect", Record<Access, string>> = {
  comment: {
    VIEWERS: "Anyone who can open the post can comment.",
    FOLLOWERS: "Only fans who follow you can comment.",
    SUBSCRIBERS: "Only followers who trust your fan token (subscribers) can comment.",
    MEMBERS: "Only fans in this tier can comment.",
    NOBODY: "Comments are off. Comments already there stay visible.",
  },
  collect: {
    VIEWERS: "Anyone who can open the post can scan its QR to keep a free copy, one each.",
    FOLLOWERS: "Only fans who follow you can collect a copy.",
    SUBSCRIBERS: "Only followers who trust your fan token (subscribers) can collect a copy.",
    MEMBERS: "Only fans in this tier can collect a copy.",
    NOBODY: "No QR shows and nobody can collect it.",
  },
};

const hintOf = <T extends string>(hints: Record<T, string>, value: T, tierName: string | null) =>
  value === "MEMBERS" && tierName
    ? hints[value].replace("this tier", `the ${tierName} tier`)
    : hints[value];

/**
 * Who can see, comment on and collect the post, and how many free copies
 * there are. "Members" opens a list of your tiers to pick which one.
 */
export function PostSettingsSection({
  value,
  onChange,
  tiers,
  loadingTiers,
  collected,
  hasMedia,
}: {
  value: PostSettings;
  onChange: (next: PostSettings) => void;
  tiers: Tier[];
  loadingTiers: boolean;
  /** Copies fans already collected (editing) */
  collected: number;
  /** Only posts with a photo, video or song can be collected */
  hasMedia: boolean;
}) {
  const set = (patch: Partial<PostSettings>) => onChange({ ...value, ...patch });
  const tierName = (id: string | null) => tiers.find((tier) => tier.id === id)?.name ?? null;
  const audiences = Object.keys(AUDIENCE_LABEL) as Audience[];
  const accesses = Object.keys(ACCESS_LABEL) as Access[];
  const tierList = { tiers, loading: loadingTiers };

  return (
    <FormSection
      title="Post settings"
      icon={SlidersHorizontal}
      description="Who can see it, comment on it and collect it. You can change these later."
    >
      <Field
        label="Who can see it"
        hint={hintOf(AUDIENCE_HINT, value.audience, tierName(value.tierId))}
      >
        <Choices
          label="Who can see it"
          options={audiences.map((option) => ({ value: option, label: AUDIENCE_LABEL[option] }))}
          value={value.audience}
          tierId={value.tierId}
          {...tierList}
          onChange={(audience, tierId) => set({ audience, tierId })}
        />
      </Field>

      <Field
        label="Who can comment"
        hint={hintOf(ACCESS_HINT.comment, value.commentAccess, tierName(value.commentTierId))}
      >
        <Choices
          label="Who can comment"
          options={accesses.map((option) => ({ value: option, label: ACCESS_LABEL[option] }))}
          value={value.commentAccess}
          tierId={value.commentTierId}
          {...tierList}
          onChange={(commentAccess, commentTierId) => set({ commentAccess, commentTierId })}
        />
      </Field>

      {!hasMedia ? (
        <Field label="Who can collect">
          <p className="bg-surface-2 text-fg-muted rounded-lg border border-dashed px-3 py-2.5 text-sm">
            Text-only posts can&apos;t be collected. Add a photo, video or song and fans can scan
            its QR to keep a free copy.
          </p>
        </Field>
      ) : (
        <>
          <Field
            label="Who can collect"
            hint={hintOf(ACCESS_HINT.collect, value.collectAccess, tierName(value.collectTierId))}
          >
            <Choices
              label="Who can collect"
              options={accesses.map((option) => ({ value: option, label: ACCESS_LABEL[option] }))}
              value={value.collectAccess}
              tierId={value.collectTierId}
              {...tierList}
              onChange={(collectAccess, collectTierId) => set({ collectAccess, collectTierId })}
            />
          </Field>

          {value.collectAccess !== "NOBODY" && (
            <Field
              label="Free copies"
              htmlFor="post-copies"
              hint={
                collected > 0
                  ? `${collected} collected so far, so you can add copies but not go below ${collected}.`
                  : `1 to ${MAX_COPIES.toLocaleString("en-US")}. Once fans start collecting, you can only add more.`
              }
            >
              <Input
                id="post-copies"
                type="number"
                inputMode="numeric"
                min={Math.max(1, collected)}
                max={MAX_COPIES}
                value={Number.isNaN(value.copies) ? "" : value.copies}
                onChange={(event) => set({ copies: event.target.valueAsNumber })}
                className="w-full sm:max-w-40"
              />
            </Field>
          )}
        </>
      )}
    </FormSection>
  );
}

const chipClass = (on: boolean) =>
  cn(
    "inline-flex items-center gap-1 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
    on
      ? "bg-primary text-primary-foreground border-fg"
      : "bg-surface hover:bg-surface-2 text-fg-muted hover:text-fg",
  );

/** One rule's choices as pills; "Members" opens the tier list. */
function Choices<T extends string>({
  label,
  options,
  value,
  tierId,
  tiers,
  loading,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  tierId: string | null;
  tiers: Tier[];
  loading: boolean;
  onChange: (value: T, tierId: string | null) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((option) =>
        option.value === "MEMBERS" ? (
          <MembersChip
            key={option.value}
            on={value === option.value}
            tierId={tierId}
            tiers={tiers}
            loading={loading}
            onPick={(picked) => onChange(option.value, picked)}
          />
        ) : (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value, null)}
            className={chipClass(value === option.value)}
          >
            {option.label}
          </button>
        ),
      )}
    </div>
  );
}

/**
 * "Members" opens your tiers; picking one sets the rule and the pill then
 * reads "Members · Basic". Closing the list without a pick changes nothing.
 */
function MembersChip({
  on,
  tierId,
  tiers,
  loading,
  onPick,
}: {
  on: boolean;
  tierId: string | null;
  tiers: Tier[];
  loading: boolean;
  onPick: (tierId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = tiers.filter((tier) => tier.isActive || tier.id === tierId);
  const picked = tiers.find((tier) => tier.id === tierId);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" role="radio" aria-checked={on} className={chipClass(on)}>
          {on && picked ? `Members · ${picked.name}` : "Members"}
          <ChevronDown className="size-3.5 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1.5">
        <p className="text-fg-muted px-2.5 pt-1.5 pb-1 text-xs font-semibold">Which members?</p>
        {loading ? (
          <div className="grid gap-1 p-1">
            <Skeleton className="h-9 w-full rounded-lg" />
            <Skeleton className="h-9 w-2/3 rounded-lg" />
          </div>
        ) : active.length === 0 ? (
          <div className="grid gap-2 p-2.5 text-sm">
            <p className="text-fg-muted">You don&apos;t have a membership tier yet.</p>
            <Link href="/memberships" className="text-primary-text font-semibold hover:underline">
              Create a tier
            </Link>
          </div>
        ) : (
          <ul role="listbox" aria-label="Tiers" className="grid gap-0.5">
            {active.map((tier) => {
              const chosen = on && tier.id === tierId;
              return (
                <li key={tier.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={chosen}
                    onClick={() => {
                      onPick(tier.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "hover:bg-surface-2 flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm",
                      chosen && "bg-surface-2 font-semibold",
                    )}
                  >
                    <span className="grid">
                      <span>{tier.name}</span>
                      <span className="text-fg-muted text-xs font-normal">
                        Holds {Number(tier.requiredTokens).toLocaleString("en-US")} fan tokens
                        {tier.isActive ? "" : " · hidden"}
                      </span>
                    </span>
                    {chosen && <Check className="text-primary-text size-4 shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
