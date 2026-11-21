"use client";

import { Eye, EyeOff, Package } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@actiontokens/ui/components/button";
import { Tabs, TabsList, TabsTrigger } from "@actiontokens/ui/components/tabs";
import { DataTable, type Column } from "@actiontokens/ui/patterns/data-table";
import { PageBody, PageHeader } from "@actiontokens/ui/patterns/page-header";
import { StatusPill, type Tone } from "@actiontokens/ui/patterns/status-pill";
import { SearchInput, Toolbar } from "@actiontokens/ui/patterns/toolbar";

import { Money } from "~/components/money";
import { timeAgo } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

import { FAN_APP_URL } from "../shell/links";
import { HideDialog } from "./hide-dialog";

type Row = RouterOutputs["admin"]["items"]["list"]["items"][number];
type Filter = "all" | "listed" | "draft" | "hidden";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "listed", label: "On sale" },
  { value: "draft", label: "Drafts" },
  { value: "hidden", label: "Hidden" },
];

const STATUS: Record<Row["status"], { tone: Tone; label: string }> = {
  listed: { tone: "success", label: "On sale" },
  draft: { tone: "neutral", label: "Draft" },
  hidden: { tone: "danger", label: "Hidden by admin" },
};

/** Every item on Bandcoin (bandfan's "market assets"). Hiding one stops fans seeing or buying it. */
export function ItemsAdminView() {
  const utils = api.useUtils();
  const [filter, setFilter] = useState<Filter>("all");
  const [chain, setChain] = useState<"all" | "CLASSIC_TOKEN" | "CONTRACT_NFT">("all");
  const [search, setSearch] = useState("");
  const [hiding, setHiding] = useState<Row | null>(null);
  const list = api.admin.items.list.useInfiniteQuery(
    {
      search: search || undefined,
      status: filter === "all" ? undefined : filter,
      chain: chain === "all" ? undefined : chain,
    },
    { getNextPageParam: (page) => page.nextCursor },
  );
  const setHidden = api.admin.items.setHidden.useMutation({
    onSuccess: (result) => {
      toast.success(result.hidden ? "Item hidden from fans" : "Item shown again");
      setHiding(null);
      void utils.admin.items.list.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const columns: Column<Row>[] = [
    {
      id: "item",
      header: "Item",
      skeleton: "person",
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- covers come from our storage */}
          <img src={row.coverUrl} alt="" className="size-9 shrink-0 rounded-lg object-cover" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{row.title}</p>
            <p className="text-fg-muted truncate text-xs">
              {row.artist?.name ?? "Action Tokens"} · {timeAgo(row.createdAt)}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "kind",
      header: "Kind",
      skeleton: "short",
      cell: (row) => (
        <span className="text-fg-muted text-sm">
          {row.chain === "CONTRACT_NFT" ? "Contract NFT" : (row.code ?? "Token")} ·{" "}
          {row.type.toLowerCase()}
        </span>
      ),
    },
    {
      id: "price",
      header: "Price",
      align: "right",
      skeleton: "number",
      cell: (row) =>
        row.price ? (
          <Money amount={row.price.bandcoin} currency="BANDCOIN" />
        ) : (
          <span className="text-fg-faint text-sm">Not listed</span>
        ),
    },
    {
      id: "sold",
      header: "Sold",
      align: "right",
      skeleton: "number",
      cell: (row) => (
        <span className="num text-sm">
          {row.sold}
          <span className="text-fg-muted"> / {row.supply ?? "∞"}</span>
        </span>
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
  ];

  return (
    <PageBody className="grid gap-6">
      <PageHeader
        eyebrow="Admin"
        title="Items"
        description="Everything organizations sell. Hiding an item stops fans seeing or buying it; nothing is deleted."
      />
      <Toolbar>
        <SearchInput
          value={search}
          onSearch={setSearch}
          placeholder="Title, organization or token code"
          className="sm:w-72"
        />
        <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
          <TabsList variant="line" className="w-full justify-start overflow-x-auto border-b">
            {FILTERS.map((entry) => (
              <TabsTrigger key={entry.value} value={entry.value} className="flex-none">
                {entry.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Tabs value={chain} onValueChange={(value) => setChain(value as typeof chain)}>
          <TabsList variant="line" className="w-full justify-start overflow-x-auto border-b">
            <TabsTrigger value="all" className="flex-none">
              Any
            </TabsTrigger>
            <TabsTrigger value="CLASSIC_TOKEN" className="flex-none">
              Tokens
            </TabsTrigger>
            <TabsTrigger value="CONTRACT_NFT" className="flex-none">
              Contract NFTs
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </Toolbar>

      <DataTable
        label="Items"
        columns={columns}
        rows={list.data?.pages.flatMap((page) => page.items)}
        rowKey={(row) => row.id}
        loading={list.isPending}
        error={list.isError ? "Couldn't load items." : null}
        onRetry={() => void list.refetch()}
        actions={(row) => [
          ...(row.status === "listed"
            ? [{ label: "Open as a fan", href: `${FAN_APP_URL}/item/${row.slug}` }]
            : []),
          ...(row.artist
            ? [{ label: "Organization", href: `/admin/users/${row.artist.userId}` }]
            : []),
          row.hidden
            ? {
                label: "Show again",
                icon: Eye,
                separator: true,
                onSelect: () => setHidden.mutate({ itemId: row.id, hidden: false }),
              }
            : {
                label: "Hide from fans",
                icon: EyeOff,
                separator: true,
                destructive: true,
                onSelect: () => setHiding(row),
              },
        ]}
        empty={{ icon: Package, title: search ? "No items match" : "No items here" }}
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
        title={`Hide ${hiding?.title ?? "this item"}?`}
        description="Fans can't see or buy it any more. People who already own it keep it."
        busy={setHidden.isPending}
        onClose={() => setHiding(null)}
        onConfirm={(reason) =>
          hiding && setHidden.mutate({ itemId: hiding.id, hidden: true, reason })
        }
      />
    </PageBody>
  );
}
