"use client";

import { Search } from "lucide-react";

import { openSearch } from "./search-dialog";
import { iconButton, SidebarTools } from "./sidebar-tools";

/**
 * The sidebar header's two round buttons, as in Wadzzo: Search and
 * Notifications. Search opens the search dialog.
 * Wide sidebar: they sit beside the logo; icon rail: stacked under it.
 */
export function HeaderTools({ className }: { className?: string }) {
  return (
    <div className={className}>
      <button
        type="button"
        onClick={openSearch}
        aria-label="Search"
        title="Search (Ctrl or ⌘ + K)"
        className={iconButton}
      >
        <Search className="size-4" strokeWidth={2.6} />
      </button>
      <SidebarTools className="contents" />
    </div>
  );
}
