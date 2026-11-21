"use client";

import { Package, Pencil, Plus } from "lucide-react";
import Link from "next/link";

import { Button } from "@actiontokens/ui/components/button";
import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { EmptyState } from "@actiontokens/ui/patterns/empty-state";
import { ErrorState } from "@actiontokens/ui/patterns/error-state";
import { PageBody, PageHeader } from "@actiontokens/ui/patterns/page-header";
import { StatusPill } from "@actiontokens/ui/patterns/status-pill";

import { Money } from "~/components/money";
import { api, type RouterOutputs } from "~/trpc/react";

import { ITEM_TYPES } from "./item-types";

type Row = RouterOutputs["catalog"]["list"][number];

const typeLabel = (type: Row["type"]) =>
  ITEM_TYPES.find((entry) => entry.value === type)?.label ?? type;

/** Your collectibles: what is for sale, what sold, and what's still a draft. */
export function ItemsView() {
  const list = api.catalog.list.useQuery();
  const create = (
    <Button asChild>
      <Link href="/items/new">
        <Plus /> New item
      </Link>
    </Button>
  );

  return (
    <PageBody className="grid gap-6">
      <PageHeader
        eyebrow="Catalog"
        title="Items"
        description="Collectibles fans can buy: art, video, tickets, merch and more. Songs have their own tools."
        actions={create}
      />
      {list.isPending ? (
        <div className="grid gap-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : list.isError ? (
        <ErrorState message="Couldn't load your items." onRetry={() => void list.refetch()} />
      ) : list.data.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No items yet"
          description="Create your first collectible. Fans can buy it with ACTION or a card."
          action={create}
        />
      ) : (
        <ul className="grid gap-3">
          {list.data.map((row) => (
            <ItemRow key={row.id} row={row} />
          ))}
        </ul>
      )}
    </PageBody>
  );
}

function ItemRow({ row }: { row: Row }) {
  const status = row.hidden
    ? { tone: "danger" as const, label: "Hidden by admin" }
    : row.visibility === "DRAFT"
      ? { tone: "neutral" as const, label: "Draft" }
      : row.listingStatus === "SOLD_OUT"
        ? { tone: "warning" as const, label: "Sold out" }
        : { tone: "success" as const, label: "For sale" };
  return (
    <li>
      <Link
        href={`/items/${row.id}`}
        className="bg-surface hover:bg-surface-2 flex items-center gap-4 rounded-xl border p-3 transition-colors sm:p-4"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={row.coverUrl}
          alt=""
          className="bg-surface-2 size-16 shrink-0 rounded-lg object-cover"
        />
        <div className="grid min-w-0 flex-1 gap-0.5">
          <b className="truncate">{row.title}</b>
          <span className="text-fg-muted truncate text-sm">
            {typeLabel(row.type)} · {row.chain === "CONTRACT_NFT" ? "NFT" : row.code} · {row.sold}{" "}
            sold{row.supply === null ? "" : ` of ${row.supply}`}
          </span>
          {row.priceActionToken && row.priceUsd && (
            <span className="text-fg-muted flex flex-wrap items-center gap-x-3 text-sm">
              <Money amount={row.priceActionToken} currency="ACTION" />{" "}
              <Money amount={row.priceUsd} currency="USD" />
            </span>
          )}
        </div>
        <StatusPill tone={status.tone}>{status.label}</StatusPill>
        <Pencil className="text-fg-faint hidden size-4 sm:block" />
      </Link>
    </li>
  );
}
