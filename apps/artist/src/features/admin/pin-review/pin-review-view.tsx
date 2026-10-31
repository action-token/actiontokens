"use client";

import {
  Check as CheckIcon,
  CheckCircle2,
  ChevronsDownUp,
  ChevronsUpDown,
  Clock,
  ExternalLink,
  Eye,
  Map as MapIcon,
  MapPin,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import toast, { type Toast } from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { Switch } from "@bandcoin/ui/components/switch";
import { cn } from "@bandcoin/ui/lib/cn";
import { ConfirmDialog } from "@bandcoin/ui/patterns/confirm-dialog";
import { Check, RowMenu } from "@bandcoin/ui/patterns/data-table";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";
import { Avatar } from "@bandcoin/ui/patterns/person";
import { FilterChips, SearchInput } from "@bandcoin/ui/patterns/toolbar";

import { timeAgo } from "~/lib/format";
import { api } from "~/trpc/react";

import { messageOf, plural } from "../murals/model";
import {
  Decision,
  ExpandButton,
  PinRow,
  ShowMore,
  type Approval,
  type ReviewPin,
  type View,
} from "./pin-row";

/** Rows shown per artist (or in the flat list) before "Show more". */
const PAGE = 8;
const FLAT = "__all";
const VIEW_APPROVAL: Record<View, Approval> = {
  pending: "PENDING",
  approved: "APPROVED",
  rejected: "REJECTED",
};
const DONE: Record<Approval, (n: number) => string> = {
  APPROVED: (n) => (n === 1 ? "Approved: fans can see it" : `${n} pins approved`),
  REJECTED: (n) => (n === 1 ? "Pin rejected" : `${n} pins rejected`),
  PENDING: (n) => (n === 1 ? "Moved back to review" : `${n} pins moved back to review`),
};

type ArtistGroup = { id: string; name: string; image: string | null; pins: ReviewPin[] };
type Confirm = { kind: "reject" | "delete"; ids: string[]; title: string };

/**
 * Admin › Pin review, following Wadzzo's: artists' new pins wait here until an
 * admin approves them (fans don't see them before). Search, group by artist,
 * tick pins (or an artist, or everything) and decide in bulk; every decision
 * has an Undo.
 */
export function PinReviewView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const raw = params.get("view");
  const view: View = raw === "approved" || raw === "rejected" ? raw : "pending";

  const [search, setSearch] = useState("");
  const [byArtist, setByArtist] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openArtists, setOpenArtists] = useState<Record<string, boolean>>({});
  const [shown, setShown] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const setView = (next: View) => {
    router.replace(next === "pending" ? pathname : `${pathname}?view=${next}`, { scroll: false });
    setSelected(new Set());
  };

  const counts = api.admin.pins.counts.useQuery(undefined, { refetchOnWindowFocus: false });
  const list = api.admin.pins.list.useInfiniteQuery(
    { view, search: search || undefined },
    { getNextPageParam: (page) => page.nextCursor, refetchOnWindowFocus: false },
  );
  const rows = useMemo(() => list.data?.pages.flatMap((page) => page.pins) ?? [], [list.data]);

  const artists = useMemo(() => {
    const map = new Map<string, ArtistGroup>();
    for (const pin of rows) {
      const group = map.get(pin.artist.id) ?? {
        id: pin.artist.id,
        name: pin.artist.name,
        image: pin.artist.avatarUrl,
        pins: [],
      };
      group.pins.push(pin);
      map.set(group.id, group);
    }
    return [...map.values()];
  }, [rows]);

  const defaultOpen = artists.length <= 3 || Boolean(search);
  const isOpen = (id: string) => openArtists[id] ?? defaultOpen;
  const allOpen = artists.length > 0 && artists.every((artist) => isOpen(artist.id));
  const shownOf = (key: string) => shown[key] ?? PAGE;

  const visible = new Set(rows.map((pin) => pin.id));
  const selectedIds = [...selected].filter((id) => visible.has(id));
  const allSelected = rows.length > 0 && selectedIds.length === rows.length;
  const setMany = (ids: string[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const utils = api.useUtils();
  const refresh = () => {
    void utils.admin.pins.list.invalidate();
    void utils.admin.pins.counts.invalidate();
  };
  const decide = api.admin.pins.decide.useMutation({ onSettled: refresh });
  const remove = api.admin.pins.remove.useMutation({ onSettled: refresh });
  const busy = decide.isPending || remove.isPending;

  const undoable = (message: string, undo: () => Promise<unknown>) =>
    toast(
      (t: Toast) => (
        <span className="flex items-center gap-3 text-sm">
          <CheckCircle2 className="text-success size-4 shrink-0" />
          {message}
          <button
            type="button"
            className="text-primary-text hover:bg-primary/10 ml-1 rounded px-1.5 py-0.5 font-semibold"
            onClick={() => {
              toast.dismiss(t.id);
              undo().then(
                () => toast.success("Undone"),
                (error: unknown) => toast.error(messageOf(error)),
              );
            }}
          >
            Undo
          </button>
        </span>
      ),
      { duration: 7000 },
    );

  const setDecision = (ids: string[], approval: Approval) =>
    decide.mutate(
      { pinIds: ids, approval },
      {
        onSuccess: (result) => {
          setMany(ids, false);
          undoable(DONE[approval](result.count), () =>
            decide.mutateAsync({ pinIds: ids, approval: VIEW_APPROVAL[view] }),
          );
        },
        onError: (error) => toast.error(error.message),
      },
    );

  /** One pin is rejected straight away (Undo covers mistakes); many ask first. */
  const onDecide = (ids: string[], approval: Approval) =>
    approval === "REJECTED" && ids.length > 1
      ? setConfirm({ kind: "reject", ids, title: `Reject ${plural(ids.length, "pin")}?` })
      : setDecision(ids, approval);
  const askDelete = (ids: string[], name: string) =>
    setConfirm({
      kind: "delete",
      ids,
      title: `Delete ${ids.length === 1 ? `“${name}”` : plural(ids.length, "pin")}?`,
    });

  const runConfirm = () => {
    if (!confirm) return;
    const { kind, ids } = confirm;
    if (kind === "reject") {
      setConfirm(null);
      return setDecision(ids, "REJECTED");
    }
    remove.mutate(
      { pinIds: ids },
      {
        onSuccess: (result) => {
          setConfirm(null);
          setMany(ids, false);
          toast.success(result.count === 1 ? "Pin deleted" : `${result.count} pins deleted`);
        },
        onError: (error) => {
          setConfirm(null);
          toast.error(error.message);
        },
      },
    );
  };

  const rowProps = (pin: ReviewPin, showArtist: boolean) => ({
    pin,
    view,
    showArtist,
    busy,
    on: selected.has(pin.id),
    expanded: expanded.has(pin.id),
    onSelect: (on: boolean) => setMany([pin.id], on),
    onToggle: () => toggleExpanded(pin.id),
    onDecide: (approval: Approval) => onDecide([pin.id], approval),
    onDelete: () => askDelete([pin.id], pin.title),
  });

  const total = counts.data?.[view];

  return (
    <PageBody wide>
      <PageHeader
        eyebrow="Admin"
        title="Pin review"
        description="New pins from artists wait here. Fans only see them once you approve."
        actions={
          <Button variant="outline" asChild>
            <Link href="/admin/pins/map">
              <MapIcon /> Map
            </Link>
          </Button>
        }
      />

      {/* Row 1: which list + search. Row 2: how to arrange it. */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <FilterChips
          label="View"
          value={view}
          onChange={setView}
          options={[
            {
              value: "pending",
              label: "Waiting for review",
              icon: Clock,
              count: counts.data?.pending,
            },
            {
              value: "approved",
              label: "Approved & live",
              icon: CheckCircle2,
              count: counts.data?.approved,
            },
            { value: "rejected", label: "Rejected", icon: XCircle, count: counts.data?.rejected },
          ]}
        />
        <SearchInput
          value={search}
          onSearch={setSearch}
          placeholder="Search pin or artist"
          className="sm:ml-auto sm:w-64"
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="bg-surface border-border flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm">
          <Switch checked={byArtist} onCheckedChange={setByArtist} aria-label="Group by artist" />
          Group by artist
        </label>
        {byArtist && artists.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() =>
              setOpenArtists(Object.fromEntries(artists.map((artist) => [artist.id, !allOpen])))
            }
          >
            {allOpen ? <ChevronsDownUp /> : <ChevronsUpDown />}
            {allOpen ? "Collapse all" : "Expand all"}
          </Button>
        )}
      </div>

      {/* Results + selection. Sticky so bulk actions stay in reach while scrolling. */}
      {rows.length > 0 && (
        <div
          className={cn(
            "sticky top-2 z-20 mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3 py-2 transition-colors sm:px-4",
            selectedIds.length
              ? "bg-surface/95 border-border shadow-md"
              : "border-transparent bg-transparent",
          )}
        >
          <Check
            checked={allSelected}
            indeterminate={selectedIds.length > 0 && !allSelected}
            onChange={(on) =>
              setMany(
                rows.map((pin) => pin.id),
                on,
              )
            }
            label={`Select all ${rows.length} pins shown`}
          />
          {selectedIds.length ? (
            <>
              <span className="num text-sm font-medium">{selectedIds.length} selected</span>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-danger hover:text-danger"
                  disabled={busy}
                  onClick={() => askDelete(selectedIds, "")}
                >
                  <Trash2 /> Delete
                </Button>
                {view !== "rejected" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-danger hover:text-danger"
                    disabled={busy}
                    onClick={() => onDecide(selectedIds, "REJECTED")}
                  >
                    <X /> Reject {selectedIds.length}
                  </Button>
                )}
                {view !== "approved" && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => onDecide(selectedIds, "APPROVED")}
                  >
                    <CheckIcon /> Approve {selectedIds.length}
                  </Button>
                )}
              </div>
            </>
          ) : (
            <span className="text-fg-muted text-sm">
              {search && total !== undefined
                ? `${plural(rows.length, "pin")} match`
                : plural(total ?? rows.length, "pin")}
              {byArtist && ` · ${plural(artists.length, "artist")}`}
              <span className="hidden md:inline">
                {" "}
                · tick pins, an artist, or this box for all.
              </span>
            </span>
          )}
        </div>
      )}

      <div className="mt-3 space-y-3">
        {list.isPending ? (
          <ListSkeleton />
        ) : list.isError ? (
          <ErrorState message="Couldn't load pins." onRetry={() => void list.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={search ? MapPin : view === "pending" ? CheckCircle2 : MapPin}
            title={
              search
                ? "No pins match"
                : view === "pending"
                  ? "All caught up"
                  : view === "approved"
                    ? "No live pins"
                    : "No rejected pins"
            }
            description={
              !search && view === "pending"
                ? "New pins from artists show up here for review."
                : undefined
            }
          />
        ) : byArtist ? (
          artists.map((artist) => {
            const ids = artist.pins.map((pin) => pin.id);
            const picked = ids.filter((id) => selected.has(id)).length;
            const open = isOpen(artist.id);
            const limit = shownOf(artist.id);
            const toggle = () => setOpenArtists((prev) => ({ ...prev, [artist.id]: !open }));
            const oldest = artist.pins.reduce(
              (min, pin) => (new Date(pin.createdAt) < min ? new Date(pin.createdAt) : min),
              new Date(artist.pins[0]!.createdAt),
            );
            return (
              <section
                key={artist.id}
                className={cn(
                  "bg-surface border-fg/10 overflow-hidden rounded-[1.4rem] border-2",
                  picked > 0 && "ring-primary/40 ring-1",
                )}
              >
                <header className="flex items-center gap-2 py-2.5 pr-2 pl-1.5 sm:gap-3 sm:pr-3">
                  <ExpandButton
                    open={open}
                    onClick={toggle}
                    label={`${open ? "Collapse" : "Expand"} ${artist.name}`}
                  />
                  <Check
                    checked={picked === ids.length}
                    indeterminate={picked > 0 && picked < ids.length}
                    onChange={(on) => setMany(ids, on)}
                    label={`Select all pins from ${artist.name}`}
                  />
                  <button
                    type="button"
                    onClick={toggle}
                    className="focus-visible:ring-ring flex min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-2"
                  >
                    <Avatar src={artist.image} name={artist.name} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{artist.name}</span>
                      <span className="text-fg-muted block truncate text-xs">
                        {plural(ids.length, "pin")}
                        {picked > 0 && ` · ${picked} selected`}
                        {view === "pending" && ` · oldest ${timeAgo(oldest)}`}
                      </span>
                    </span>
                  </button>
                  <Decision
                    view={view}
                    busy={busy}
                    count={ids.length}
                    onDecide={(approval) => onDecide(ids, approval)}
                  />
                  <RowMenu
                    items={[
                      {
                        label: "View artist",
                        icon: ExternalLink,
                        href: `/admin/artists/${artist.id}`,
                      },
                      {
                        label: "Show only this artist",
                        icon: Eye,
                        onSelect: () => setSearch(artist.name),
                      },
                      {
                        label: `Delete all ${ids.length}`,
                        icon: Trash2,
                        destructive: true,
                        separator: true,
                        disabled: busy,
                        onSelect: () => askDelete(ids, artist.pins[0]!.title),
                      },
                    ]}
                  />
                </header>
                {open && (
                  <>
                    <ul className="divide-border divide-y border-t">
                      {artist.pins.slice(0, limit).map((pin) => (
                        <PinRow key={pin.id} {...rowProps(pin, false)} />
                      ))}
                    </ul>
                    <ShowMore
                      left={ids.length - limit}
                      onClick={() =>
                        setShown((prev) => ({ ...prev, [artist.id]: limit + PAGE * 3 }))
                      }
                    />
                  </>
                )}
              </section>
            );
          })
        ) : (
          <section className="bg-surface border-fg/10 overflow-hidden rounded-[1.4rem] border-2">
            <ul className="divide-border divide-y">
              {rows.slice(0, shownOf(FLAT)).map((pin) => (
                <PinRow key={pin.id} {...rowProps(pin, true)} />
              ))}
            </ul>
            <ShowMore
              left={rows.length - shownOf(FLAT)}
              onClick={() => setShown((prev) => ({ ...prev, [FLAT]: shownOf(FLAT) + PAGE * 4 }))}
            />
          </section>
        )}
        {list.hasNextPage && (
          <div className="text-center">
            <Button
              variant="ghost"
              disabled={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            >
              {list.isFetchingNextPage ? "Loading…" : "Load more pins"}
            </Button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm?.title ?? ""}
        description={
          confirm?.kind === "reject"
            ? "Fans won't see them. You can undo this right after, or approve them later."
            : "Pins nobody collected are removed for good. A collected pin can only be rejected."
        }
        confirmLabel={confirm?.kind === "reject" ? "Reject" : "Delete"}
        busy={busy}
        onConfirm={runConfirm}
      />
    </PageBody>
  );
}

function ListSkeleton() {
  return (
    <>
      {[4, 0, 0].map((count, index) => (
        <div
          key={index}
          className="bg-surface border-fg/10 overflow-hidden rounded-[1.4rem] border-2"
        >
          <div className="flex items-center gap-3 px-3 py-3">
            <Skeleton className="size-4 rounded" />
            <Skeleton className="size-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className={cn("h-3.5", index % 2 ? "w-28" : "w-40")} />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-8 w-28 rounded-md" />
          </div>
          {count > 0 && (
            <div className="divide-border divide-y border-t">
              {Array.from({ length: count }).map((_, row) => (
                <div key={row} className="flex items-center gap-3 px-3 py-2.5">
                  <Skeleton className="size-4 rounded" />
                  <Skeleton className="size-11 rounded-lg" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className={cn("h-3.5", row % 2 ? "w-36" : "w-52")} />
                    <Skeleton className="h-3 w-44" />
                  </div>
                  <Skeleton className="h-7 w-24 rounded-md" />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </>
  );
}
