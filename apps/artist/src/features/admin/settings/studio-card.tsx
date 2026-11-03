"use client";

import { Loader2, Plus } from "lucide-react";
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
import { SettingsSection } from "../../settings/settings-section";

type Studio = RouterOutputs["admin"]["settings"]["studio"];
type Pack = Studio["packages"][number];
type Tool = keyof Studio["pricing"]["apiCostUsd"];

const TOOLS: { type: Tool; label: string }[] = [
  { type: "TEXT", label: "Writing" },
  { type: "IMAGE", label: "Image" },
  { type: "MUSIC", label: "Music" },
  { type: "VIDEO", label: "Video" },
  { type: "SEO", label: "SEO" },
  { type: "SOCIAL", label: "Social post" },
];

/**
 * Studio prices and coin packages. A run costs what the AI provider charges
 * plus the platform fee, in coins of one cent each; a package is priced in
 * dollars and may add bonus coins.
 */
export function StudioCard() {
  const studio = api.admin.settings.studio.useQuery(undefined, { refetchOnWindowFocus: false });
  return (
    <SettingsSection
      title="Studio"
      description="What each AI run costs and the coin packages. One coin is one cent; BANDCOIN, XLM and USDC follow the live rate."
    >
      {studio.isPending ? (
        <Skeleton className="h-64 w-full rounded-xl" />
      ) : studio.data ? (
        <div className="grid gap-4">
          <PricingForm key={JSON.stringify(studio.data.pricing)} studio={studio.data} />
          <Packages packages={studio.data.packages} />
        </div>
      ) : (
        <p className="text-fg-muted text-sm">Couldn&apos;t load the Studio settings.</p>
      )}
    </SettingsSection>
  );
}

function PricingForm({ studio }: { studio: Studio }) {
  const utils = api.useUtils();
  const [fee, setFee] = useState(String(studio.pricing.feePercent));
  const [costs, setCosts] = useState<Record<Tool, string>>(
    Object.fromEntries(
      TOOLS.map((tool) => [tool.type, String(studio.pricing.apiCostUsd[tool.type])]),
    ) as Record<Tool, string>,
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
    TOOLS.every((tool) => Number(costs[tool.type]) >= 0 && costs[tool.type].trim() !== "");

  return (
    <div className="bg-surface grid gap-4 rounded-xl border p-4 sm:p-5">
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((tool) => {
          const cost = Number(costs[tool.type]);
          return (
            <Field
              key={tool.type}
              label={`${tool.label}: API cost ($)`}
              htmlFor={`studio-cost-${tool.type}`}
              hint={
                Number.isFinite(cost) && Number.isFinite(feePercent)
                  ? `Fans pay ${coinsFor(cost, feePercent)} coins a run`
                  : "A dollar amount"
              }
            >
              <Input
                id={`studio-cost-${tool.type}`}
                inputMode="decimal"
                value={costs[tool.type]}
                onChange={(event) =>
                  setCosts({
                    ...costs,
                    [tool.type]: event.target.value.replace(/[^\d.]/g, "").slice(0, 8),
                  })
                }
              />
            </Field>
          );
        })}
      </div>
      <Button
        className="justify-self-start"
        disabled={!valid || save.isPending}
        onClick={() =>
          save.mutate({
            feePercent,
            apiCostUsd: Object.fromEntries(
              TOOLS.map((tool) => [tool.type, Number(costs[tool.type])]),
            ) as Record<Tool, number>,
          })
        }
      >
        {save.isPending && <Loader2 className="animate-spin" />}
        Save prices
      </Button>
    </div>
  );
}

function Packages({ packages }: { packages: Pack[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="bg-surface grid gap-3 rounded-xl border p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Coin packages</h3>
        {!adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus /> Add a package
          </Button>
        )}
      </div>
      {packages.map((pack) => (
        <PackageRow key={`${pack.id}-${pack.priceUsd}-${pack.bonusCoins}`} pack={pack} />
      ))}
      {adding && <PackageRow onDone={() => setAdding(false)} />}
    </div>
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
