"use client";

import { Coins, Sparkles, Trash2, Wallet } from "lucide-react";
import { useState } from "react";

import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@bandcoin/ui/components/tabs";
import { StatCard } from "@bandcoin/ui/patterns/stat-card";

import { api, type RouterOutputs } from "~/trpc/react";

import { TOOL_PAGES } from "../shell/nav";

type Tool = RouterOutputs["coins"]["usage"]["byTool"][number];

const PERIODS = [
  { value: "7", label: "7 days", days: 7 },
  { value: "30", label: "30 days", days: 30 },
  { value: "90", label: "90 days", days: 90 },
  { value: "all", label: "All time", days: undefined },
] as const;

const count = (value: number) => value.toLocaleString("en-US");

/** Your own numbers for a period: coins spent and bought, creations, and each tool. */
export function CoinUsage() {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["value"]>("30");
  const days = PERIODS.find((entry) => entry.value === period)?.days;
  const usage = api.coins.usage.useQuery({ days });
  const data = usage.data;
  const empty = data ? data.spent + data.bought + data.bonus + data.creations === 0 : false;

  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="display text-xl">Your usage</h2>
        <Tabs value={period} onValueChange={(value) => setPeriod(value as typeof period)}>
          <TabsList>
            {PERIODS.map((entry) => (
              <TabsTrigger key={entry.value} value={entry.value}>
                {entry.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard icon={Coins} label="Coins spent" value={data ? count(data.spent) : "…"} />
        <StatCard
          icon={Wallet}
          label="Coins bought"
          value={data ? count(data.bought) : "…"}
          hint={data && data.bonus > 0 ? `+${count(data.bonus)} bonus` : undefined}
        />
        <StatCard icon={Sparkles} label="Creations" value={data ? count(data.creations) : "…"} />
      </div>

      {usage.isPending ? (
        <Skeleton className="h-28 w-full rounded-xl" />
      ) : empty ? (
        <p className="text-fg-muted text-sm">Nothing in this period.</p>
      ) : data && data.byTool.length > 0 ? (
        <ul className="bg-surface divide-y rounded-xl border">
          {data.byTool.map((tool) => (
            <ToolLine key={tool.type ?? "removed"} tool={tool} />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function ToolLine({ tool }: { tool: Tool }) {
  const page = tool.type ? TOOL_PAGES[tool.type] : null;
  const Icon = page?.icon ?? Trash2;
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Icon className="text-fg-muted size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
        {page?.label ?? "Removed"}
      </span>
      <span className="text-fg-muted text-xs tabular-nums">
        {count(tool.creations)} {tool.creations === 1 ? "creation" : "creations"}
      </span>
      <span className="w-24 text-right text-sm font-bold tabular-nums">
        {count(tool.spent)} coins
      </span>
    </li>
  );
}
