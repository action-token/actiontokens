"use client";

import { Search } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@bandcoin/ui/components/popover";
import { cn } from "@bandcoin/ui/lib/cn";

import { SearchBox } from "./search-box";
import { SidebarTools, toolClass } from "./sidebar-tools";

/** One rounded bar of equal cells: Search, Notifications. */
const toolbarClass =
  "bg-surface-2 grid h-10 auto-cols-fr items-center gap-0.5 rounded-full border p-[3px]";

function SearchButton(props: React.ComponentProps<"button">) {
  return (
    <button type="button" aria-label="Search" title="Search" className={toolClass} {...props}>
      <Search className="size-4" />
    </button>
  );
}

/**
 * The wide sidebar's tool row: Search, Notifications,
 * centered. Search grows the search field out of the row (and × or Escape
 * folds it back). It stays open on the marketplace while a search is showing.
 */
export function SidebarSearchRow() {
  return (
    <Suspense fallback={<Row open={false} setOpen={() => undefined} />}>
      <SearchRow />
    </Suspense>
  );
}

function SearchRow() {
  const pathname = usePathname();
  const params = useSearchParams();
  const searching = pathname === "/marketplace" && Boolean(params.get("search"));
  const [open, setOpen] = useState(searching);
  const [wasSearching, setWasSearching] = useState(searching);

  // A search that appears (from the phone bar, a link) opens the field.
  if (searching !== wasSearching) {
    setWasSearching(searching);
    if (searching) setOpen(true);
  }

  return <Row open={open} setOpen={setOpen} />;
}

/** Both states stay mounted so opening and closing can animate. */
function Row({ open, setOpen }: { open: boolean; setOpen: (open: boolean) => void }) {
  const field = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const opened = useRef(open);

  // Focus follows the change: into the field when it opens, back to Search when it closes.
  useEffect(() => {
    if (opened.current === open) return;
    opened.current = open;
    if (open) field.current?.querySelector("input")?.focus();
    else if (field.current?.contains(document.activeElement)) button.current?.focus();
  }, [open]);

  return (
    <div className="relative h-10">
      <div
        inert={open}
        className={cn(
          toolbarClass,
          "grid-flow-col transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none",
          open && "scale-[0.98] opacity-0",
        )}
      >
        <SearchButton ref={button} aria-expanded={open} onClick={() => setOpen(true)} />
        <SidebarTools className="contents" />
      </div>
      {/* Grows out of the Search cell (the toolbar's first) and folds back into it. */}
      <div
        ref={field}
        inert={!open}
        className={cn(
          "absolute inset-0 transition-[clip-path,opacity] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
          open
            ? "opacity-100 [clip-path:inset(0_0_0_0_round_999px)]"
            : "opacity-0 [clip-path:inset(0_calc(100%-2.75rem)_0_0_round_999px)]",
        )}
      >
        <SearchBox onClose={() => setOpen(false)} />
      </div>
    </div>
  );
}

/**
 * The icon rail's tools in an upright toolbar: Search opens the search field
 * in a panel beside the rail.
 */
export function RailTools() {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn(toolbarClass, "mx-auto h-auto w-10 grid-flow-row")}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <SearchButton />
        </PopoverTrigger>
        <PopoverContent side="right" align="start" sideOffset={12} className="w-80 p-2">
          <SearchBox autoFocus onClose={() => setOpen(false)} />
        </PopoverContent>
      </Popover>
      <SidebarTools className="contents" />
    </div>
  );
}
