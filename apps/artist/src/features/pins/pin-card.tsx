"use client";

import {
  BarChart3,
  CopyPlus,
  Copy,
  Eye,
  EyeOff,
  Gift,
  Pencil,
  QrCode,
  Scissors,
  Trash2,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Switch } from "@bandcoin/ui/components/switch";
import { cn } from "@bandcoin/ui/lib/cn";
import { ConfirmDialog } from "@bandcoin/ui/patterns/confirm-dialog";
import { StatusPill } from "@bandcoin/ui/patterns/status-pill";

import { usePortal } from "~/features/portal/use-portal";
import { formatWhen } from "~/lib/datetime";
import { useActingArtist } from "./acting";
import { useMapFormCard } from "./map-form-card";
import { api, type RouterOutputs } from "~/trpc/react";

import { QrDialog } from "./qr/qr-dialog";
import { NOT_COLLECTABLE, STATUS } from "./pins-view";

type Pin = RouterOutputs["pins"]["pins"][number];

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong.";

/** "3d 4h" / "5h 10m" / "12m": how long until `to`, from `now`. */
function span(to: number, now: number) {
  const minutes = Math.max(1, Math.round((to - now) / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

/**
 * A pin on the map: how it's doing, and everything you do to it without
 * leaving the map. Copy and Move act on the spot you clicked: Copy puts
 * another spot of the same pin elsewhere, Move relocates this one.
 */
export function PinCard({
  pin,
  spotId,
  onPlace,
  onClose,
}: {
  pin: Pin;
  spotId: string;
  onPlace: (mode: "copy" | "move") => void;
  onClose: () => void;
}) {
  const utils = api.useUtils();
  const acting = useActingArtist();
  const portalName = usePortal().artist?.name;
  // The QR sheets carry the artist's name: the one being acted for, if an admin is.
  const artistName = acting?.name ?? portalName ?? "Bandcoin artist";
  const [qrOpen, setQrOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [now] = useState(() => Date.now());
  const status = STATUS[pin.status];
  const hidden = pin.status === "HIDDEN";
  const spotIndex = Math.max(
    0,
    pin.spotPoints.findIndex((spot) => spot.id === spotId),
  );
  const refresh = () => void utils.pins.invalidate();
  const fail = (error: unknown) => toast.error(messageOf(error));

  const hide = api.pins.setPinHidden.useMutation({
    onSuccess: (_, input) => {
      toast.success(input.hidden ? "Pin hidden" : "Pin is live again");
      refresh();
    },
    onError: fail,
  });
  const autoCollect = api.pins.updatePin.useMutation({
    onSuccess: (_, input) => {
      toast.success(
        input.autoCollect
          ? "Auto-collect on: fans collect it by walking in range"
          : "Auto-collect off: fans tap to collect",
      );
      refresh();
    },
    onError: fail,
  });
  const remove = api.pins.removePin.useMutation({
    onSuccess: () => {
      toast.success("Pin deleted");
      setConfirmDelete(false);
      onClose();
      refresh();
    },
    onError: fail,
  });

  const start = new Date(pin.startsAt).getTime();
  const end = new Date(pin.endsAt).getTime();
  const timing =
    start > now
      ? { label: "Starts in", value: span(start, now) }
      : end < now
        ? { label: "Ended", value: "" }
        : { label: "Ends in", value: span(end, now) };

  return (
    <section
      className="bg-surface border-fg/10 absolute inset-x-3 bottom-3 z-20 grid max-h-[calc(100dvh-9rem)] gap-3 overflow-y-auto rounded-[1.4rem] border-2 p-4 shadow-lg sm:inset-x-auto sm:top-20 sm:right-4 sm:bottom-auto sm:max-h-[calc(100dvh-7rem)] sm:w-80"
      aria-label={pin.title}
      onClick={(event) => event.stopPropagation()}
    >
      {pin.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pin.imageUrl} alt="" className="aspect-video w-full rounded-lg object-cover" />
      )}
      <div className="flex items-start justify-between gap-2">
        <h2 className="display min-w-0 text-2xl leading-snug">{pin.title}</h2>
        <div className="flex shrink-0 items-center gap-1">
          <StatusPill tone={status.tone}>{status.label}</StatusPill>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
            <X />
          </Button>
        </div>
      </div>
      <p className="text-fg-muted -mt-1 text-sm">
        {formatWhen(pin.startsAt)} to {formatWhen(pin.endsAt)}
        {pin.spots > 1 ? ` · spot ${spotIndex + 1} of ${pin.spots}` : ""}
      </p>

      <dl className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Collected" value={pin.collected.toLocaleString()} />
        <Stat
          label="Left"
          value={pin.claimLimit > 0 ? pin.claimsLeft.toLocaleString() : "No limit"}
        />
        <Stat label={timing.label} value={timing.value || "—"} />
      </dl>
      {pin.reward && (
        <p className="text-fg-muted flex items-center gap-1.5 text-sm">
          <Gift className="size-4 shrink-0" /> {pin.reward}
        </p>
      )}

      <label className="bg-surface-2 flex cursor-pointer items-start gap-3 rounded-xl p-3">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Auto-collect</span>
          <span className="text-fg-muted block text-xs">
            Fans collect it just by walking in range, no tap.
          </span>
        </span>
        <Switch
          checked={pin.autoCollect}
          disabled={autoCollect.isPending}
          onCheckedChange={(on) => autoCollect.mutate({ pinId: pin.id, autoCollect: on })}
          aria-label="Auto-collect"
        />
      </label>

      <div className="grid grid-cols-3 gap-2">
        <Tool
          icon={QrCode}
          label="QR"
          hint={hidden ? "A hidden pin's code leads nowhere" : "Print a code fans can scan"}
          disabled={hidden}
          onClick={() => setQrOpen(true)}
        />
        <Tool
          icon={CopyPlus}
          label="Duplicate"
          hint="A new pin from this one"
          href={`/pins/new?duplicate=${pin.id}`}
        />
        <Tool
          icon={Copy}
          label="Copy"
          hint="Put another spot of this pin elsewhere"
          onClick={() => onPlace("copy")}
        />
        <Tool
          icon={Scissors}
          label="Move"
          hint="Click a new place for this spot"
          onClick={() => onPlace("move")}
        />
        <Tool
          icon={hidden ? Eye : EyeOff}
          label={hidden ? "Show" : "Hide"}
          hint={hidden ? "Make it live again" : "Take it off the map, keep it"}
          busy={hide.isPending}
          onClick={() => hide.mutate({ pinId: pin.id, hidden: !hidden })}
        />
        <Tool
          icon={Trash2}
          label="Delete"
          hint={pin.collected > 0 ? "Fans collected it, so hide it instead" : "Remove it for good"}
          destructive
          disabled={pin.collected > 0}
          onClick={() => setConfirmDelete(true)}
        />
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" asChild>
          <Link href={`/reports/${pin.id}`}>
            {pin.collected > 0 ? <Users /> : <BarChart3 />} Collectors
          </Link>
        </Button>
        <Button
          className="flex-1"
          onClick={() => {
            useMapFormCard.getState().open({ kind: "editPin", id: pin.id });
            onClose();
          }}
        >
          <Pencil /> Edit pin
        </Button>
      </div>

      <QrDialog
        open={qrOpen}
        onOpenChange={setQrOpen}
        target={{
          pin: { id: pin.id, title: pin.title, spots: pin.spotPoints },
          spotId,
          spotNumber: pin.spots > 1 ? spotIndex + 1 : null,
          artistName,
          notCollectable: NOT_COLLECTABLE[pin.status] ?? null,
        }}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(open) => !open && !remove.isPending && setConfirmDelete(false)}
        title={`Delete “${pin.title}”?`}
        description={`Its ${pin.spots} spot${pin.spots === 1 ? "" : "s"} leave the map. This can't be undone.`}
        busy={remove.isPending}
        onConfirm={() => remove.mutate({ pinId: pin.id })}
      />
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-2 rounded-xl px-2 py-2">
      <dt className="text-fg-faint text-[11px]">{label}</dt>
      <dd className="display num text-lg">{value}</dd>
    </div>
  );
}

function Tool({
  icon: Icon,
  label,
  hint,
  onClick,
  href,
  busy,
  disabled,
  destructive,
}: {
  icon: LucideIcon;
  label: string;
  hint: string;
  onClick?: () => void;
  href?: string;
  busy?: boolean;
  disabled?: boolean;
  destructive?: boolean;
}) {
  const className = cn(
    "hover:bg-surface-2 focus-visible:outline-primary flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-xs font-medium transition-colors focus-visible:outline-2 disabled:pointer-events-none disabled:opacity-40",
    destructive && "text-danger",
  );
  const inner = (
    <>
      <Icon className="size-4" />
      {label}
    </>
  );
  if (href)
    return (
      <Link href={href} title={hint} className={className}>
        {inner}
      </Link>
    );
  return (
    <button
      type="button"
      title={hint}
      disabled={disabled || busy}
      onClick={onClick}
      className={className}
    >
      {inner}
    </button>
  );
}
