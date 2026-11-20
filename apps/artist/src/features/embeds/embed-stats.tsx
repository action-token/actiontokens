"use client";

import { useState } from "react";

import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { cn } from "@actiontokens/ui/lib/cn";
import { ErrorState } from "@actiontokens/ui/patterns/error-state";

import { api } from "~/trpc/react";

const METRICS = [
  { key: "views", label: "Map views", hint: "Times the map loaded on a website" },
  { key: "pinTaps", label: "Pin taps", hint: "Visitors opened a pin's card" },
  { key: "openClicks", label: "Opened in Bandcoin", hint: "Visitors went on to Bandcoin" },
  { key: "eventsClicks", label: "Events button", hint: "Clicks on the events button" },
  { key: "bountiesClicks", label: "Bounties button", hint: "Clicks on the bounties button" },
] as const;

type Metric = (typeof METRICS)[number]["key"];

/** Totals plus a day-by-day table (UTC days). The counts come from the AR app. */
export function EmbedStats({ id }: { id: string }) {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const stats = api.embeds.embedStats.useQuery({ embedId: id, days });

  if (stats.isPending) return <Skeleton className="m-8 h-64 w-full max-w-4xl rounded-xl" />;
  if (stats.isError)
    return <ErrorState message="Couldn't load the stats." onRetry={() => void stats.refetch()} />;

  const rows = stats.data;
  const total = (key: Metric) => rows.reduce((sum, row) => sum + row[key], 0);
  const views = total("views");
  const taps = total("pinTaps");
  const opens = total("openClicks");

  return (
    <div className="mx-auto grid max-w-4xl gap-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="display text-2xl">How the map is doing</h2>
        <div className="bg-surface-2 flex gap-1 rounded-xl border p-1">
          {([7, 30, 90] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setDays(option)}
              className={cn(
                "rounded-lg px-3 py-1 text-sm",
                days === option ? "bg-surface font-medium shadow-sm" : "text-fg-muted",
              )}
            >
              {option} days
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {METRICS.map((metric) => (
          <div key={metric.key} className="bg-surface rounded-2xl border p-4" title={metric.hint}>
            <p className="text-fg-muted text-xs">{metric.label}</p>
            <p className="num mt-1 text-2xl font-semibold">{total(metric.key).toLocaleString()}</p>
          </div>
        ))}
      </div>

      {views > 0 && (
        <p className="text-fg-muted text-sm">
          {Math.round((taps / views) * 100)}% of views led to a pin tap, and{" "}
          {taps ? Math.round((opens / taps) * 100) : 0}% of pin taps went on to Bandcoin.
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-fg-muted text-left text-xs">
            <tr>
              <th className="px-4 py-2 font-medium">Day (UTC)</th>
              {METRICS.map((metric) => (
                <th key={metric.key} className="px-4 py-2 text-right font-medium whitespace-nowrap">
                  {metric.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {[...rows].reverse().map((row) => (
              <tr key={row.day} className={cn(row.views === 0 && "text-fg-muted")}>
                <td className="px-4 py-2">{row.day}</td>
                {METRICS.map((metric) => (
                  <td key={metric.key} className="num px-4 py-2 text-right">
                    {row[metric.key].toLocaleString()}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
