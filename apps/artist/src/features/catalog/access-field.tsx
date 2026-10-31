"use client";

import Link from "next/link";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@bandcoin/ui/components/select";
import { Field } from "@bandcoin/ui/patterns/form-page";

import { api } from "~/trpc/react";

/** "PUBLIC", "MEMBERS", or a tier's id: who can buy an item (main's Public / Only Members / tier). */
export type AccessChoice = string;

export const PUBLIC = "PUBLIC" as const;
const MEMBERS = "MEMBERS" as const;

export const accessChoiceOf = (saved?: { kind: string; tierId: string | null }): AccessChoice =>
  saved?.kind === "TIER" && saved.tierId ? saved.tierId : (saved?.kind ?? PUBLIC);

export function accessInput(
  choice: AccessChoice,
): { kind: "PUBLIC" | "MEMBERS" | "TIER"; tierId?: string } {
  if (choice === PUBLIC || choice === MEMBERS) return { kind: choice };
  return { kind: "TIER", tierId: choice };
}

const formatTokens = (amount: string) => Number(amount).toLocaleString("en-US");

/** The "Who can buy it" select on the item and song forms. */
export function AccessField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: AccessChoice;
  onChange: (choice: AccessChoice) => void;
}) {
  const tiers = api.memberships.tiers.useQuery();
  const active = tiers.data?.filter((tier) => tier.isActive) ?? [];
  const lowest = active[0];
  const chosen = active.find((tier) => tier.id === value);

  const hint =
    value === PUBLIC
      ? "Any fan can buy it."
      : value === MEMBERS
        ? lowest
          ? `Fans holding at least ${formatTokens(lowest.requiredTokens)} of your fan token (your lowest tier). Everyone else sees what unlocks it.`
          : "Add a membership tier first."
        : chosen
          ? `Only fans holding at least ${formatTokens(chosen.requiredTokens)} of your fan token. Everyone else sees what unlocks it.`
          : "This tier is turned off. Pick another one.";

  return (
    <Field label="Who can buy it" htmlFor={id} hint={hint}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full sm:max-w-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={PUBLIC}>Everyone</SelectItem>
          <SelectItem value={MEMBERS} disabled={!lowest}>
            Members only
          </SelectItem>
          {active.map((tier) => (
            <SelectItem key={tier.id} value={tier.id}>
              {tier.name}
              <span className="text-fg-faint"> · hold {formatTokens(tier.requiredTokens)}</span>
            </SelectItem>
          ))}
          {value !== PUBLIC && value !== MEMBERS && !chosen && tiers.data && (
            <SelectItem value={value}>Turned-off tier</SelectItem>
          )}
        </SelectContent>
      </Select>
      {tiers.data && active.length === 0 && (
        <p className="text-fg-muted mt-1 text-xs">
          To sell to members only,{" "}
          <Link href="/memberships" className="text-primary-text underline">
            add a membership tier
          </Link>
          .
        </p>
      )}
    </Field>
  );
}
