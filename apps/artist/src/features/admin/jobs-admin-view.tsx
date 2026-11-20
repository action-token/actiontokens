"use client";

import { RotateCcw, Workflow } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Tabs, TabsList, TabsTrigger } from "@bandcoin/ui/components/tabs";
import { DataTable, type Column } from "@bandcoin/ui/patterns/data-table";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";
import { StatusPill, type Tone } from "@bandcoin/ui/patterns/status-pill";
import { Toolbar } from "@bandcoin/ui/patterns/toolbar";

import { timeAgo } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

type Row = RouterOutputs["admin"]["jobs"]["list"]["jobs"][number];
type Filter = "all" | "failed" | "waiting" | "running" | "done";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "failed", label: "Failed" },
  { value: "waiting", label: "Waiting" },
  { value: "running", label: "Running" },
  { value: "done", label: "Done" },
];

const KIND: Record<string, string> = {
  "order.reconcile": "Payment check",
  "media.transcode": "Music processing",
  "nft.unlocks": "NFT unlocks",
  "nft.keep-alive": "NFT records kept alive",
  "hotspot.drop": "Hotspot drops",
  "vanity.expire": "Short links",
  "domains.check": "Custom domains",
};

const STATUS: Record<Row["status"], { tone: Tone; label: string }> = {
  QUEUED: { tone: "neutral", label: "Waiting" },
  RUNNING: { tone: "info", label: "Running" },
  SUCCEEDED: { tone: "success", label: "Done" },
  FAILED: { tone: "danger", label: "Failed" },
  CANCELED: { tone: "neutral", label: "Canceled" },
};

/** The worker's queue. Failed music jobs can be retried; payment jobs never are. */
export function JobsAdminView() {
  const utils = api.useUtils();
  const [filter, setFilter] = useState<Filter>("all");
  const list = api.admin.jobs.list.useInfiniteQuery(
    { status: filter === "all" ? undefined : filter },
    { getNextPageParam: (page) => page.nextCursor },
  );
  const retry = api.admin.jobs.retry.useMutation({
    onSuccess: () => {
      toast.success("Queued again");
      void utils.admin.jobs.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const columns: Column<Row>[] = [
    {
      id: "job",
      header: "Job",
      skeleton: "text",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{KIND[row.type] ?? row.type}</p>
          <p className="text-fg-muted truncate text-xs">
            {row.about
              ? `${row.about.title}${row.about.artist ? ` · ${row.about.artist}` : ""}`
              : row.id}
          </p>
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      skeleton: "pill",
      cell: (row) => (
        <StatusPill tone={STATUS[row.status].tone}>{STATUS[row.status].label}</StatusPill>
      ),
    },
    {
      id: "error",
      header: "Last error",
      skeleton: "text",
      cell: (row) => (
        <p className="text-fg-muted line-clamp-2 max-w-md text-xs" title={row.lastError ?? ""}>
          {row.lastError ?? "—"}
        </p>
      ),
    },
    {
      id: "tries",
      header: "Tries",
      align: "right",
      skeleton: "number",
      cell: (row) => (
        <span className="num text-fg-muted text-sm">
          {row.attempts} / {row.maxAttempts}
        </span>
      ),
    },
    {
      id: "when",
      header: "Updated",
      align: "right",
      skeleton: "number",
      cell: (row) => <span className="text-fg-muted text-sm">{timeAgo(row.updatedAt)}</span>,
    },
  ];

  return (
    <PageBody className="grid gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Jobs"
        description="What the worker ran, what's waiting and what failed. Music jobs that failed can be retried; payment checks run again by themselves every minute."
      />
      <Toolbar>
        <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
          <TabsList variant="line" className="w-full justify-start overflow-x-auto border-b">
            {FILTERS.map((entry) => (
              <TabsTrigger key={entry.value} value={entry.value} className="flex-none">
                {entry.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </Toolbar>

      <DataTable
        label="Jobs"
        columns={columns}
        rows={list.data?.pages.flatMap((page) => page.jobs)}
        rowKey={(row) => row.id}
        loading={list.isPending}
        error={list.isError ? "Couldn't load jobs." : null}
        onRetry={() => void list.refetch()}
        actions={(row) => [
          ...(row.canRetry
            ? [
                {
                  label: "Retry",
                  icon: RotateCcw,
                  separator: true,
                  disabled: retry.isPending,
                  onSelect: () => retry.mutate({ jobId: row.id }),
                },
              ]
            : []),
        ]}
        empty={{ icon: Workflow, title: "No jobs here" }}
        footer={
          list.hasNextPage ? (
            <Button
              variant="ghost"
              disabled={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            >
              {list.isFetchingNextPage ? "Loading…" : "Show more"}
            </Button>
          ) : undefined
        }
      />
    </PageBody>
  );
}
