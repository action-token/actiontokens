"use client";

import { Search } from "lucide-react";
import { useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@bandcoin/ui/components/popover";

import { SearchBox } from "./search-box";
import { iconButton, SidebarTools } from "./sidebar-tools";

/**
 * The sidebar header's two round buttons, as in Wadzzo: Search and
 * Notifications. Search opens the search field in a panel beside the sidebar.
 * Wide sidebar: they sit beside the logo; icon rail: stacked under it.
 */
export function HeaderTools({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={className}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" aria-label="Search" title="Search" className={iconButton}>
            <Search className="size-4" strokeWidth={2.6} />
          </button>
        </PopoverTrigger>
        <PopoverContent side="right" align="start" sideOffset={12} className="w-80 p-2">
          <SearchBox autoFocus onClose={() => setOpen(false)} />
        </PopoverContent>
      </Popover>
      <SidebarTools className="contents" />
    </div>
  );
}
