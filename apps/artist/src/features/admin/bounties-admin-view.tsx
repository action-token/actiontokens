"use client";

import { Eye, EyeOff, Trophy } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { stellarExpertTxUrl } from "@bandcoin/wallet/config";
import { Button } from "@bandcoin/ui/components/button";
import { Tabs, TabsList, TabsTrigger } from "@bandcoin/ui/components/tabs";
import { DataTable, type Column } from "@bandcoin/ui/patterns/data-table";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";
import { StatusPill, type Tone } from "@bandcoin/ui/patterns/status-pill";
import { SearchInput, Toolbar } from "@bandcoin/ui/patterns/toolbar";

import { Money } from "~/components/money";
import { timeAgo } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

import { FAN_APP_URL } from "../shell/links";
import { HideDialog } from "./hide-dialog";

type Row = RouterOutputs["admin"]["bounties"]["list"]["bounties"][number];
type Filter = "all" | "running" | "paused" | "draft" | "completed" | "hidden";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "running", label: "Running" },
  { value: "paused", label: "Paused" },
  { value: "draft", label: "Drafts" },
  { value: "completed", label: "Finished" },
  { value: "hidden", label: "Hidden" },
];

const ESCROW: Record<Row["escrow"], { tone: Tone; label: string }> = {
  draft: { tone: "neutral", label: "Not funded" },
  held: { tone: "info", label: "Held in escrow" },
  paid: { tone: "success", label: "Paid out" },
};

/** Every bounty and where its prize is. Hiding takes it off fans' screens; the escrow is untouched. */
export function BountiesAdminView() {
  const utils = api.useUtils();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [hiding, setHiding] = useState<Row | null>(null);
  const list = api.admin.bounties.list.useInfiniteQuery(
    { search: search || undefined, status: filter === "all" ? undefined : filter },
    { getNextPageParam: (page) => page.nextCursor },
  );
  const setHidden = api.admin.bounties.setHidden.useMutation({
    onSuccess: (result) => {
      toast.success(result.hidden ? "Bounty hidden from fans" : "Bounty shown again");
      setHiding(null);
      void utils.admin.bounties.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const columns: Column<Row>[] = [
    {
      id: "bounty",
      header: "Bounty",
      skeleton: "text",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{row.title}</p>
          <p className="text-fg-muted truncate text-xs">
            {row.artist.name} · {timeAgo(row.createdAt)}
          </p>
        </div>
      ),
    },
    {
      id: "prize",
      header: "Prize",
      align: "right",
      skeleton: "number",
      cell: (row) => (
        <span className="text-sm">
          <Money amount={row.prize.amount} currency={row.prize.currency} code={row.prize.code} />
          {row.maxWinners > 1 && <span className="text-fg-muted"> · {row.maxWinners} winners</span>}
        </span>
      ),
    },
    {
      id: "escrow",
      header: "Escrow",
      skeleton: "pill",
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          <StatusPill tone={ESCROW[row.escrow].tone}>{ESCROW[row.escrow].label}</StatusPill>
          {row.status === "PAUSED" && <StatusPill tone="neutral">Paused</StatusPill>}
          {row.hidden && <StatusPill tone="danger">Hidden</StatusPill>}
        </div>
      ),
    },
    {
      id: "people",
      header: "Joined · entries",
      align: "right",
      skeleton: "number",
      cell: (row) => (
        <span className="num text-fg-muted text-sm">
          {row.counts.participants} · {row.counts.submissions}
        </span>
      ),
    },
  ];

  return (
    <PageBody className="grid gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Bounties"
        description="Every bounty and where its prize is. Hiding one takes it off fans' screens; the escrow is never touched."
      />
      <Toolbar>
        <SearchInput
          value={search}
          onSearch={setSearch}
          placeholder="Bounty title or artist"
          className="sm:w-72"
        />
        <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
          <TabsList className="max-w-full overflow-x-auto">
            {FILTERS.map((entry) => (
              <TabsTrigger key={entry.value} value={entry.value}>
                {entry.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </Toolbar>

      <DataTable
        label="Bounties"
        columns={columns}
        rows={list.data?.pages.flatMap((page) => page.bounties)}
        rowKey={(row) => row.id}
        loading={list.isPending}
        error={list.isError ? "Couldn't load bounties." : null}
        onRetry={() => void list.refetch()}
        actions={(row) => [
          ...(row.escrow !== "draft" && !row.hidden
            ? [{ label: "Open as a fan", href: `${FAN_APP_URL}/bounty/${row.id}` }]
            : []),
          ...(row.fundTxHash
            ? [{ label: "Escrow payment on Stellar", href: stellarExpertTxUrl(row.fundTxHash) }]
            : []),
          { label: "Artist", href: `/admin/users/${row.artist.userId}` },
          row.hidden
            ? {
                label: "Show again",
                icon: Eye,
                separator: true,
                onSelect: () => setHidden.mutate({ bountyId: row.id, hidden: false }),
              }
            : {
                label: "Hide from fans",
                icon: EyeOff,
                separator: true,
                destructive: true,
                onSelect: () => setHiding(row),
              },
        ]}
        empty={{ icon: Trophy, title: search ? "No bounties match" : "No bounties here" }}
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

      <HideDialog
        open={hiding !== null}
        title={`Hide ${hiding?.title ?? "this bounty"}?`}
        description="Fans stop seeing it. The prize stays in the escrow and the artist can still pay winners."
        busy={setHidden.isPending}
        onClose={() => setHiding(null)}
        onConfirm={(reason) =>
          hiding && setHidden.mutate({ bountyId: hiding.id, hidden: true, reason })
        }
      />
    </PageBody>
  );
}
