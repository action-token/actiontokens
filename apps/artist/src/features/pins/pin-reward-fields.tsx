"use client";

import { Coins, Gift, PackageOpen } from "lucide-react";
import type { ReactNode } from "react";

import { Input } from "@bandcoin/ui/components/input";
import { RadioGroup, RadioGroupItem } from "@bandcoin/ui/components/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@bandcoin/ui/components/select";
import { cn } from "@bandcoin/ui/lib/cn";
import { Field } from "@bandcoin/ui/patterns/form-page";

import type { RouterOutputs } from "~/trpc/react";

import { Note } from "../catalog/form-parts";
import { amountProblem, storageNote } from "./reward-amount";

export type RewardKind = "NONE" | "FAN_TOKEN" | "ITEM";
type Options = RouterOutputs["pins"]["pinOptions"];

/** `amount` = fan tokens per collect; empty means one */
export type RewardState = { kind: RewardKind; itemId: string; claimLimit: string; amount: string };

/**
 * What a fan gets for collecting: nothing (a pin to find), an amount of your
 * fan token (sent from storage) or one copy of one of your items, up to the limit.
 */
export function PinRewardFields({
  value,
  onChange,
  options,
  locked,
  claimed,
}: {
  value: RewardState;
  onChange: (next: RewardState) => void;
  options: Options | undefined;
  /** Someone already collected it, so the reward can't change */
  locked?: boolean;
  claimed?: number;
}) {
  const item = options?.items.find((candidate) => candidate.id === value.itemId);
  const hasReward = value.kind !== "NONE";
  const limit = Number(value.claimLimit);
  const overSupply = item?.supply != null && limit > item.supply;
  const limitProblem =
    hasReward && !(limit >= 1)
      ? "Set how many fans can collect it."
      : overSupply
        ? `${item?.title} only has ${item?.supply?.toLocaleString("en-US")} copies.`
        : claimed && limit > 0 && limit < claimed
          ? `${claimed} fans already collected it.`
          : null;
  const fanToken = options?.fanToken;
  const amountError = value.kind === "FAN_TOKEN" ? amountProblem(value.amount) : null;
  const note =
    value.kind === "FAN_TOKEN" && fanToken?.code
      ? storageNote({
          amount: value.amount,
          claimLimit: value.claimLimit,
          code: fanToken.code,
          inStorage: fanToken.inStorage,
        })
      : null;

  return (
    <div className="grid gap-5">
      <RadioGroup
        value={value.kind}
        disabled={locked}
        onValueChange={(kind) => onChange({ ...value, kind: kind as RewardKind })}
        className="gap-2"
        aria-label="Reward"
      >
        <Choice
          value="NONE"
          icon={PackageOpen}
          title="No reward"
          hint="A pin to find, with a link or a story."
          checked={value.kind === "NONE"}
          disabled={locked}
        />
        <Choice
          value="FAN_TOKEN"
          icon={Coins}
          title={
            options?.fanToken?.code ? `Your fan token (${options.fanToken.code})` : "Your fan token"
          }
          hint={
            options?.fanToken
              ? "Sent from your storage when a fan claims."
              : "Create your fan token under Memberships first."
          }
          checked={value.kind === "FAN_TOKEN"}
          disabled={locked || !options?.fanToken}
        >
          {value.kind === "FAN_TOKEN" && (
            <div className="mt-3 grid gap-2">
              <Field
                label="Tokens each fan gets"
                htmlFor="pin-amount"
                error={amountError}
                hint={amountError ? undefined : "Leave empty for one."}
              >
                <Input
                  id="pin-amount"
                  inputMode="decimal"
                  placeholder="1"
                  value={value.amount}
                  disabled={locked}
                  aria-invalid={Boolean(amountError)}
                  className="max-w-40"
                  onChange={(event) => onChange({ ...value, amount: event.target.value })}
                />
              </Field>
              {note && (
                <p className={cn("text-xs", note.short ? "text-warning" : "text-fg-muted")}>
                  {note.text}
                </p>
              )}
            </div>
          )}
        </Choice>
        <Choice
          value="ITEM"
          icon={Gift}
          title="One of my items"
          hint={options?.items.length === 0 ? "You have no items yet." : "Each fan gets one copy."}
          checked={value.kind === "ITEM"}
          disabled={locked || !options?.items.length}
        >
          {value.kind === "ITEM" && (
            <Select
              value={value.itemId}
              disabled={locked}
              onValueChange={(itemId) => onChange({ ...value, itemId })}
            >
              <SelectTrigger aria-label="Item to give" className="mt-3 w-full">
                <SelectValue placeholder="Pick an item" />
              </SelectTrigger>
              <SelectContent>
                {options?.items.map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    {candidate.title}
                    {candidate.supply !== null && (
                      <span className="text-fg-faint">
                        {" "}
                        · {candidate.supply.toLocaleString("en-US")} copies
                      </span>
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Choice>
      </RadioGroup>
      {locked && <Note>Fans have collected this pin, so its reward can&apos;t change.</Note>}

      <Field
        label="How many fans can collect it"
        htmlFor="pin-limit"
        required={hasReward}
        error={limitProblem}
        hint={hasReward ? undefined : "Leave empty for no limit."}
      >
        <Input
          id="pin-limit"
          inputMode="numeric"
          value={value.claimLimit}
          aria-invalid={Boolean(limitProblem)}
          className="max-w-40"
          onChange={(event) =>
            onChange({ ...value, claimLimit: event.target.value.replace(/\D/g, "").slice(0, 6) })
          }
        />
      </Field>
    </div>
  );
}

function Choice({
  value,
  icon: Icon,
  title,
  hint,
  checked,
  disabled,
  children,
}: {
  value: RewardKind;
  icon: typeof Gift;
  title: string;
  hint: string;
  checked: boolean;
  disabled?: boolean;
  children?: ReactNode;
}) {
  return (
    <label
      className={cn(
        "block cursor-pointer rounded-lg border p-3",
        checked && "border-primary bg-primary-soft",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <span className="flex items-center gap-3">
        <RadioGroupItem value={value} disabled={disabled} />
        <Icon className="text-primary-text size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{title}</span>
          <span className="text-fg-muted block text-xs">{hint}</span>
        </span>
      </span>
      {children}
    </label>
  );
}
