"use client";

import { Eye, EyeOff, MapPin, Trash2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Tabs, TabsList, TabsTrigger } from "@bandcoin/ui/components/tabs";
import { ConfirmDialog } from "@bandcoin/ui/patterns/confirm-dialog";
import { DataTable, type Column } from "@bandcoin/ui/patterns/data-table";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";
import { StatusPill, type Tone } from "@bandcoin/ui/patterns/status-pill";
import { SearchInput, Toolbar } from "@bandcoin/ui/patterns/toolbar";

import { timeAgo } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

type Row = RouterOutputs["admin"]["pins"]["list"]["pins"][number];
type Filter = "all" | "live" | "upcoming" | "ended" | "hidden";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "live", label: "Live" },
  { value: "upcoming", label: "Upcoming" },
  { value: "ended", label: "Ended" },
  { value: "hidden", label: "Hidden" },
];

const STATUS: Record<Row["status"], { tone: Tone; label: string }> = {
  live: { tone: "success", label: "Live" },
  paused: { tone: "neutral", label: "Paused by artist" },
  upcoming: { tone: "info", label: "Upcoming" },
  ended: { tone: "neutral", label: "Ended" },
  hidden: { tone: "danger", label: "Hidden by admin" },
};

/** Every artist's pins. They go live without review; an admin hides or removes one when needed. */
export function PinsAdminView() {
  const utils = api.useUtils();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [removing, setRemoving] = useState<Row | null>(null);
  const list = api.admin.pins.list.useInfiniteQuery(
    { search: search || undefined, status: filter === "all" ? undefined : filter },
    { getNextPageParam: (page) => page.nextCursor },
  );
  const refresh = () => void utils.admin.pins.list.invalidate();
  const setHidden = api.admin.pins.setHidden.useMutation({
    onSuccess: (result) => {
      toast.success(result.hidden ? "Pin hidden from fans" : "Pin shown again");
      refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = api.admin.pins.remove.useMutation({
    onSuccess: () => {
      toast.success("Pin deleted");
      setRemoving(null);
      refresh();
    },
    onError: (error) => {
      setRemoving(null);
      toast.error(error.message);
    },
  });

  const columns: Column<Row>[] = [
    {
      id: "pin",
      header: "Pin",
      skeleton: "person",
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          {row.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- pin images come from our storage
            <img src={row.imageUrl} alt="" className="size-9 shrink-0 rounded-lg object-cover" />
          ) : (
            <span className="bg-primary-soft text-primary-text flex size-9 shrink-0 items-center justify-center rounded-lg">
              <MapPin className="size-4" />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{row.title}</p>
            <p className="text-fg-muted truncate text-xs">{row.artist.name}</p>
          </div>
        </div>
      ),
    },
    {
      id: "status",
      header: "State",
      skeleton: "pill",
      cell: (row) => (
        <StatusPill tone={STATUS[row.status].tone}>{STATUS[row.status].label}</StatusPill>
      ),
    },
    {
      id: "claims",
      header: "Collected",
      align: "right",
      skeleton: "number",
      cell: (row) => (
        <span className="num text-sm">
          {row.claimed}
          {row.claimLimit > 0 && <span className="text-fg-muted"> / {row.claimLimit}</span>}
        </span>
      ),
    },
    {
      id: "dates",
      header: "Runs",
      skeleton: "short",
      cell: (row) => (
        <span className="text-fg-muted text-sm">
          {new Date(row.startsAt).toLocaleDateString()} –{" "}
          {new Date(row.endsAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      id: "created",
      header: "Added",
      skeleton: "short",
      cell: (row) => <span className="text-fg-muted text-sm">{timeAgo(row.createdAt)}</span>,
    },
  ];

  return (
    <PageBody className="grid gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Pins"
        description="Every artist's pins. They go live without review; hide one to take it off the map for fans."
      />
      <Toolbar>
        <SearchInput
          value={search}
          onSearch={setSearch}
          placeholder="Pin title or artist"
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
        label="Pins"
        columns={columns}
        rows={list.data?.pages.flatMap((page) => page.pins)}
        rowKey={(row) => row.id}
        loading={list.isPending}
        error={list.isError ? "Couldn't load pins." : null}
        onRetry={() => void list.refetch()}
        actions={(row) => [
          {
            label: "Open location",
            href: `https://www.google.com/maps?q=${row.latitude},${row.longitude}`,
          },
          { label: "Artist", href: `/admin/users/${row.artist.userId}` },
          row.status === "hidden"
            ? {
                label: "Show again",
                icon: Eye,
                separator: true,
                onSelect: () => setHidden.mutate({ pinId: row.id, hidden: false }),
              }
            : {
                label: "Hide from fans",
                icon: EyeOff,
                separator: true,
                onSelect: () => setHidden.mutate({ pinId: row.id, hidden: true }),
              },
          {
            label: "Delete",
            icon: Trash2,
            destructive: true,
            disabled: row.claimed > 0,
            onSelect: () => setRemoving(row),
          },
        ]}
        empty={{
          icon: MapPin,
          title: search ? "No pins match" : "No pins here",
        }}
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

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Delete ${removing?.title ?? "this pin"}?`}
        description="Nobody collected it, so it can be removed for good. This can't be undone."
        busy={remove.isPending}
        onConfirm={() => removing && remove.mutate({ pinId: removing.id })}
      />
    </PageBody>
  );
}
