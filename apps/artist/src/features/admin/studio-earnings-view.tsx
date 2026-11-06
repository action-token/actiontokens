"use client";

import { Coins } from "lucide-react";
import { useState } from "react";

import { Tabs, TabsList, TabsTrigger } from "@bandcoin/ui/components/tabs";
import { DataTable, type Column } from "@bandcoin/ui/patterns/data-table";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";
import { StatCard } from "@bandcoin/ui/patterns/stat-card";

import { api, type RouterOutputs } from "~/trpc/react";

type Row = RouterOutputs["admin"]["settings"]["studioEarnings"]["models"][number];

const WINDOWS = [
  { value: "7", label: "7 days", days: 7 },
  { value: "30", label: "30 days", days: 30 },
  { value: "90", label: "90 days", days: 90 },
  { value: "all", label: "All time", days: undefined },
] as const;

const usd = (value: number) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const coins = (value: number) => value.toLocaleString("en-US");

const columns: Column<Row>[] = [
  { id: "model", header: "Model", cell: (row) => <span className="font-medium">{row.name}</span> },
  {
    id: "runs",
    header: "Runs",
    align: "right",
    cell: (row) => coins(row.runs),
    skeleton: "number",
  },
  {
    id: "refunds",
    header: "Refunded",
    align: "right",
    cell: (row) => (row.refunds ? coins(row.refunds) : "–"),
    skeleton: "number",
  },
  {
    id: "coins",
    header: "Coins kept",
    align: "right",
    cell: (row) => coins(row.netCoins),
    skeleton: "number",
  },
  {
    id: "provider",
    header: "Provider (est.)",
    align: "right",
    cell: (row) => usd(row.providerCostUsd),
    skeleton: "number",
  },
  {
    id: "platform",
    header: "Platform share",
    align: "right",
    cell: (row) => <span className="font-semibold">{usd(row.platformUsd)}</span>,
    skeleton: "number",
  },
];

/**
 * Admin › Studio earnings: what the platform makes on Studio runs, from the coin ledger. The
 * provider's part is worked out from the fee in Settings, so it is an estimate; the provider's own
 * invoice is the real figure.
 */
export function StudioEarningsView() {
  const [window, setWindow] = useState<(typeof WINDOWS)[number]["value"]>("30");
  const days = WINDOWS.find((entry) => entry.value === window)?.days;
  const report = api.admin.settings.studioEarnings.useQuery(
    { days },
    { refetchOnWindowFocus: false },
  );
  const totals = report.data?.totals;

  return (
    <PageBody className="grid gap-6">
      <PageHeader
        title="Studio earnings"
        description={
          <>
            Coins spent on AI runs, net of refunds. One coin is one cent
            {report.data ? <>; the fee on top is {report.data.feePercent}%</> : null}.
          </>
        }
        actions={
          <Tabs value={window} onValueChange={(value) => setWindow(value as typeof window)}>
            <TabsList>
              {WINDOWS.map((entry) => (
                <TabsTrigger key={entry.value} value={entry.value}>
                  {entry.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={Coins}
          label="Money in"
          value={totals ? usd(totals.moneyInUsd) : "…"}
          hint="Top-ups, at a cent a coin"
        />
        <StatCard
          label="Spent on runs"
          value={totals ? `${coins(totals.spentCoins)} coins` : "…"}
          hint="After refunds"
        />
        <StatCard
          label="Platform share"
          value={totals ? usd(totals.platformUsd) : "…"}
          hint={totals ? `Provider cost (est.) ${usd(totals.providerCostUsd)}` : undefined}
        />
        <StatCard
          label="After bonus coins"
          value={totals ? usd(totals.afterBonusesUsd) : "…"}
          hint={
            totals
              ? `${coins(totals.bonusCoins)} bonus coins given away`
              : "Share minus the bonuses"
          }
        />
      </div>

      <DataTable
        label="Earnings by model"
        columns={columns}
        rows={report.data?.models}
        rowKey={(row) => row.key}
        loading={report.isPending}
        error={report.isError ? "Couldn't load the report." : null}
        onRetry={() => void report.refetch()}
        empty={{
          icon: Coins,
          title: "No runs in this period",
          description: "Runs appear here once someone spends Studio coins.",
        }}
        footer={
          totals ? (
            <p className="text-muted-foreground px-4 py-3 text-xs">
              Users hold {coins(totals.heldCoins)} unspent coins in total
              {totals.withdrawnCoins
                ? `; ${coins(totals.withdrawnCoins)} coins were withdrawn`
                : ""}
              . The platform share counts rounding up to whole coins; bonus coins are only a cost
              once they are spent.
            </p>
          ) : null
        }
      />
    </PageBody>
  );
}
