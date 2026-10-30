"use client";

import { Users } from "lucide-react";
import { useSession } from "next-auth/react";
import { useState } from "react";

import { abbreviateAddress } from "@bandcoin/utils/address";
import { Button } from "@bandcoin/ui/components/button";
import { Tabs, TabsList, TabsTrigger } from "@bandcoin/ui/components/tabs";
import { DataTable, type Column } from "@bandcoin/ui/patterns/data-table";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";
import { Person } from "@bandcoin/ui/patterns/person";
import { StatusPill, type Tone } from "@bandcoin/ui/patterns/status-pill";
import { SearchInput, Toolbar } from "@bandcoin/ui/patterns/toolbar";

import { timeAgo } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

import { useUserActions } from "./user-actions";

type Row = RouterOutputs["admin"]["users"]["list"]["users"][number];
type Filter = "all" | "FAN" | "ARTIST" | "ADMIN" | "suspended";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "FAN", label: "Fans" },
  { value: "ARTIST", label: "Artists" },
  { value: "ADMIN", label: "Admins" },
  { value: "suspended", label: "Suspended" },
];

const ROLE: Record<Row["role"], { tone: Tone; label: string }> = {
  FAN: { tone: "neutral", label: "Fan" },
  ARTIST: { tone: "info", label: "Artist" },
  ADMIN: { tone: "warning", label: "Admin" },
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

  const countOf = (value: Filter) => {
    if (!counts.data) return null;
    return value === "all" ? counts.data.all : counts.data[value];
  };

  const columns: Column<Row>[] = [
    {
      id: "person",
      header: "Person",
      skeleton: "person",
      cell: (row) => (
        <Person
          name={row.name}
          image={row.avatarUrl}
          id={row.walletAddress ?? row.id}
          sub={row.username ? `@${row.username}` : (row.email ?? undefined)}
        />
      ),
    },
    {
      id: "contact",
      header: "Email or wallet",
      skeleton: "mono",
      cell: (row) => (
        <div className="grid min-w-0 gap-0.5 text-sm">
          {row.email && <span className="truncate">{row.email}</span>}
          {row.walletAddress && (
            <span className="text-fg-muted font-mono text-xs" title={row.walletAddress}>
              {abbreviateAddress(row.walletAddress, 5)}
            </span>
          )}
        </div>
      ),
    },
    {
      id: "role",
      header: "Role",
      skeleton: "pill",
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          <StatusPill tone={ROLE[row.role].tone}>{ROLE[row.role].label}</StatusPill>
          {row.suspended && <StatusPill tone="danger">Suspended</StatusPill>}
        </div>
      ),
    },
    {
      id: "joined",
      header: "Joined",
      skeleton: "short",
      cell: (row) => <span className="text-fg-muted text-sm">{timeAgo(row.createdAt)}</span>,
    },
    {
      id: "active",
      header: "Last active",
      skeleton: "short",
      cell: (row) => (
        <span className="text-fg-muted text-sm">
          {row.lastActiveAt ? timeAgo(row.lastActiveAt) : "Never"}
        </span>
      ),
    },
  ];

  return (
    <PageBody className="grid gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Users"
        description="Everyone with a Bandcoin account. Open a person to see what they did, or suspend them."
      />

      <Toolbar>
        <SearchInput
          value={search}
          onSearch={setSearch}
          placeholder="Name, @username, email or wallet"
          className="sm:w-80"
        />
        <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
          <TabsList className="max-w-full overflow-x-auto">
            {FILTERS.map((entry) => (
              <TabsTrigger key={entry.value} value={entry.value}>
                {entry.label}
                {countOf(entry.value) !== null && (
                  <span className="text-fg-muted num ml-1 text-xs">{countOf(entry.value)}</span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </Toolbar>

      <DataTable
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
              {list.isFetchingNextPage ? "Loading…" : "Show more"}
            </Button>
          ) : undefined
        }
      />
      {dialogs}
    </PageBody>
  );
}
