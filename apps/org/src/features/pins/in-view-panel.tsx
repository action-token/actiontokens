"use client";

import { ChevronDown, MapPin } from "lucide-react";
import { useState } from "react";

import { cn } from "@actiontokens/ui/lib/cn";
import { StatusPill } from "@actiontokens/ui/patterns/status-pill";

import type { RouterOutputs } from "~/trpc/react";

import { STATUS } from "./pins-view";

type Pin = RouterOutputs["pins"]["pins"][number];

export type InViewPin = {
  pin: Pin;
  spotId: string;
  latitude: number;
  longitude: number;
  inView: number;
};

/**
 * "In view": the pins inside the visible part of the map (desktop). Click one
 * to fly to it and open it. Collapsible, so it never covers what you're
 * looking at.
 */
export function InViewPanel({
  items,
  selectedId,
  onSelect,
  className,
}: {
  items: InViewPin[];
  selectedId: string | null;
  onSelect: (item: InViewPin) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section
      className={cn(
        "bg-surface/95 border-fg/10 pointer-events-auto hidden w-72 overflow-hidden rounded-[1.4rem] border-2 shadow-lg md:block",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
        aria-expanded={open}
      >
        <MapPin className="text-primary-text size-4" />
        <span className="text-sm font-semibold">In view</span>
        <span className="bg-surface-2 num rounded-full px-2 py-0.5 text-xs font-semibold">
          {items.length}
        </span>
        <ChevronDown
          className={cn("text-fg-muted ml-auto size-4 transition-transform", !open && "-rotate-90")}
        />
      </button>
      {open && (
        <div className="max-h-80 overflow-y-auto border-t">
          {items.length === 0 ? (
            <p className="text-fg-muted px-4 py-8 text-center text-sm">
              No pins in this area. Zoom out or move the map.
            </p>
          ) : (
            <ul className="divide-y">
              {items.map((item) => {
                const status = STATUS[item.pin.status];
                return (
                  <li key={item.pin.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(item)}
                      className={cn(
                        "hover:bg-surface-2 flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                        item.pin.id === selectedId && "bg-surface-2",
                      )}
                    >
                      {item.pin.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.pin.imageUrl}
                          alt=""
                          className="size-9 shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <span className="bg-surface-2 text-fg-faint flex size-9 shrink-0 items-center justify-center rounded-lg">
                          <MapPin className="size-4" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{item.pin.title}</span>
                        <span className="text-fg-muted block truncate text-xs">
                          {item.pin.collected.toLocaleString()} collected
                          {item.inView > 1 ? ` · ${item.inView} spots here` : ""}
                        </span>
                      </span>
                      <StatusPill tone={status.tone}>{status.label}</StatusPill>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
