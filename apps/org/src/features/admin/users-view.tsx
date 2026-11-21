"use client";

import { Ban, Mic2, Shield, Users, type LucideIcon } from "lucide-react";
import { useSession } from "next-auth/react";
import { useState } from "react";

import { abbreviateAddress } from "@actiontokens/utils/address";
import { Button } from "@actiontokens/ui/components/button";
import { DataTable, type Column } from "@actiontokens/ui/patterns/data-table";
import { PageBody, PageHeader } from "@actiontokens/ui/patterns/page-header";
import { Person } from "@actiontokens/ui/patterns/person";
import { StatusPill, type Tone } from "@actiontokens/ui/patterns/status-pill";
import { FilterChips, SearchInput, Toolbar } from "@actiontokens/ui/patterns/toolbar";

import { timeAgo } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

import { useUserActions } from "./user-actions";

type Row = RouterOutputs["admin"]["users"]["list"]["users"][number];
type Filter = "all" | "FAN" | "ARTIST" | "ADMIN" | "suspended";

const FILTERS: { value: Filter; label: string; icon?: LucideIcon }[] = [
  { value: "all", label: "Everyone" },
  { value: "FAN", label: "Fans", icon: Users },
  { value: "ARTIST", label: "Organizations", icon: Mic2 },
  { value: "ADMIN", label: "Admins", icon: Shield },
  { value: "suspended", label: "Suspended", icon: Ban },
];

const ARTIST_TONE: Record<NonNullable<Row["artist"]>["status"], Tone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "neutral",
  BANNED: "danger",
};

/** Everyone with an account: find a person, open them, suspend or make admin. */
export function UsersView() {
  const me = useSession().data?.user.id;
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const counts = api.admin.users.counts.useQuery();
  const list = api.admin.users.list.useInfiniteQuery(
    {
      search: search || undefined,
      role: filter === "all" || filter === "suspended" ? undefined : filter,
      status: filter === "suspended" ? "suspended" : undefined,
    },
    { getNextPageParam: (page) => page.nextCursor },
  );
  const { actionsFor, dialogs } = useUserActions(me);
  const rows = list.data?.pages.flatMap((page) => page.users);

  const countOf = (value: Filter) =>
    counts.data && (value === "all" ? counts.data.all : counts.data[value]);
  const total = countOf(filter);
  const left = total !== undefined && rows && !search ? total - rows.length : null;

  const columns: Column<Row>[] = [
    {
      id: "person",
      header: "User",
      skeleton: "person",
      cell: (row) => (
        <Person
          name={row.name}
          image={row.avatarUrl}
          id={row.walletAddress ?? row.id}
          sub={
            row.email ??
            (row.walletAddress ? (
              <span className="font-mono">{abbreviateAddress(row.walletAddress, 5)}</span>
            ) : row.username ? (
              `@${row.username}`
            ) : undefined)
          }
        />
      ),
    },
    {
      id: "role",
      header: "Role",
      skeleton: "pill",
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.role === "ADMIN" && (
            <StatusPill tone="info" icon={Shield}>
              Admin
            </StatusPill>
          )}
          {row.artist ? (
            <StatusPill tone={ARTIST_TONE[row.artist.status]} icon={Mic2}>
              Artist
            </StatusPill>
          ) : (
            row.role !== "ADMIN" && <StatusPill>Fan</StatusPill>
          )}
          {row.suspended && <StatusPill tone="danger">Suspended</StatusPill>}
        </div>
      ),
    },
    {
      id: "collected",
      header: "Collected",
      align: "right",
      skeleton: "number",
      cell: (row) => (
        <span className="num text-sm" title={`${row.owned} items owned`}>
          {row.collected.toLocaleString()}
        </span>
      ),
    },
    {
      id: "method",
      header: "Signed up with",
      skeleton: "short",
      cell: (row) => (
        <span className="text-fg-muted text-sm capitalize">{row.signUpMethod ?? "—"}</span>
      ),
    },
    {
      id: "joined",
      header: "Joined",
      skeleton: "short",
      cell: (row) => (
        <span className="text-fg-muted text-sm whitespace-nowrap">{timeAgo(row.createdAt)}</span>
      ),
    },
  ];

  return (
    <PageBody wide>
      <PageHeader
        eyebrow="Admin"
        title="Users"
        description={
          counts.data
            ? `${counts.data.all.toLocaleString()} people have an Action Tokens account. Open one to see what they did, or suspend them.`
            : "Everyone with an Action Tokens account. Open one to see what they did, or suspend them."
        }
      />

      <Toolbar className="mt-6">
        <FilterChips
          label="Role"
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((entry) => ({ ...entry, count: countOf(entry.value) }))}
        />
        <SearchInput
          value={search}
          onSearch={setSearch}
          placeholder="Name, @username, email or wallet"
          className="sm:ml-auto sm:w-72"
        />
      </Toolbar>

      <DataTable
        className="mt-4"
        label="Users"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={list.isPending}
        error={list.isError ? "Couldn't load users." : null}
        onRetry={() => void list.refetch()}
        rowHref={(row) => `/admin/users/${row.id}`}
        actions={(row) => [
          { label: "Open", href: `/admin/users/${row.id}` },
          ...actionsFor({ id: row.id, name: row.name, role: row.role, suspended: row.suspended }),
        ]}
        empty={{
          icon: Users,
          title: search ? "No one matches" : "No one here yet",
          description: search ? "Try a wallet address, email or @username." : undefined,
        }}
        footer={
          list.hasNextPage ? (
            <Button
              variant="ghost"
              disabled={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            >
              {list.isFetchingNextPage
                ? "Loading…"
                : left && left > 0
                  ? `Load more (${left.toLocaleString()} left)`
                  : "Load more"}
            </Button>
          ) : undefined
        }
      />
      {dialogs}
    </PageBody>
  );
}
