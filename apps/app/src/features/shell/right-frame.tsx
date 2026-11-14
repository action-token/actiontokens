"use client";

import { ChevronLeft, Menu } from "lucide-react";
import { type ReactNode, useEffect, useId } from "react";

import { cn } from "@bandcoin/ui/lib/cn";

import { ResizeHandle } from "./resize-handle";
import { RailEq } from "./rail-eq";

/**
 * The right panel: a slim rail flush on the screen edge with a vertical label, and a panel
 * that slides out from behind it while the shell widens this column by the same amount,
 * so the page is pushed over, never covered. Both use the left sidebar's theme colours.
 * Esc closes it. The shell owns `open` and saves it per browser.
 */
export function RightRail({
  title,
  label,
  open,
  setOpen,
  eq = false,
  playing = false,
  children,
}: {
  title: string;
  label: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Show an equalizer beside the rail label instead of a plain line (the now-playing panel). */
  eq?: boolean;
  /** Whether a song is playing, so the equalizer bounces. */
  playing?: boolean;
  children: ReactNode;
}) {
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    // The shell widens this column by the panel's width when open. The panel is pinned to the
    // column's left edge (which is the page's right edge) and the rail to its right edge, so as
    // the column grows the panel slides out from behind the rail exactly with the page edge.
    <div className="side-card text-side-ink relative h-full">
      {open && <ResizeHandle side="right" label="Resize the right panel" />}
      <div className="absolute inset-0 overflow-hidden">
        <section
          id={panelId}
          aria-label={label}
          inert={!open}
          className={cn(
            "bg-side border-side-ink/10 absolute inset-y-0 left-0 flex w-(--panel-right) flex-col border-l",
            // Hidden only once the closing slide has finished.
            "transition-[visibility] duration-400 motion-reduce:transition-none",
            open ? "visible" : "invisible",
          )}
        >
          <header className="shrink-0 px-6 pt-6 pb-3">
            <h2 className="display text-[2rem]">{title}</h2>
          </header>
          <div className="border-side-ink/20 min-h-0 flex-1 [scrollbar-width:none] overflow-x-hidden overflow-y-auto overscroll-contain border-t-2 border-dashed px-6 py-5">
            {children}
          </div>
        </section>
      </div>

      {/* The rail: above the panel so the panel hides behind it. One button opens and closes. */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? `Close ${title}` : `Open ${title}`}
        onClick={() => setOpen(!open)}
        className="bg-side border-side-ink/10 hover:text-primary-text focus-visible:ring-primary-text absolute inset-y-0 right-0 z-10 flex w-[3.25rem] flex-col items-center justify-between border-l py-5 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset"
      >
        <ChevronLeft
          aria-hidden
          className={cn(
            "text-primary-text size-6 transition-transform duration-400 motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
        <span className="text-primary-text flex items-stretch gap-[5px]">
          <span className="rotate-180 text-[13px] font-semibold tracking-[0.18em] uppercase [writing-mode:vertical-rl]">
            {title}
          </span>
          {/* Where the underline was: a bouncing equalizer while music plays, a plain line otherwise. */}
          {eq ? <RailEq playing={playing} /> : <span aria-hidden className="w-px bg-current" />}
        </span>
        <Menu aria-hidden className="size-5" />
      </button>
    </div>
  );
}

/** A section label in the panel's hand-written style, with an optional note on the right. */
export function RightLabel({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="marker -rotate-1 text-base">*{children}*</h2>
      {note && <span className="text-fg-muted text-[12px]">{note}</span>}
    </div>
  );
}

/** The dashed line between two sections of the panel. */
export function RightRule() {
  return <div className="dash-rule" role="separator" />;
}
