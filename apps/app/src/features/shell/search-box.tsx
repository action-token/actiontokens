"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { cn } from "@bandcoin/ui/lib/cn";

/** Searches the marketplace (songs, artists, items). */
export function SearchBox({ className }: { className?: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const query = text.trim();
    router.push(query ? `/marketplace?search=${encodeURIComponent(query)}` : "/marketplace");
  };
  return (
    <form role="search" onSubmit={submit} className={cn("min-w-0", className)}>
      <label className="bg-surface-2 text-fg-faint focus-within:border-primary-text flex h-10 items-center gap-2 rounded-full border px-3.5 text-sm">
        <Search className="size-4 shrink-0" />
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Search songs, artists, items"
          aria-label="Search"
          className="text-fg placeholder:text-fg-faint min-w-0 flex-1 bg-transparent outline-none"
        />
      </label>
    </form>
  );
}
