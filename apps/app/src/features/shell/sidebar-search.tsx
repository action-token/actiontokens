"use client";

import { Search } from "lucide-react";

import { sideIconButton } from "@bandcoin/ui/patterns/side-frame";

import { openSearch } from "./search-dialog";
import { SidebarTools } from "./sidebar-tools";

/**
 * The sidebar header's two round buttons, as in Wadzzo: Search and
 * Notifications. Search opens the search dialog.
 * The frame lays them out: beside the logo, or stacked on the rail.
 */
export function HeaderTools() {
  return (
    <>
      <button
        type="button"
        onClick={openSearch}
        aria-label="Search"
        title="Search (Ctrl or ⌘ + K)"
        className={sideIconButton}
      >
        <Search className="size-4" strokeWidth={2.6} />
      </button>
      <SidebarTools className="contents" />
    </>
  );
}
