"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, type KeyboardEvent, Suspense, useEffect, useRef, useState } from "react";

import { cn } from "@bandcoin/ui/lib/cn";

/** Wait for a pause in typing before updating the marketplace results. */
const TYPING_PAUSE_MS = 300;

/**
 * The one search box (songs, artists, items), always in the same place. On the
 * marketplace it shows the current search and updates the results as you type;
 * anywhere else, Enter opens the marketplace with the search.
 */
type BoxProps = {
  className?: string;
  /** Focus the field as soon as it appears (it was opened from the search icon). */
  autoFocus?: boolean;
  /** Shows an × that closes the field; Escape closes it too. Also called after searching. */
  onClose?: () => void;
};

export function SearchBox(props: BoxProps) {
  return (
    <Suspense fallback={<Field {...props} value="" onChange={() => undefined} />}>
      <LiveSearchBox {...props} />
    </Suspense>
  );
}

function LiveSearchBox({ className, autoFocus, onClose }: BoxProps) {
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
    onClose?.();
  };

  return (
    <Field
      className={className}
      autoFocus={autoFocus}
      onClose={onClose}
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
  autoFocus,
  onClose,
}: BoxProps & {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (event: FormEvent) => void;
}) {
  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key === "Escape" && onClose) {
      event.preventDefault();
      onClose();
    }
  };
  return (
    <form role="search" onSubmit={onSubmit} className={cn("min-w-0", className)}>
      <label className="bg-surface-2 text-fg-faint focus-within:border-primary-text flex h-10 items-center gap-2 rounded-full border pr-1.5 pl-3.5 text-sm">
        <Search className="size-4 shrink-0" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={closeOnEscape}
          autoFocus={autoFocus}
          placeholder="Search songs, artists"
          aria-label="Search"
          className="text-fg placeholder:text-fg-faint min-w-0 flex-1 bg-transparent outline-none"
        />
        {onClose && (
          <button
            type="button"
            aria-label="Close search"
            title="Close search"
            onClick={onClose}
            className="text-fg-muted hover:text-fg hover:bg-surface-3 grid size-7 shrink-0 place-items-center rounded-full"
          >
            <X className="size-4" />
          </button>
        )}
      </label>
    </form>
  );
}
