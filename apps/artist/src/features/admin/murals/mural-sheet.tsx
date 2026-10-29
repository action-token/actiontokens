"use client";

import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Coins,
  ExternalLink,
  GitMerge,
  ImageIcon,
  Pencil,
  RotateCcw,
  Smartphone,
  Sparkles,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import { Marker } from "react-map-gl/mapbox";

import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@bandcoin/ui/components/sheet";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { cn } from "@bandcoin/ui/lib/cn";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { Person } from "@bandcoin/ui/patterns/person";
import { StatusPill } from "@bandcoin/ui/patterns/status-pill";

import { BaseMap } from "~/features/pins/map-kit/base-map";
import { MAPBOX_TOKEN } from "~/features/pins/mapbox";
import { timeAgo } from "~/lib/format";
import { api } from "~/trpc/react";

import { REJECT_LABEL, mapsLink, messageOf, plural, type MuralDetail } from "./model";

type Actions = {
  approve: (id: string) => void;
  reject: (id: string) => void;
  moveBack: (id: string) => void;
};

/**
 * The side drawer for one mural: every scan's three photos (any can become the
 * public cover), where each scan happened, the first finders and their flags,
 * possible duplicates nearby with a one-click merge, and the decision bar.
 */
export function MuralSheet({
  id,
  onClose,
  busy,
  actions,
  position,
  onStep,
}: {
  id: string | null;
  onClose: () => void;
  busy: boolean;
  actions: Actions;
  position: { index: number; total: number } | null;
  onStep: (direction: 1 | -1) => void;
}) {
  return (
    <Sheet open={id !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {/* Keyed so edit state never carries over to the next mural. */}
        {id && (
          <Body
            key={id}
            id={id}
            busy={busy}
            actions={actions}
            position={position}
            onStep={onStep}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function StatusLabel({ mural }: { mural: Pick<MuralDetail, "status" | "rejectReason"> }) {
  switch (mural.status) {
    case "DISCOVERED":
      return <StatusPill tone="info">Gathering finders</StatusPill>;
    case "PENDING":
      return <StatusPill tone="warning">Waiting for review</StatusPill>;
    case "APPROVED":
      return (
        <StatusPill tone="success" dot>
          Approved · on maps
        </StatusPill>
      );
    case "REJECTED":
      return (
        <StatusPill tone="danger">
          Rejected · {mural.rejectReason ? REJECT_LABEL[mural.rejectReason] : ""}
        </StatusPill>
      );
  }
}

function Body({
  id,
  busy,
  actions,
  position,
  onStep,
}: {
  id: string;
  busy: boolean;
  actions: Actions;
  position: { index: number; total: number } | null;
  onStep: (direction: 1 | -1) => void;
}) {
  const utils = api.useUtils();
  const query = api.admin.murals.get.useQuery({ muralId: id }, { refetchOnWindowFocus: false });
  const mural = query.data;

  const refresh = () => {
    void utils.admin.murals.get.invalidate({ muralId: id });
    void utils.admin.murals.list.invalidate();
    void utils.admin.murals.counts.invalidate();
    void utils.admin.activity.list.invalidate();
  };
  const edit = api.admin.murals.edit.useMutation({
    onSuccess: refresh,
    onError: (error) => toast.error(messageOf(error)),
  });
  const merge = api.admin.murals.merge.useMutation({
    onSuccess: () => {
      refresh();
      toast.success("Merged: scans and coins moved to this mural");
    },
    onError: (error) => toast.error(messageOf(error)),
  });

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [artistName, setArtistName] = useState("");
  const startEditing = () => {
    if (!mural) return;
    setTitle(mural.title ?? "");
    setArtistName(mural.artistName ?? "");
    setEditing(true);
  };

  return (
    <>
      <div className="flex items-center gap-1 border-b py-2 pr-12 pl-4">
        <span className="text-fg-muted num text-xs">
          {position ? `${position.index + 1} of ${position.total}` : "Mural"}
        </span>
        <div className="ml-auto flex gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onStep(-1)}
            disabled={!position || position.index === 0}
            aria-label="Previous mural"
          >
            <ChevronUp />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onStep(1)}
            disabled={!position || position.index >= position.total - 1}
            aria-label="Next mural"
          >
            <ChevronDown />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {query.isPending ? (
          <BodySkeleton />
        ) : query.isError ? (
          <div className="p-4">
            <ErrorState message="Couldn't load this mural." onRetry={() => void query.refetch()} />
          </div>
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={query.data.coverUrl}
              alt=""
              className="bg-surface-2 aspect-[4/3] w-full object-cover"
            />

            <div className="grid gap-5 p-4 sm:p-5">
              <div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusLabel mural={query.data} />
                  {query.data.mergedIntoId && <StatusPill tone="neutral">Merged away</StatusPill>}
                </div>

                {editing ? (
                  <div className="mt-3 grid gap-2">
                    <Input
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                      placeholder={query.data.autoTitle}
                      maxLength={80}
                      aria-label="Title"
                    />
                    <Input
                      value={artistName}
                      onChange={(event) => setArtistName(event.target.value)}
                      placeholder="Artist (optional)"
                      maxLength={80}
                      aria-label="Artist"
                    />
                    <p className="text-fg-muted text-xs">
                      Leave the title empty to go back to “{query.data.autoTitle}”.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={edit.isPending}
                        onClick={() =>
                          edit.mutate(
                            { muralId: id, title, artistName },
                            {
                              onSuccess: () => {
                                setEditing(false);
                                toast.success("Saved");
                              },
                            },
                          )
                        }
                      >
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <SheetTitle className="display mt-2 flex items-start gap-2 text-xl">
                      <span className="min-w-0">{query.data.title ?? query.data.autoTitle}</span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="-mt-0.5"
                        onClick={startEditing}
                        aria-label="Edit name"
                      >
                        <Pencil />
                      </Button>
                    </SheetTitle>
                    <SheetDescription asChild>
                      <div className="text-fg-muted mt-1 text-sm">
                        {query.data.artistName
                          ? `by ${query.data.artistName}`
                          : query.data.title
                            ? "Artist unknown"
                            : "Not named yet: this is the auto title."}
                      </div>
                    </SheetDescription>
                  </>
                )}
              </div>

              <dl className="bg-surface grid grid-cols-2 gap-x-4 gap-y-3 rounded-[1.4rem] border-2 p-4 text-sm sm:grid-cols-3">
                <Item label="Finders">
                  {plural(query.data.distinctScanners, "person", "people")}
                </Item>
                <Item label="Scans">{query.data.scanCount.toLocaleString()}</Item>
                <Item label="Coins paid">
                  <span className="inline-flex items-center gap-1">
                    <Coins className="text-fg-muted size-3.5" />
                    {query.data.coinsPaid.toLocaleString()}
                  </span>
                </Item>
                <Item label="Discovered">{timeAgo(query.data.createdAt)}</Item>
                <Item label="By">{query.data.discoverer.name}</Item>
                <Item label="Where">
                  <a
                    href={mapsLink(query.data.latitude, query.data.longitude)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary-text inline-flex items-center gap-1 hover:underline"
                  >
                    Open map <ExternalLink className="size-3" />
                  </a>
                </Item>
              </dl>

              {MAPBOX_TOKEN && (
                <div className="h-56 overflow-hidden rounded-xl border">
                  <BaseMap
                    key={query.data.id}
                    initialViewState={{
                      latitude: query.data.latitude,
                      longitude: query.data.longitude,
                      zoom: 17,
                    }}
                  >
                    <Marker
                      latitude={query.data.latitude}
                      longitude={query.data.longitude}
                      anchor="center"
                    >
                      <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md border-2 border-white shadow-md">
                        <ImageIcon className="size-3.5" />
                      </span>
                    </Marker>
                    {query.data.scans.map((scan) => (
                      <Marker
                        key={scan.id}
                        latitude={scan.latitude}
                        longitude={scan.longitude}
                        anchor="center"
                      >
                        <span
                          title={`${scan.user.name} · ±${Math.round(scan.accuracyM)} m`}
                          className="bg-fg/70 block size-2.5 rounded-full border border-white"
                        />
                      </Marker>
                    ))}
                  </BaseMap>
                </div>
              )}

              {query.data.duplicates.length > 0 && (
                <div>
                  <h3 className="text-fg-muted mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase">
                    <AlertTriangle className="text-warning size-3.5" /> Possible duplicates within
                    50 m
                  </h3>
                  <ul className="grid gap-2">
                    {query.data.duplicates.map((duplicate) => (
                      <li
                        key={duplicate.id}
                        className="flex items-center gap-3 rounded-xl border p-2"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={duplicate.coverUrl}
                          alt=""
                          className="size-12 shrink-0 rounded-lg object-cover"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {duplicate.title}
                          </span>
                          <span className="text-fg-muted block text-xs">
                            {duplicate.distanceM} m away · {plural(duplicate.scanCount, "scan")} ·{" "}
                            {duplicate.status.toLowerCase()}
                          </span>
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={merge.isPending}
                          onClick={() => merge.mutate({ fromId: duplicate.id, intoId: id })}
                          title="Move that record's scans and coins into this one"
                        >
                          <GitMerge /> Merge into this
                        </Button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <h3 className="text-fg-muted mb-2 text-xs font-semibold tracking-wider uppercase">
                  Scans · tap a photo to make it the public cover
                </h3>
                <ul className="grid gap-3">
                  {query.data.scans.map((scan) => (
                    <li
                      key={scan.id}
                      className={cn(
                        "rounded-xl border p-3",
                        scan.borderline && "border-warning/60",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Person
                          name={scan.user.name}
                          image={scan.user.image}
                          size="sm"
                          sub={`${timeAgo(scan.createdAt)} · ±${Math.round(scan.accuracyM)} m`}
                        />
                        <div className="ml-auto flex flex-wrap justify-end gap-1">
                          {scan.discoveryRank && (
                            <StatusPill tone="primary" icon={Sparkles}>
                              #{scan.discoveryRank}
                            </StatusPill>
                          )}
                          {scan.newAccount && <StatusPill tone="warning">New account</StatusPill>}
                          {scan.borderline && <StatusPill tone="warning">Check photos</StatusPill>}
                          <StatusPill tone="neutral" icon={Smartphone}>
                            {scan.platform}
                          </StatusPill>
                        </div>
                      </div>
                      <div className="mt-2.5 grid grid-cols-3 gap-2">
                        {scan.keyframes.map((url, i) => {
                          const isCover = url === query.data.coverUrl;
                          return (
                            <button
                              key={url}
                              type="button"
                              disabled={isCover || edit.isPending}
                              onClick={() =>
                                edit.mutate(
                                  {
                                    muralId: id,
                                    title: query.data.title,
                                    artistName: query.data.artistName,
                                    coverUrl: url,
                                  },
                                  { onSuccess: () => toast.success("Cover updated") },
                                )
                              }
                              className={cn(
                                "bg-surface-2 relative aspect-[3/4] overflow-hidden rounded-lg border",
                                isCover
                                  ? "ring-primary ring-2"
                                  : "hover:ring-primary/50 hover:ring-2",
                              )}
                              aria-label={
                                isCover
                                  ? "Current cover"
                                  : `Use ${["left", "centre", "right"][i] ?? "this"} photo as cover`
                              }
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={url}
                                alt=""
                                loading="lazy"
                                className="size-full object-cover"
                              />
                              {isCover && (
                                <span className="bg-primary text-primary-foreground absolute right-1 bottom-1 rounded px-1 text-[10px] font-semibold">
                                  Cover
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      {scan.labels.length > 0 && (
                        <p
                          className="text-fg-muted mt-2 truncate text-xs"
                          title={scan.labels.map((label) => label.description).join(", ")}
                        >
                          Vision:{" "}
                          {scan.labels
                            .slice(0, 5)
                            .map(
                              (label) => `${label.description} ${Math.round(label.score * 100)}%`,
                            )
                            .join(" · ")}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}
      </div>

      {mural && !mural.mergedIntoId && (
        <div className="bg-surface flex flex-wrap items-center gap-2 border-t px-4 py-3">
          <div className="ml-auto flex gap-2">
            {mural.status === "PENDING" || mural.status === "DISCOVERED" ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-danger hover:text-danger"
                  disabled={busy}
                  onClick={() => actions.reject(mural.id)}
                >
                  <X /> Reject
                </Button>
                <Button size="sm" disabled={busy} onClick={() => actions.approve(mural.id)}>
                  <Check /> Approve
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => actions.moveBack(mural.id)}
              >
                <RotateCcw /> Move back to review
              </Button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-fg-muted text-[11px] font-semibold tracking-wider uppercase">{label}</dt>
      <dd className="mt-0.5 truncate">{children}</dd>
    </div>
  );
}

function BodySkeleton() {
  return (
    <>
      <Skeleton className="aspect-[4/3] w-full rounded-none" />
      <div className="grid gap-4 p-5">
        <Skeleton className="h-5 w-32 rounded-full" />
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    </>
  );
}
