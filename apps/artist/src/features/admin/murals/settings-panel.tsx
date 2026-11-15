"use client";

import { Coins, Info, Repeat, Save, Sparkles, Users } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";

import { api } from "~/trpc/react";

import { messageOf } from "./model";

type Form = {
  coinsPerScan: number;
  discoveryBonus: number;
  dailyScansPerMural: number;
  confirmationsNeeded: number;
};

const FIELDS: {
  key: keyof Form;
  label: string;
  help: string;
  icon: typeof Coins;
  min: number;
  max: number;
  suffix: string;
}[] = [
  {
    key: "coinsPerScan",
    label: "Coins per scan",
    help: "Every valid scan, approved or not.",
    icon: Coins,
    min: 0,
    max: 10_000,
    suffix: "coins",
  },
  {
    key: "discoveryBonus",
    label: "Discovery bonus",
    help: "Extra for each of the first finders.",
    icon: Sparkles,
    min: 0,
    max: 100_000,
    suffix: "coins",
  },
  {
    key: "dailyScansPerMural",
    label: "Scans per mural per day",
    help: "Per person; resets at their local midnight. Other murals are unlimited.",
    icon: Repeat,
    min: 1,
    max: 50,
    suffix: "scans",
  },
  {
    key: "confirmationsNeeded",
    label: "Finders before review",
    help: "Different people who must scan it before it reaches review. They all get the bonus.",
    icon: Users,
    min: 1,
    max: 20,
    suffix: "people",
  },
];

/** The single mural settings row: what scans pay and the anti-abuse limits. */
export function SettingsPanel() {
  const utils = api.useUtils();
  const saved = api.admin.murals.settings.useQuery(undefined, { refetchOnWindowFocus: false });
  // Unsaved edits; null = showing what's saved.
  const [draft, setDraft] = useState<Form | null>(null);
  const save = api.admin.murals.updateSettings.useMutation({
    onSuccess: (settings) => {
      utils.admin.murals.settings.setData(undefined, settings);
      setDraft(null);
      toast.success("Mural settings saved");
    },
    onError: (error) => toast.error(messageOf(error)),
  });

  if (saved.isError)
    return (
      <ErrorState message="Couldn't load the settings." onRetry={() => void saved.refetch()} />
    );
  if (!saved.data) return <Skeleton className="h-80 w-full max-w-2xl rounded-xl" />;
  const form: Form = draft ?? saved.data;

  const dirty = FIELDS.some((field) => form[field.key] !== saved.data[field.key]);
  const valid = FIELDS.every(
    (field) =>
      Number.isInteger(form[field.key]) &&
      form[field.key] >= field.min &&
      form[field.key] <= field.max,
  );

  return (
    <form
      className="bg-surface rounded-[1.4rem] border-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid) save.mutate(form);
      }}
    >
      <div className="divide-y">
        {FIELDS.map((field) => (
          <label
            key={field.key}
            className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5"
          >
            <span className="flex min-w-0 flex-1 items-start gap-3">
              <field.icon className="text-fg-muted mt-0.5 size-4 shrink-0" />
              <span>
                <span className="block text-sm font-semibold">{field.label}</span>
                <span className="text-fg-muted mt-0.5 block text-xs">{field.help}</span>
              </span>
            </span>
            <span className="flex items-center gap-2 sm:w-44">
              <Input
                type="number"
                inputMode="numeric"
                min={field.min}
                max={field.max}
                step={1}
                value={Number.isNaN(form[field.key]) ? "" : form[field.key]}
                onChange={(event) => setDraft({ ...form, [field.key]: event.target.valueAsNumber })}
                className="num"
              />
              <span className="text-fg-muted w-12 text-xs">{field.suffix}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t px-4 py-3 sm:px-5">
        <p className="text-fg-muted flex items-center gap-1.5 text-xs">
          <Info className="size-3.5" /> Applies to new scans from now; past coins don&apos;t change.
        </p>
        <div className="ml-auto flex gap-2">
          {dirty && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setDraft(null)}>
              Reset
            </Button>
          )}
          <Button type="submit" size="sm" disabled={!dirty || !valid || save.isPending}>
            <Save /> {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </form>
  );
}
