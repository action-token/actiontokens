"use client";

import {
  BellRing,
  Gem,
  Link2,
  Loader2,
  MapPin,
  Percent,
  Sparkles,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@actiontokens/ui/components/button";
import { Input } from "@actiontokens/ui/components/input";
import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@actiontokens/ui/components/tabs";
import { cn } from "@actiontokens/ui/lib/cn";
import { ErrorState } from "@actiontokens/ui/patterns/error-state";
import { Field } from "@actiontokens/ui/patterns/form-page";
import { PageBody, PageHeader } from "@actiontokens/ui/patterns/page-header";

import { api, type RouterOutputs } from "~/trpc/react";

import { messageOf } from "../murals/model";
import { ContractFeeCard } from "./contract-fee-card";
import { SettingCard, UnitInput } from "./setting-card";

type Saved = RouterOutputs["admin"]["settings"]["get"]["saved"];
type Rules = Saved["alertRules"];
type RuleKey = keyof Rules;
type Form = Record<Exclude<keyof Saved, "alertRules"> | RuleKey, string>;

/** Alert thresholds: label, unit and the range the server accepts. */
const RULES: { key: RuleKey; label: string; min: number; max: number }[] = [
  { key: "failedPayments", label: "Failed payments in 24 h", min: 1, max: 1000 },
  { key: "signInFailures", label: "Failed sign-ins from one IP in 1 h", min: 1, max: 10_000 },
  { key: "claimSpeedKmh", label: "Claim speed limit (km/h)", min: 10, max: 5000 },
  { key: "largeOrderUsd", label: "Large payment (USD)", min: 1, max: 10_000_000 },
  { key: "stuckMinutes", label: "Payment stuck after (minutes)", min: 1, max: 10_080 },
];

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
  fanTokenStartSupply: String(Number(saved.fanTokenStartSupply)),
  ...(Object.fromEntries(
    RULES.map((rule) => [rule.key, String(saved.alertRules[rule.key])]),
  ) as Record<RuleKey, string>),
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
  if (!/^\d{1,12}$/.test(form.fanTokenStartSupply.trim()))
    errors.fanTokenStartSupply = "A whole number (0 issues none)";
  for (const rule of RULES) {
    const value = Number(form[rule.key]);
    if (form[rule.key].trim() === "" || Number.isNaN(value) || value < rule.min || value > rule.max)
      errors[rule.key] = `${rule.min.toLocaleString("en")} to ${rule.max.toLocaleString("en")}`;
  }
  return errors;
}

type TabId = "fees" | "prices" | "map" | "alerts" | "nft";
const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: "fees", label: "Fees", icon: Percent },
  { id: "prices", label: "Prices", icon: Link2 },
  { id: "map", label: "Map & artists", icon: MapPin },
  { id: "alerts", label: "Alerts", icon: BellRing },
  { id: "nft", label: "Contract NFT", icon: Gem },
];
/** Which tab each form field lives on (so a tab can show it has a mistake). */
const TAB_OF: Partial<Record<keyof Form, TabId>> = {
  platformFeeBps: "fees",
  platformFeeRecipient: "fees",
  vanityMonthlyBandcoin: "prices",
  vanityMonthlyUsd: "prices",
  vanityNameChangeBandcoin: "prices",
  vanityNameChangeUsd: "prices",
  nearbyPinRadiusMeters: "map",
  fanTokenStartSupply: "map",
  ...Object.fromEntries(RULES.map((rule) => [rule.key, "alerts" as const])),
};

/** Admin › Settings: tabs of cards, and a floating bar that saves what changed. */
export function AdminSettingsView() {
  const settings = api.admin.settings.get.useQuery(undefined, { refetchOnWindowFocus: false });
  return (
    <PageBody className="grid gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Settings"
        description="Fees and prices for the whole of Bandcoin. Every change is in the activity log."
      />
      {settings.isPending ? (
        <Skeleton className="h-96 w-full rounded-[1.75rem]" />
      ) : settings.isError ? (
        <ErrorState message="Couldn't load the settings." onRetry={() => void settings.refetch()} />
      ) : (
        <SavedForm
          key={settings.dataUpdatedAt}
          saved={settings.data.saved}
          treasury={settings.data.treasury}
        />
      )}
    </PageBody>
  );
}

function SavedForm({ saved, treasury }: { saved: Saved; treasury: string }) {
  const utils = api.useUtils();
  const [form, setForm] = useState(() => toForm(saved));
  const errors = errorsOf(form);
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

  const [tab, setTab] = useState<TabId>("fees");
  const changed = (Object.keys(form) as (keyof Form)[]).filter(
    (key) => form[key] !== toForm(saved)[key],
  );
  const badTabs = new Set(
    (Object.keys(errors) as (keyof Form)[]).map((key) => TAB_OF[key]).filter(Boolean),
  );
  const changedTabs = new Set(changed.map((key) => TAB_OF[key]).filter(Boolean));
  const input = (id: string, key: keyof Form, unit?: string, className?: string) =>
    unit ? (
      <UnitInput
        id={id}
        unit={unit}
        inputMode="decimal"
        value={form[key]}
        onChange={set(key)}
        className={className}
      />
    ) : (
      <Input
        id={id}
        inputMode="numeric"
        value={form[key]}
        onChange={set(key)}
        className={className}
      />
    );

  return (
    <div className="grid gap-6 pb-24">
      <form
        className="grid gap-6"
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
            fanTokenStartSupply: form.fanTokenStartSupply.trim(),
            alertRules: Object.fromEntries(
              RULES.map((rule) => [rule.key, Number(form[rule.key])]),
            ) as Rules,
          });
        }}
      >
        {/* the same tabs as every other page: Tabs with the line list */}
        <Tabs value={tab} onValueChange={(value) => setTab(value as TabId)}>
          <TabsList variant="line" className="w-full justify-start overflow-x-auto border-b">
            {TABS.map((entry) => (
              <TabsTrigger key={entry.id} value={entry.id} className="flex-none">
                <entry.icon />
                {entry.label}
                {badTabs.has(entry.id) ? (
                  <span aria-label="Needs a fix" className="bg-danger size-2 rounded-full" />
                ) : (
                  changedTabs.has(entry.id) && (
                    <span aria-label="Unsaved" className="bg-primary-text size-2 rounded-full" />
                  )
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div role="tabpanel" id="panel-fees" aria-labelledby="tab-fees" hidden={tab !== "fees"}>
          <SettingCard
            icon={Percent}
            title="Platform fee"
            description="What Bandcoin takes from each song, item and membership sale. Contract NFTs use the contract's own fee, on the Contract NFT tab."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
              <Field label="Fee" htmlFor="fee" error={errors.platformFeeBps}>
                {input("fee", "platformFeeBps", "%")}
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
          </SettingCard>
        </div>

        <div
          role="tabpanel"
          id="panel-prices"
          aria-labelledby="tab-prices"
          hidden={tab !== "prices"}
        >
          <SettingCard
            icon={Link2}
            title="Short link prices"
            description="What an artist pays for a bandcoin.io/name link. Until both prices of a kind are set, artists can't pay for it."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="bg-surface-2 grid gap-4 rounded-2xl p-4">
                <p className="display text-lg">Monthly</p>
                <Field label="In BANDCOIN" htmlFor="vm-b" error={errors.vanityMonthlyBandcoin}>
                  {input("vm-b", "vanityMonthlyBandcoin", "BANDCOIN")}
                </Field>
                <Field label="In dollars" htmlFor="vm-u" error={errors.vanityMonthlyUsd}>
                  {input("vm-u", "vanityMonthlyUsd", "USD")}
                </Field>
              </div>
              <div className="bg-surface-2 grid gap-4 rounded-2xl p-4">
                <p className="display text-lg">Name change</p>
                <Field label="In BANDCOIN" htmlFor="vn-b" error={errors.vanityNameChangeBandcoin}>
                  {input("vn-b", "vanityNameChangeBandcoin", "BANDCOIN")}
                </Field>
                <Field label="In dollars" htmlFor="vn-u" error={errors.vanityNameChangeUsd}>
                  {input("vn-u", "vanityNameChangeUsd", "USD")}
                </Field>
              </div>
            </div>
          </SettingCard>
        </div>

        <div
          role="tabpanel"
          id="panel-map"
          aria-labelledby="tab-map"
          hidden={tab !== "map"}
          className="grid gap-5 lg:grid-cols-2"
        >
          <SettingCard
            icon={MapPin}
            title="Nearby pins"
            description="How close a fan has to be for a pin to count as nearby."
          >
            <Field label="Radius" htmlFor="radius" error={errors.nearbyPinRadiusMeters}>
              {input("radius", "nearbyPinRadiusMeters", "m")}
            </Field>
          </SettingCard>
          <SettingCard
            icon={UserPlus}
            title="New artists"
            description="When you approve an artist, Bandcoin opens their storage account (about 3 XLM from the platform) and issues this many of their fan token into it."
          >
            <Field
              label="Starting fan tokens"
              htmlFor="start-supply"
              error={errors.fanTokenStartSupply}
            >
              {input("start-supply", "fanTokenStartSupply")}
            </Field>
          </SettingCard>
        </div>

        <div
          role="tabpanel"
          id="panel-alerts"
          aria-labelledby="tab-alerts"
          hidden={tab !== "alerts"}
        >
          <SettingCard
            icon={BellRing}
            title="Alert thresholds"
            description="When something shows up on the Alerts page."
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {RULES.map((rule) => (
                <Field
                  key={rule.key}
                  label={rule.label}
                  htmlFor={`rule-${rule.key}`}
                  error={errors[rule.key]}
                >
                  {input(`rule-${rule.key}`, rule.key)}
                </Field>
              ))}
            </div>
          </SettingCard>
        </div>

        {/* the save bar: floats at the bottom, only while something has changed */}
        <div
          aria-hidden={changed.length === 0}
          className={cn(
            "pointer-events-none fixed inset-x-0 bottom-[calc(var(--phone-bar-space,0px)+1rem)] z-30 flex justify-center px-4 transition-all duration-300 sm:pl-(--side-w)",
            changed.length ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0",
          )}
        >
          <div className="bg-[#16170f] pointer-events-auto flex items-center gap-3 rounded-full py-2 pr-2 pl-5 text-[#f3f4ea] shadow-[0_20px_40px_-12px_rgb(0_0_0/0.5)]">
            <span className="text-sm font-semibold">
              {changed.length} unsaved {changed.length === 1 ? "change" : "changes"}
              {Object.keys(errors).length > 0 && (
                <span className="text-danger"> · fix the red ones</span>
              )}
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              tabIndex={changed.length ? 0 : -1}
              disabled={update.isPending}
              onClick={() => setForm(toForm(saved))}
              className="rounded-full text-[#f3f4ea] hover:bg-white/10 hover:text-white"
            >
              Undo
            </Button>
            <Button
              type="submit"
              size="sm"
              tabIndex={changed.length ? 0 : -1}
              disabled={update.isPending || Object.keys(errors).length > 0}
              className="rounded-full"
            >
              {update.isPending && <Loader2 className="animate-spin" />}
              Save
            </Button>
          </div>
        </div>
      </form>
      <div role="tabpanel" id="panel-nft" aria-labelledby="tab-nft" hidden={tab !== "nft"}>
        {tab === "nft" && <ContractFeeCard />}
      </div>
    </div>
  );
}
