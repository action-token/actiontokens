"use client";

import { Coins, Loader2, Plus, Sparkles } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { Switch } from "@bandcoin/ui/components/switch";
import { Field } from "@bandcoin/ui/patterns/form-page";

import { api, type RouterOutputs } from "~/trpc/react";

import { messageOf } from "../murals/model";
import { coinsFor } from "./studio-price";
import { SettingCard } from "./setting-card";

type Studio = RouterOutputs["admin"]["settings"]["studio"];
type Pack = Studio["packages"][number];
type Row = { key: string; label: string; unit: string };

const UNIT = {
  IMAGE: "an image (smallest size, standard quality)",
  VIDEO: "a clip at 720p",
  TEXT: "a run (text, SEO and social posts)",
} as const;
const GROUP = { IMAGE: "Images", VIDEO: "Video", TEXT: "Writing" } as const;
const PROVIDER = { google: "Google", openai: "OpenAI" } as const;
const MUSIC: Row[] = [
  { key: "MUSIC_CLIP", label: "Lyria 3 Clip", unit: "a ~30 s clip" },
  { key: "MUSIC_SONG", label: "Lyria 3 Pro", unit: "a full song" },
  { key: "MUSIC_LIVE", label: "Lyria RealTime", unit: "a live minute" },
];

/** One row per model (grouped by what it makes), then music's three. */
function groupsOf(studio: Studio): { title: string; rows: Row[] }[] {
  return [
    ...(["IMAGE", "VIDEO", "TEXT"] as const).map((tool) => ({
      title: GROUP[tool],
      rows: studio.models
        .filter((model) => model.tool === tool)
        .map((model) => ({
          key: model.id,
          label: `${model.name} · ${PROVIDER[model.provider]}`,
          unit: UNIT[tool],
        })),
    })),
    { title: "Music", rows: MUSIC },
  ];
}

/**
 * Studio prices and coin packages. Each model has its own AI provider cost
 * (a run's options multiply it), plus the platform fee, in coins of one cent
 * each; a package is priced in dollars and may add bonus coins.
 */
export function StudioCard() {
  const studio = api.admin.settings.studio.useQuery(undefined, { refetchOnWindowFocus: false });
  return (
    <div className="grid gap-5">
      {studio.isPending ? (
        <Skeleton className="h-64 w-full rounded-[1.75rem]" />
      ) : studio.data ? (
        <>
          <PricingForm key={JSON.stringify(studio.data.pricing)} studio={studio.data} />
          <Packages packages={studio.data.packages} />
        </>
      ) : (
        <p className="text-fg-muted text-sm">Couldn&apos;t load the Studio settings.</p>
      )}
    </div>
  );
}

function PricingForm({ studio }: { studio: Studio }) {
  const utils = api.useUtils();
  const [fee, setFee] = useState(String(studio.pricing.feePercent));
  const groups = groupsOf(studio);
  const rows = groups.flatMap((group) => group.rows);
  const [costs, setCosts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      rows.map((row) => [row.key, String(studio.pricing.apiCostUsd[row.key] ?? 0)]),
    ),
  );
  const save = api.admin.settings.updateStudioPricing.useMutation({
    onSuccess: () => {
      toast.success("Studio prices saved");
      void utils.admin.settings.studio.invalidate();
    },
    onError: (error) => toast.error(messageOf(error)),
  });
  const feePercent = Number(fee);
  const valid =
    feePercent >= 0 &&
    feePercent <= 500 &&
    rows.every((row) => Number(costs[row.key]) >= 0 && (costs[row.key] ?? "").trim() !== "");

  return (
    <SettingCard
      icon={Sparkles}
      title="AI prices"
      description="What each AI model costs, plus the platform fee on top. One coin is one cent; BANDCOIN, XLM and USDC follow the live rate."
    >
      <Field
        label="Platform fee (%)"
        htmlFor="studio-fee"
        hint="On top of the AI provider's cost for every run."
      >
        <Input
          id="studio-fee"
          inputMode="decimal"
          value={fee}
          onChange={(event) => setFee(event.target.value.replace(/[^\d.]/g, "").slice(0, 5))}
          className="w-full sm:max-w-32"
        />
      </Field>
      {groups.map((group) => (
        <fieldset key={group.title} className="grid gap-3">
          <legend className="mb-1 text-sm font-semibold">{group.title}</legend>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.rows.map((row) => {
              const cost = Number(costs[row.key]);
              return (
                <Field
                  key={row.key}
                  label={`${row.label}: API cost ($)`}
                  htmlFor={`studio-cost-${row.key}`}
                  hint={
                    Number.isFinite(cost) && Number.isFinite(feePercent)
                      ? `Per ${row.unit}: ${coinsFor(cost, feePercent)} coins`
                      : "A dollar amount"
                  }
                >
                  <Input
                    id={`studio-cost-${row.key}`}
                    inputMode="decimal"
                    value={costs[row.key] ?? ""}
                    onChange={(event) =>
                      setCosts({
                        ...costs,
                        [row.key]: event.target.value.replace(/[^\d.]/g, "").slice(0, 8),
                      })
                    }
                  />
                </Field>
              );
            })}
          </div>
        </fieldset>
      ))}
      <Button
        className="justify-self-start"
        disabled={!valid || save.isPending}
        onClick={() =>
          save.mutate({
            feePercent,
            apiCostUsd: Object.fromEntries(rows.map((row) => [row.key, Number(costs[row.key])])),
          })
        }
      >
        {save.isPending && <Loader2 className="animate-spin" />}
        Save prices
      </Button>
    </SettingCard>
  );
}

function Packages({ packages }: { packages: Pack[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <SettingCard
      icon={Coins}
      title="Coin packages"
      description="What fans and artists can buy Studio coins in. Priced in dollars; a package may add bonus coins."
      action={
        !adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus /> Add a package
          </Button>
        )
      }
    >
      <div className="grid gap-3">
        {packages.map((pack) => (
          <PackageRow key={`${pack.id}-${pack.priceUsd}-${pack.bonusCoins}`} pack={pack} />
        ))}
        {adding && <PackageRow onDone={() => setAdding(false)} />}
      </div>
    </SettingCard>
  );
}

function PackageRow({ pack, onDone }: { pack?: Pack; onDone?: () => void }) {
  const utils = api.useUtils();
  const [name, setName] = useState(pack?.name ?? "");
  const [price, setPrice] = useState(pack ? String(pack.priceUsd) : "");
  const [bonus, setBonus] = useState(pack ? String(pack.bonusCoins) : "0");
  const [isActive, setIsActive] = useState(pack?.isActive ?? true);
  const [isPopular, setIsPopular] = useState(pack?.isPopular ?? false);
  const save = api.admin.settings.saveStudioPackage.useMutation({
    onSuccess: () => {
      toast.success(pack ? "Package saved" : "Package added");
      void utils.admin.settings.studio.invalidate();
      onDone?.();
    },
    onError: (error) => toast.error(messageOf(error)),
  });
  const usd = Number(price);
  const coins = Number.isFinite(usd) ? Math.round(usd * 100) : 0;

  return (
    <div className="grid gap-3 border-t pt-3 sm:grid-cols-[1fr_7rem_7rem_auto] sm:items-end">
      <Field label="Name" htmlFor={`pack-name-${pack?.id ?? "new"}`}>
        <Input
          id={`pack-name-${pack?.id ?? "new"}`}
          value={name}
          maxLength={40}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Field
        label="Price ($)"
        htmlFor={`pack-price-${pack?.id ?? "new"}`}
        hint={`${coins.toLocaleString("en-US")} coins`}
      >
        <Input
          id={`pack-price-${pack?.id ?? "new"}`}
          inputMode="decimal"
          value={price}
          onChange={(event) => setPrice(event.target.value.replace(/[^\d.]/g, "").slice(0, 6))}
        />
      </Field>
      <Field label="Bonus coins" htmlFor={`pack-bonus-${pack?.id ?? "new"}`}>
        <Input
          id={`pack-bonus-${pack?.id ?? "new"}`}
          inputMode="numeric"
          value={bonus}
          onChange={(event) => setBonus(event.target.value.replace(/\D/g, "").slice(0, 6))}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3 pb-1">
        <label className="flex items-center gap-1.5 text-xs">
          <Switch checked={isActive} onCheckedChange={setIsActive} /> On sale
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          <Switch checked={isPopular} onCheckedChange={setIsPopular} /> Popular
        </label>
        <Button
          size="sm"
          disabled={save.isPending || !name.trim() || !(usd > 0)}
          onClick={() =>
            save.mutate({
              packageId: pack?.id ?? null,
              name,
              priceUsd: usd,
              bonusCoins: Number(bonus) || 0,
              isActive,
              isPopular,
              sortOrder: pack?.sortOrder ?? 99,
            })
          }
        >
          {save.isPending && <Loader2 className="animate-spin" />}
          {pack ? "Save" : "Add"}
        </Button>
        {!pack && (
          <Button size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
