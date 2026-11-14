"use client";

import { useRef } from "react";

import { cn } from "@bandcoin/ui/lib/cn";

import { nudge, type Side, usePanelWidths, widthFromDrag } from "./panel-widths";

/**
 * A thin draggable strip on a panel's inner edge. Drag to resize, arrow keys
 * to nudge, double-click to reset. It only exists at the widths where the
 * panels are full sidebars (xl and up).
 */
export function ResizeHandle({ side, label }: { side: Side; label: string }) {
  const { widths, set, reset } = usePanelWidths();
  const drag = useRef<{ x: number; width: number } | null>(null);
  const width = widths[side];

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, width };
        document.body.style.userSelect = "none";
        // Panels follow the pointer directly while dragging, without their open/close easing.
        document.documentElement.dataset.resizing = "";
      }}
      onPointerMove={(event) => {
        if (drag.current)
          set(side, widthFromDrag(side, drag.current.width, event.clientX - drag.current.x));
      }}
      onPointerUp={() => {
        drag.current = null;
        document.body.style.userSelect = "";
        delete document.documentElement.dataset.resizing;
      }}
      onDoubleClick={() => reset(side)}
      onKeyDown={(event) => {
        const next = nudge(side, width, event.key);
        if (next === null) return;
        event.preventDefault();
        set(side, next);
      }}
      className={cn(
        "group absolute inset-y-0 z-40 hidden w-2 cursor-col-resize touch-none items-stretch justify-center xl:flex",
        side === "left" ? "-right-1" : "-left-1",
      )}
    >
      <span className="bg-primary-text/0 group-hover:bg-primary-text/60 group-focus-visible:bg-primary-text group-active:bg-primary-text w-0.5 transition-colors" />
    </div>
  );
}
