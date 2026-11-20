"use client";

import { Ban, Check, Clock, ExternalLink, Mic2, UserCheck, UserX, X } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@actiontokens/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@actiontokens/ui/components/select";
import { DataTable, type Column, type RowAction } from "@actiontokens/ui/patterns/data-table";
import { PageBody, PageHeader } from "@actiontokens/ui/patterns/page-header";
import { Person } from "@actiontokens/ui/patterns/person";
import { FilterChips, SearchInput, Toolbar } from "@actiontokens/ui/patterns/toolbar";

import { timeAgo } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

import { FAN_APP_URL } from "../../shell/links";
import { useArtistActions } from "./artist-actions";
import { ArtistStatus } from "./artist-status";

type Row = RouterOutputs["admin"]["artists"]["list"][number];
type Filter = "all" | Row["status"];
type Sort = "newest" | "oldest" | "name";

/**
 * Admin › Artists, following Wadzzo's Creators page: the applications waiting
 * for review, then every artist with their fan token and activity.
 */
export function ArtistsView() {
  const list = api.admin.artists.list.useQuery({}, { refetchOnWindowFocus: false });
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const act = useArtistActions();

  const count = (status: Row["status"]) => list.data?.filter((row) => row.status === status).length;
  const rows = useMemo(() => {
    if (!list.data) return undefined;
    const query = search.trim().toLowerCase();
    return list.data
      .filter((row) => filter === "all" || row.status === filter)
      .filter(
        (row) =>
          !query ||
          row.name.toLowerCase().includes(query) ||
          row.slug.includes(query) ||
          Boolean(row.owner.walletAddress?.toLowerCase().includes(query)) ||
          Boolean(row.fanToken?.toLowerCase().includes(query)),
      )
      .sort((a, b) =>
        sort === "name"
          ? a.name.localeCompare(b.name)
          : (sort === "oldest" ? 1 : -1) *
            (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
      );
  }, [list.data, filter, search, sort]);

  const columns: Column<Row>[] = [
    {
      id: "artist",
      header: "Artist",
      skeleton: "person",
      cell: (row) => (
        <Person name={row.name} image={row.avatarUrl} sub={`bandcoin.io/${row.slug}`} />
      ),
    },
    {
      id: "status",
      header: "Status",
      skeleton: "pill",
      cell: (row) => (
        <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
          <ArtistStatus status={row.status} paid={row.paid} />
          {row.status === "PENDING" && row.paid && (
            <Button size="xs" disabled={act.busy} onClick={() => act.approve(row)}>
              <Check /> Approve
            </Button>
          )}
        </div>
      ),
    },
    {
      id: "token",
      header: "Fan token",
      skeleton: "short",
      cell: (row) =>
        row.fanToken ? (
          <span className="font-mono text-xs font-semibold">{row.fanToken}</span>
        ) : (
          <span className="text-fg-faint">—</span>
        ),
    },
    {
      id: "activity",
      header: "Activity",
      skeleton: "text",
      cell: (row) => (
        <span className="text-fg-muted whitespace-nowrap">
          <b className="num text-fg font-semibold">{row.pins}</b> {row.pins === 1 ? "pin" : "pins"}{" "}
          · <b className="num text-fg font-semibold">{row.followers}</b>{" "}
          {row.followers === 1 ? "follower" : "followers"}
        </span>
      ),
    },
    {
      id: "joined",
      header: "Applied",
      skeleton: "short",
      cell: (row) => (
        <span className="text-fg-muted whitespace-nowrap">{timeAgo(row.createdAt)}</span>
      ),
    },
  ];

  const actions = (row: Row): RowAction[] => [
    { label: "View details", icon: ExternalLink, href: `/admin/artists/${row.id}` },
    ...(row.status === "APPROVED"
      ? [{ label: "Fan page", icon: ExternalLink, href: `${FAN_APP_URL}/artist/${row.slug}` }]
      : []),
    { label: "Owner's account", href: `/admin/users/${row.owner.id}` },
    ...(row.status === "PENDING"
      ? [
          {
            label: "Approve",
            icon: Check,
            disabled: !row.paid,
            separator: true,
            onSelect: () => act.approve(row),
          },
          { label: "Reject", icon: X, destructive: true, onSelect: () => act.askReject(row) },
        ]
      : []),
    ...(row.status === "BANNED"
      ? [{ label: "Unban", icon: UserCheck, separator: true, onSelect: () => act.askUnban(row) }]
      : row.status !== "REJECTED"
        ? [
            {
              label: "Ban",
              icon: Ban,
              destructive: true,
              separator: row.status !== "PENDING",
              onSelect: () => act.askBan(row),
            },
          ]
        : []),
  ];

  return (
    <PageBody wide>
      <PageHeader
        eyebrow="Admin"
        title="Artists"
        description="Approve new artists and manage existing ones. Rejecting sends the artist's XLM back."
      />

      <Toolbar className="mt-6">
        <FilterChips
          label="Status"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All", count: list.data?.length },
            { value: "PENDING", label: "Waiting", icon: Clock, count: count("PENDING") },
            { value: "APPROVED", label: "Approved", icon: UserCheck, count: count("APPROVED") },
            { value: "REJECTED", label: "Rejected", icon: X, count: count("REJECTED") },
            { value: "BANNED", label: "Banned", icon: UserX, count: count("BANNED") },
          ]}
        />
        <div className="flex gap-2 sm:ml-auto">
          <SearchInput
            value={search}
            onSearch={setSearch}
            placeholder="Name, wallet or token"
            className="sm:w-60"
          />
          <Select value={sort} onValueChange={(value) => setSort(value as Sort)}>
            <SelectTrigger className="w-32 shrink-0" aria-label="Sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Newest</SelectItem>
              <SelectItem value="oldest">Oldest</SelectItem>
              <SelectItem value="name">Name A–Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Toolbar>

      <DataTable
        className="mt-4"
        label="Artists"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={list.isPending}
        error={list.isError ? "Couldn't load artists." : null}
        onRetry={() => void list.refetch()}
        rowHref={(row) => `/admin/artists/${row.id}`}
        actions={actions}
        empty={{
          icon: Mic2,
          title: search
            ? "No artists match"
            : filter === "PENDING"
              ? "Nothing waiting for review"
              : "No artists here",
          description: search
            ? "Try another name, wallet or token."
            : filter === "PENDING"
              ? "New applications show up here."
              : undefined,
        }}
      />
      {act.dialogs}
    </PageBody>
  );
}
