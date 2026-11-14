"use client";

import {
  BarChart3,
  ChevronDown,
  Eye,
  EyeOff,
  MapPin,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  Search,
  Trash2,
  Download,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@bandcoin/ui/components/dropdown-menu";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { cn } from "@bandcoin/ui/lib/cn";
import { ConfirmDialog } from "@bandcoin/ui/patterns/confirm-dialog";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";
import { StatusPill, type Tone } from "@bandcoin/ui/patterns/status-pill";
import { SearchInput } from "@bandcoin/ui/patterns/toolbar";

import { usePortal } from "~/features/portal/use-portal";
import { formatWhen } from "~/lib/datetime";
import { api, type RouterOutputs } from "~/trpc/react";

import { LayerTag } from "./layers/layer-tag";
import { QrButton, QrDownloadAllButton } from "./qr/qr-buttons";
import { usePinQrs } from "./qr/use-pin-qrs";

type Pin = RouterOutputs["pins"]["pins"][number];
type Status = Pin["status"];
type Filter = Status | "ALL";

export const STATUS: Record<Status, { label: string; tone: Tone }> = {
  IN_REVIEW: { label: "In review", tone: "warning" },
  NOT_APPROVED: { label: "Not approved", tone: "danger" },
  LIVE: { label: "Live", tone: "success" },
  SCHEDULED: { label: "Scheduled", tone: "info" },
  ENDED: { label: "Ended", tone: "neutral" },
  HIDDEN: { label: "Hidden", tone: "neutral" },
  ALL_COLLECTED: { label: "All collected", tone: "warning" },
};

const CARDS: { value: Filter; label: string; hint: string }[] = [
  { value: "ALL", label: "All", hint: "Every pin you've dropped" },
  { value: "LIVE", label: "Live", hint: "Fans can collect now" },
  { value: "SCHEDULED", label: "Scheduled", hint: "Starts later" },
  { value: "ENDED", label: "Ended", hint: "Over, or all collected" },
];

export const NOT_COLLECTABLE: Partial<Record<Status, string>> = {
  SCHEDULED: "This pin hasn't started yet.",
  ENDED: "This pin has ended.",
  ALL_COLLECTED: "Every copy has been collected.",
};

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString()} ${n === 1 ? one : many}`;
const coords = (lat: number, lng: number) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";
const matches = (pin: Pin, filter: Filter) =>
  filter === "ALL"
    ? true
    : filter === "ENDED"
      ? pin.status === "ENDED" || pin.status === "ALL_COLLECTED"
      : pin.status === filter;

type Confirm = {
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  run: () => Promise<unknown>;
};

/**
 * Pin management: every pin you've dropped as a list, with status, collection
 * counts, QR codes to print, and bulk actions. Editing a pin opens its own
 * page; the map is the other way to find them (/pins).
 */
export function PinsView() {
  const pins = api.pins.pins.useQuery();
  const [filter, setFilter] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [busy, setBusy] = useState(false);

  const runConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await confirm.run();
      setConfirm(null);
    } catch (error) {
      toast.error(messageOf(error));
    } finally {
      setBusy(false);
    }
  };

  const all = pins.data ?? [];
  const query = search.trim().toLowerCase();
  const shown = all.filter(
    (pin) => matches(pin, filter) && (!query || pin.title.toLowerCase().includes(query)),
  );
  const count = (value: Filter) => all.filter((pin) => matches(pin, value)).length;

  return (
    <PageBody wide className="grid gap-5">
      <PageHeader
        eyebrow="Drops"
        title="Pin management"
        description="Every pin you've dropped: check collections, print QR codes, edit, or clean up."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/pins">Map</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/pins/shapes">Pin shapes</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/pins/templates">Templates</Link>
            </Button>
            <Button asChild>
              <Link href="/pins/new">
                <Plus /> New pin
              </Link>
            </Button>
          </>
        }
      />

      <div role="tablist" aria-label="Pin status" className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {CARDS.map((card) => (
          <button
            key={card.value}
            type="button"
            role="tab"
            aria-selected={filter === card.value}
            onClick={() => setFilter(card.value)}
            className={cn(
              "bg-surface focus-visible:outline-primary rounded-[1.4rem] border-2 p-3 text-left transition-colors focus-visible:outline-2",
              filter === card.value
                ? "border-primary ring-primary ring-1"
                : "hover:border-primary/40",
            )}
          >
            <span className="text-fg-muted text-xs">{card.label}</span>
            <span className="display num mt-1 block text-3xl">
              {pins.data ? (
                count(card.value).toLocaleString()
              ) : (
                <Skeleton className="inline-block h-7 w-10 align-middle" />
              )}
            </span>
            <span className="text-fg-faint text-[11px]">{card.hint}</span>
          </button>
        ))}
      </div>

      <SearchInput onSearch={setSearch} placeholder="Search by title" className="sm:w-full" />

      {pins.isPending ? (
        <div className="grid gap-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[70px] rounded-xl" />
          ))}
        </div>
      ) : pins.isError ? (
        <ErrorState message="Couldn't load your pins." onRetry={() => void pins.refetch()} />
      ) : all.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No pins yet"
          description="Drop a reward on the map for fans to find: a signed poster, a free track, a token."
          action={
            <Button asChild>
              <Link href="/pins/new">
                <Plus /> New pin
              </Link>
            </Button>
          }
        />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matches"
          description={query ? `Nothing called “${search}”.` : "No pins in this view."}
        />
      ) : (
        <PinList pins={shown} ask={setConfirm} />
      )}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && !busy && setConfirm(null)}
        title={confirm?.title ?? ""}
        description={confirm?.description}
        confirmLabel={confirm?.confirmLabel ?? "Delete"}
        destructive={confirm?.destructive ?? true}
        busy={busy}
        onConfirm={() => void runConfirm()}
      />
    </PageBody>
  );
}

function PinList({ pins, ask }: { pins: Pin[]; ask: (confirm: Confirm) => void }) {
  const utils = api.useUtils();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const refresh = () => {
    void utils.pins.pins.invalidate();
    void utils.pins.pin.invalidate();
    void utils.admin.activity.list.invalidate();
  };
  const hide = api.pins.setPinHidden.useMutation();
  const remove = api.pins.removePin.useMutation();

  const ids = pins.map((pin) => pin.id);
  const picked = ids.filter((id) => selected.has(id));
  const allSelected = pins.length > 0 && picked.length === pins.length;
  const toggle = (id: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  /** One call per pin, so each lands in the activity log. Pins somebody already collected can't be deleted; those are reported, not failed. */
  const deleteMany = async (list: string[]) => {
    let deleted = 0;
    let kept = 0;
    for (const pinId of list) {
      try {
        await remove.mutateAsync({ pinId });
        deleted += 1;
      } catch {
        kept += 1;
      }
    }
    setSelected(new Set());
    refresh();
    toast.success(
      `${plural(deleted, "pin")} deleted${kept ? `, ${kept} kept because fans already collected them (hide those instead)` : ""}`,
    );
  };
  const hideMany = async (list: string[], hidden: boolean) => {
    for (const pinId of list) await hide.mutateAsync({ pinId, hidden });
    setSelected(new Set());
    refresh();
    toast.success(`${plural(list.length, "pin")} ${hidden ? "hidden" : "live again"}`);
  };

  return (
    <>
      <div className="flex min-h-9 items-center justify-between gap-2 px-3 text-sm">
        <label className="text-fg-muted flex items-center gap-2">
          <input
            type="checkbox"
            className="accent-primary size-4"
            checked={allSelected}
            onChange={(event) => setSelected(event.target.checked ? new Set(ids) : new Set())}
          />
          {picked.length > 0 ? `${picked.length} selected` : "Select all pins"}
        </label>
        {picked.length > 0 && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                ask({
                  title: `Hide ${plural(picked.length, "pin")}?`,
                  description:
                    "Fans can no longer see or collect them. You can show them again any time.",
                  confirmLabel: "Hide",
                  destructive: false,
                  run: () => hideMany(picked, true),
                })
              }
            >
              <EyeOff /> Hide {picked.length}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-danger hover:text-danger"
              onClick={() =>
                ask({
                  title: `Delete ${plural(picked.length, "pin")}?`,
                  description:
                    "Their spots are removed. Pins fans already collected are kept (hide those instead). This can't be undone.",
                  run: () => deleteMany(picked),
                })
              }
            >
              <Trash2 /> Delete {picked.length}
            </Button>
          </div>
        )}
      </div>
      <ul className="grid gap-2">
        {pins.map((pin) => (
          <PinRow
            key={pin.id}
            pin={pin}
            selected={selected.has(pin.id)}
            onSelect={(on) => toggle(pin.id, on)}
            ask={ask}
            onHide={(hidden) => hideMany([pin.id], hidden)}
            onDelete={() => deleteMany([pin.id])}
            onChanged={refresh}
          />
        ))}
      </ul>
    </>
  );
}

function PinRow({
  pin,
  selected,
  onSelect,
  ask,
  onHide,
  onDelete,
  onChanged,
}: {
  pin: Pin;
  selected: boolean;
  onSelect: (on: boolean) => void;
  ask: (confirm: Confirm) => void;
  onHide: (hidden: boolean) => Promise<void>;
  onDelete: () => Promise<void>;
  onChanged: () => void;
}) {
  const portal = usePortal();
  const artistName = portal.artist?.name ?? "Bandcoin artist";
  const [open, setOpen] = useState(false);
  const status = STATUS[pin.status];
  const hidden = pin.status === "HIDDEN";
  const qrPin = { id: pin.id, title: pin.title, spots: pin.spotPoints };
  const bulk = usePinQrs({ pin: qrPin, artistName });
  const removeSpot = api.pins.removeSpot.useMutation({
    onSuccess: () => {
      toast.success("Spot removed");
      onChanged();
    },
    onError: (error) => toast.error(messageOf(error)),
  });

  return (
    <li
      className={cn(
        "bg-surface overflow-hidden rounded-[1.4rem] border-2",
        selected && "border-primary/60",
      )}
    >
      <div className="flex items-center gap-3 p-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={(event) => onSelect(event.target.checked)}
          aria-label={`Select ${pin.title}`}
          className="accent-primary size-4 shrink-0"
        />
        {pin.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={pin.imageUrl} alt="" className="size-11 shrink-0 rounded-lg object-cover" />
        ) : (
          <span className="bg-surface-2 text-fg-faint flex size-11 shrink-0 items-center justify-center rounded-lg">
            <MapPin className="size-5" />
          </span>
        )}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="min-w-0 flex-1 text-left"
          aria-expanded={open}
        >
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="truncate font-medium">{pin.title}</span>
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
          </span>
          <span className="text-fg-muted mt-0.5 block truncate text-xs">
            {formatWhen(pin.startsAt)} → {formatWhen(pin.endsAt)} · {plural(pin.spots, "spot")} ·{" "}
            {pin.collected.toLocaleString()} collected
            {pin.claimLimit > 0 ? ` · ${pin.claimsLeft} of ${pin.claimLimit} left` : ""}
          </span>
          {pin.layer && (
            <span className="mt-0.5 block">
              <LayerTag layer={pin.layer} />
            </span>
          )}
        </button>
        <Button variant="ghost" size="icon-sm" asChild className="hidden sm:inline-flex">
          <Link href={`/pins/${pin.id}`} aria-label={`Edit ${pin.title}`}>
            <Pencil />
          </Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${pin.title}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/pins/${pin.id}`}>
                <Pencil /> Edit
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/reports/${pin.id}`}>
                <BarChart3 /> Report
              </Link>
            </DropdownMenuItem>
            {!hidden && pin.spots > 0 && (
              <>
                <DropdownMenuItem
                  disabled={bulk.isPending}
                  onSelect={() => void bulk.downloadAll()}
                >
                  <Download /> Download all QRs
                </DropdownMenuItem>
                {pin.spots > 1 && (
                  <DropdownMenuItem disabled={bulk.isPending} onSelect={() => void bulk.printAll()}>
                    <Printer /> Print all QRs
                  </DropdownMenuItem>
                )}
              </>
            )}
            <DropdownMenuItem
              onSelect={() =>
                void onHide(!hidden).catch((error: unknown) => toast.error(messageOf(error)))
              }
            >
              {hidden ? <Eye /> : <EyeOff />} {hidden ? "Show again" : "Hide"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() =>
                ask({
                  title: `Delete “${pin.title}”?`,
                  description:
                    pin.collected > 0
                      ? "Fans already collected this pin, so it can't be deleted. Hide it instead."
                      : `Its ${plural(pin.spots, "spot")} are removed. This can't be undone.`,
                  run: onDelete,
                })
              }
            >
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {!hidden && pin.spots > 0 && <QrDownloadAllButton pin={qrPin} artistName={artistName} />}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? "Hide spots" : "Show spots"}
        >
          <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
        </Button>
      </div>

      {open && (
        <div className="bg-surface-2 border-t p-3">
          <p className="text-fg-muted mb-2 text-xs">{plural(pin.spots, "spot")}</p>
          <ul className="grid gap-1">
            {pin.spotPoints.map((spot, index) => (
              <li
                key={spot.id}
                className="bg-surface flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm"
              >
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    spot.autoCollect ? "bg-primary" : "bg-fg-faint/60",
                  )}
                  title={spot.autoCollect ? "Auto-collect" : "Collected by tapping"}
                />
                <span className="num min-w-0 flex-1 truncate font-mono text-xs">
                  {coords(spot.latitude, spot.longitude)}
                </span>
                <span className="text-fg-muted num shrink-0 text-xs">
                  {spot.collected.toLocaleString()} collected
                </span>
                {/* A hidden pin's code leads nowhere, so there is no QR to offer. */}
                {!hidden && (
                  <QrButton
                    target={{
                      pin: qrPin,
                      spotId: spot.id,
                      spotNumber: pin.spots > 1 ? index + 1 : null,
                      artistName,
                      notCollectable: NOT_COLLECTABLE[pin.status] ?? null,
                    }}
                  />
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-danger hover:text-danger"
                  aria-label="Remove spot"
                  disabled={removeSpot.isPending}
                  onClick={() =>
                    ask({
                      title: "Remove this spot?",
                      description: `The spot at ${coords(spot.latitude, spot.longitude)} is removed${spot.collected > 0 ? " from the map (fans who collected it keep what they got)" : ""}. A pin keeps at least one spot.`,
                      confirmLabel: "Remove",
                      run: () => removeSpot.mutateAsync({ spotId: spot.id }),
                    })
                  }
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}
