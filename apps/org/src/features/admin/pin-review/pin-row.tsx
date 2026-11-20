"use client";

import {
  Check as CheckIcon,
  ChevronRight,
  ExternalLink,
  MapPin,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@actiontokens/ui/components/button";
import { cn } from "@actiontokens/ui/lib/cn";
import { Check, RowMenu, type RowAction } from "@actiontokens/ui/patterns/data-table";
import { StatusPill, type Tone } from "@actiontokens/ui/patterns/status-pill";

import { timeAgo } from "~/lib/format";
import type { RouterOutputs } from "~/trpc/react";

import { LayerTag } from "../../pins/layers/layer-tag";
import { PIN_TYPES } from "../../pins/pin-summary";
import { mapsLink, plural } from "../murals/model";

export type ReviewPin = RouterOutputs["admin"]["pins"]["list"]["pins"][number];
export type View = "pending" | "approved" | "rejected";
export type Approval = "PENDING" | "APPROVED" | "REJECTED";

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  PIN_TYPES.map((type) => [type.value, type.label]),
);

const TIMING: Record<ReviewPin["timing"], { tone: Tone; label: string }> = {
  running: { tone: "success", label: "Running" },
  upcoming: { tone: "info", label: "Upcoming" },
  paused: { tone: "neutral", label: "Paused by artist" },
  ended: { tone: "neutral", label: "Ended" },
};

const day = (date: Date | string) =>
  new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

export function ExpandButton({
  open,
  onClick,
  label,
}: {
  open: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className="text-fg-muted shrink-0"
      onClick={onClick}
      aria-expanded={open}
      aria-label={label}
    >
      <ChevronRight className={cn("transition-transform", open && "rotate-90")} />
    </Button>
  );
}

/**
 * The decision buttons, as in Wadzzo: Reject then Approve while waiting. A live
 * pin can be rejected (taken off the map) and a rejected one approved.
 * `count` is set on an artist header, where they act on all its pins.
 */
export function Decision({
  view,
  busy,
  count,
  onDecide,
}: {
  view: View;
  busy: boolean;
  count?: number;
  onDecide: (approval: Approval) => void;
}) {
  const all = count !== undefined;
  const size = all ? "h-8" : "h-7 px-2 text-xs";
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {view !== "rejected" && (
        <Button
          variant="ghost"
          size="sm"
          className={cn(size, "text-danger hover:bg-danger-soft hover:text-danger")}
          disabled={busy}
          onClick={() => onDecide("REJECTED")}
          aria-label={all ? `Reject all ${count}` : "Reject"}
        >
          <X /> <span className="hidden sm:inline">{all ? "Reject all" : "Reject"}</span>
        </Button>
      )}
      {view !== "approved" && (
        <Button
          size="sm"
          variant={all ? "default" : "secondary"}
          className={cn(size, !all && "bg-success/12 text-success hover:bg-success/20")}
          disabled={busy}
          onClick={() => onDecide("APPROVED")}
          aria-label={all ? `Approve all ${count}` : "Approve"}
        >
          <CheckIcon /> <span className="hidden sm:inline">{all ? "Approve all" : "Approve"}</span>
        </Button>
      )}
    </div>
  );
}

/** One pin: expand · tick · picture and facts · Reject / Approve · "…". */
export function PinRow({
  pin,
  view,
  showArtist,
  on,
  expanded,
  busy,
  onSelect,
  onToggle,
  onDecide,
  onDelete,
}: {
  pin: ReviewPin;
  view: View;
  showArtist: boolean;
  on: boolean;
  expanded: boolean;
  busy: boolean;
  onSelect: (on: boolean) => void;
  onToggle: () => void;
  onDecide: (approval: Approval) => void;
  onDelete: () => void;
}) {
  const menu: RowAction[] = [
    { label: "Open on the map", icon: MapPin, href: mapsLink(pin.latitude, pin.longitude) },
    ...(showArtist
      ? [{ label: "View artist", icon: ExternalLink, href: `/admin/artists/${pin.artist.id}` }]
      : []),
    ...(view !== "pending"
      ? [{ label: "Move back to review", icon: RotateCcw, onSelect: () => onDecide("PENDING") }]
      : []),
    {
      label: "Delete pin",
      icon: Trash2,
      destructive: true,
      separator: true,
      disabled: busy || pin.claimed > 0,
      onSelect: onDelete,
    },
  ];

  return (
    <li
      className={cn("transition-colors", on ? "bg-primary/5" : !expanded && "hover:bg-surface-2")}
    >
      <div className="flex items-center gap-2 py-2 pr-2 pl-1.5 sm:gap-3 sm:pr-3">
        <ExpandButton
          open={expanded}
          onClick={onToggle}
          label={`${expanded ? "Hide" : "Show"} details of ${pin.title}`}
        />
        <Check checked={on} onChange={onSelect} label={`Select ${pin.title}`} />
        <button
          type="button"
          onClick={onToggle}
          className="focus-visible:ring-ring flex min-w-0 flex-1 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-2"
        >
          {pin.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- pin images come from our storage
            <img
              src={pin.imageUrl}
              alt=""
              loading="lazy"
              className="border-border size-11 shrink-0 rounded-lg border object-cover"
            />
          ) : (
            <span className="bg-surface-2 text-fg-muted flex size-11 shrink-0 items-center justify-center rounded-lg">
              <MapPin className="size-4" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-medium">{pin.title}</span>
              <StatusPill tone="neutral" className="hidden shrink-0 sm:inline-flex">
                {TYPE_LABEL[pin.type] ?? pin.type}
              </StatusPill>
            </span>
            <span className="text-fg-muted mt-0.5 flex flex-wrap gap-x-1.5 text-xs">
              {showArtist && (
                <>
                  <span className="text-fg/80 font-medium">{pin.artist.name}</span>
                  <span aria-hidden>·</span>
                </>
              )}
              <span>{plural(pin.spots, "spot")}</span>
              <span aria-hidden>·</span>
              {pin.layer && (
                <>
                  <LayerTag layer={pin.layer} />
                  <span aria-hidden>·</span>
                </>
              )}
              <span>
                {pin.timing === "upcoming"
                  ? `Starts ${day(pin.startsAt)}`
                  : `Until ${day(pin.endsAt)}`}
              </span>
              <span aria-hidden className="hidden sm:inline">
                ·
              </span>
              <span className="hidden sm:inline">Submitted {timeAgo(pin.createdAt)}</span>
            </span>
          </span>
        </button>
        <Decision view={view} busy={busy} onDecide={onDecide} />
        <RowMenu items={menu} />
      </div>
      {expanded && <PinDetails pin={pin} />}
    </li>
  );
}

function PinDetails({ pin }: { pin: ReviewPin }) {
  const facts = [
    { label: "Runs", value: `${day(pin.startsAt)} – ${day(pin.endsAt)}` },
    {
      label: "Collected",
      value: `${pin.claimed}${pin.claimLimit > 0 ? ` / ${pin.claimLimit}` : ""}`,
    },
    {
      label: "Reach",
      value: `${Math.round(pin.radiusMeters)} m around ${plural(pin.spots, "spot")}`,
    },
  ];
  return (
    <div className="bg-surface-2/60 border-border grid gap-3 border-t px-4 py-3 text-sm sm:pl-[4.75rem]">
      {pin.description && <p className="text-fg-muted text-pretty">{pin.description}</p>}
      <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-3">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt className="text-fg-faint text-xs">{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={TIMING[pin.timing].tone}>{TIMING[pin.timing].label}</StatusPill>
        <a
          href={mapsLink(pin.latitude, pin.longitude)}
          target="_blank"
          rel="noreferrer"
          className="text-primary-text text-xs font-medium hover:underline"
        >
          Open on the map
        </a>
      </div>
    </div>
  );
}

export function ShowMore({ left, onClick }: { left: number; onClick: () => void }) {
  if (left <= 0) return null;
  return (
    <div className="border-border border-t px-4 py-2 text-center">
      <Button variant="ghost" size="sm" onClick={onClick}>
        Show more <span className="text-fg-muted">· {left} left</span>
      </Button>
    </div>
  );
}
