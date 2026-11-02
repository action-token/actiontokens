"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useEffect, useRef, useState } from "react";

import { cn } from "@bandcoin/ui/lib/cn";

/** Wait for a pause in typing before updating the marketplace results. */
const TYPING_PAUSE_MS = 300;

/**
 * The one search box (songs, artists, items), always in the same place. On the
 * marketplace it shows the current search and updates the results as you type;
 * anywhere else, Enter opens the marketplace with the search.
 */
export function SearchBox({ className }: { className?: string }) {
  return (
    <Suspense fallback={<Field className={className} value="" onChange={() => undefined} />}>
      <LiveSearchBox className={className} />
    </Suspense>
  );
}

function LiveSearchBox({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const onMarketplace = pathname === "/marketplace";
  const current = onMarketplace ? (params.get("search") ?? "") : "";
  const [text, setText] = useState(current);
  const typed = useRef(false);

  // Follow the URL (back button, a cleared search, leaving the marketplace).
  useEffect(() => {
    typed.current = false;
    setText(current);
  }, [current]);

  useEffect(() => {
    if (!onMarketplace || !typed.current) return;
    const timer = setTimeout(() => {
      const query = text.trim();
      if (query === current) return;
      const next = new URLSearchParams(params.toString());
      if (query) next.set("search", query);
      else next.delete("search");
      const search = next.toString();
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
    }, TYPING_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [text, onMarketplace, current, params, pathname, router]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (onMarketplace) return;
    const query = text.trim();
    router.push(query ? `/marketplace?search=${encodeURIComponent(query)}` : "/marketplace");
  };

  return (
    <Field
      className={className}
      value={text}
      onChange={(value) => {
        typed.current = true;
        setText(value);
      }}
      onSubmit={submit}
    />
  );
}

function Field({
  className,
  value,
  onChange,
  onSubmit,
}: {
  className?: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (event: FormEvent) => void;
}) {
  return (
    <form role="search" onSubmit={onSubmit} className={cn("min-w-0", className)}>
      <label className="bg-surface-2 text-fg-faint focus-within:border-primary-text flex h-10 items-center gap-2 rounded-full border px-3.5 text-sm">
        <Search className="size-4 shrink-0" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Search songs, artists, items"
          aria-label="Search"
          className="text-fg placeholder:text-fg-faint min-w-0 flex-1 bg-transparent outline-none"
        />
      </label>
    </form>
  );
}
