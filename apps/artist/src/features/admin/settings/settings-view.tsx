"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { Field } from "@bandcoin/ui/patterns/form-page";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";

import { api, type RouterOutputs } from "~/trpc/react";

import { messageOf } from "../murals/model";
import { SettingsSection } from "../../settings/settings-section";
import { ContractFeeCard } from "./contract-fee-card";

type Saved = RouterOutputs["admin"]["settings"]["get"]["saved"];
type Form = Record<keyof Saved, string>;

const ACCOUNT = /^G[A-Z2-7]{55}$/;
const AMOUNT = /^\d+(\.\d{1,7})?$/;
const MONEY_FIELDS = [
  "vanityMonthlyBandcoin",
  "vanityMonthlyUsd",
  "vanityNameChangeBandcoin",
  "vanityNameChangeUsd",
] as const;

const toForm = (saved: Saved): Form => ({
  platformFeeBps: String(saved.platformFeeBps / 100),
  platformFeeRecipient: saved.platformFeeRecipient ?? "",
  vanityMonthlyBandcoin: saved.vanityMonthlyBandcoin ?? "",
  vanityMonthlyUsd: saved.vanityMonthlyUsd ?? "",
  vanityNameChangeBandcoin: saved.vanityNameChangeBandcoin ?? "",
  vanityNameChangeUsd: saved.vanityNameChangeUsd ?? "",
  nearbyPinRadiusMeters: String(saved.nearbyPinRadiusMeters),
});

function errorsOf(form: Form) {
  const fee = Number(form.platformFeeBps);
  const radius = Number(form.nearbyPinRadiusMeters);
  const errors: Partial<Record<keyof Form, string>> = {};
  if (form.platformFeeBps.trim() === "" || Number.isNaN(fee) || fee < 0 || fee > 10)
    errors.platformFeeBps = "0 to 10%";
  if (form.platformFeeRecipient.trim() && !ACCOUNT.test(form.platformFeeRecipient.trim()))
    errors.platformFeeRecipient = "A Stellar account starts with G";
  for (const key of MONEY_FIELDS)
    if (form[key].trim() && !AMOUNT.test(form[key].trim())) errors[key] = "A number";
  if (Number.isNaN(radius) || radius < 10 || radius > 50_000)
    errors.nearbyPinRadiusMeters = "10 to 50,000 m";
  return errors;
}

/** Admin › Settings: the platform fee, short link prices and the pin radius, then the contract-NFT fee. */
export function AdminSettingsView() {
  const settings = api.admin.settings.get.useQuery(undefined, { refetchOnWindowFocus: false });
  return (
    <PageBody className="grid gap-8">
      <PageHeader
        eyebrow="Admin"
        title="Settings"
        description="Fees and prices for the whole of Bandcoin. Every change is in the activity log."
      />
      {settings.isPending ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : settings.isError ? (
        <ErrorState message="Couldn't load the settings." onRetry={() => void settings.refetch()} />
      ) : (
        <SavedForm
          key={settings.dataUpdatedAt}
          saved={settings.data.saved}
          treasury={settings.data.treasury}
        />
      )}
      <ContractFeeCard />
    </PageBody>
  );
}

function SavedForm({ saved, treasury }: { saved: Saved; treasury: string }) {
  const utils = api.useUtils();
  const [form, setForm] = useState(() => toForm(saved));
  const errors = errorsOf(form);
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(saved));
  const set = (key: keyof Form) => (event: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));
  const update = api.admin.settings.update.useMutation({
    onSuccess: ({ changes }) => {
      toast.success(
        changes.length
          ? `Saved: ${changes.map((change) => change.label.toLowerCase()).join(", ")}`
          : "Nothing changed",
      );
      void utils.admin.settings.get.invalidate();
    },
    onError: (error) => toast.error(messageOf(error)),
  });
  const money = (key: (typeof MONEY_FIELDS)[number]) => form[key].trim() || null;

  return (
    <form
      className="grid gap-8"
      onSubmit={(event) => {
        event.preventDefault();
        if (Object.keys(errors).length) return;
        update.mutate({
          platformFeeBps: Math.round(Number(form.platformFeeBps) * 100),
          platformFeeRecipient: form.platformFeeRecipient.trim() || null,
          vanityMonthlyBandcoin: money("vanityMonthlyBandcoin"),
          vanityMonthlyUsd: money("vanityMonthlyUsd"),
          vanityNameChangeBandcoin: money("vanityNameChangeBandcoin"),
          vanityNameChangeUsd: money("vanityNameChangeUsd"),
          nearbyPinRadiusMeters: Number(form.nearbyPinRadiusMeters),
        });
      }}
    >
      <SettingsSection
        title="Platform fee"
        description="What Bandcoin takes from each song, item and membership sale. Contract NFTs use the contract's own fee, below."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
          <Field label="Fee (%)" htmlFor="fee" error={errors.platformFeeBps}>
            <Input
              id="fee"
              inputMode="decimal"
              value={form.platformFeeBps}
              onChange={set("platformFeeBps")}
            />
          </Field>
          <Field
            label="Goes to"
            htmlFor="fee-to"
            error={errors.platformFeeRecipient}
            hint="Empty: the platform treasury"
          >
            <Input
              id="fee-to"
              value={form.platformFeeRecipient}
              placeholder={treasury}
              spellCheck={false}
              className="font-mono text-xs"
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  platformFeeRecipient: event.target.value.toUpperCase(),
                }))
              }
            />
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Short link prices"
        description="What an artist pays for a bandcoin.io/name link. Until both prices of a kind are set, artists can't pay for it."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Monthly, BANDCOIN" htmlFor="vm-b" error={errors.vanityMonthlyBandcoin}>
            <Input
              id="vm-b"
              inputMode="decimal"
              value={form.vanityMonthlyBandcoin}
              onChange={set("vanityMonthlyBandcoin")}
            />
          </Field>
          <Field label="Monthly, USD" htmlFor="vm-u" error={errors.vanityMonthlyUsd}>
            <Input
              id="vm-u"
              inputMode="decimal"
              value={form.vanityMonthlyUsd}
              onChange={set("vanityMonthlyUsd")}
            />
          </Field>
          <Field
            label="Name change, BANDCOIN"
            htmlFor="vn-b"
            error={errors.vanityNameChangeBandcoin}
          >
            <Input
              id="vn-b"
              inputMode="decimal"
              value={form.vanityNameChangeBandcoin}
              onChange={set("vanityNameChangeBandcoin")}
            />
          </Field>
          <Field label="Name change, USD" htmlFor="vn-u" error={errors.vanityNameChangeUsd}>
            <Input
              id="vn-u"
              inputMode="decimal"
              value={form.vanityNameChangeUsd}
              onChange={set("vanityNameChangeUsd")}
            />
          </Field>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Nearby pins"
        description="How close a fan has to be for a pin to count as nearby."
      >
        <Field label="Radius (m)" htmlFor="radius" error={errors.nearbyPinRadiusMeters}>
          <Input
            id="radius"
            inputMode="numeric"
            className="sm:w-40"
            value={form.nearbyPinRadiusMeters}
            onChange={set("nearbyPinRadiusMeters")}
          />
        </Field>
      </SettingsSection>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button
          type="button"
          variant="ghost"
          disabled={!dirty || update.isPending}
          onClick={() => setForm(toForm(saved))}
        >
          Undo changes
        </Button>
        <Button
          type="submit"
          disabled={!dirty || update.isPending || Object.keys(errors).length > 0}
        >
          {update.isPending && <Loader2 className="animate-spin" />}
          Save
        </Button>
      </div>
    </form>
  );
}
