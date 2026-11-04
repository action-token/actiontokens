"use client";

import { ArrowRight, CornerDownLeft, Disc3, Rss, Search, Store, Target, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type ReactNode,
  useDeferredValue,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@bandcoin/ui/components/dialog";
import { cn } from "@bandcoin/ui/lib/cn";

import { api } from "~/trpc/react";

import { Avatar } from "./context-panel";

/*
 * One search palette for the whole app, as in Wadzzo: the sidebar's Search
 * button, the phone header and Ctrl/⌘ + K all open it.
 */
const EVENT = "bandcoin-search";
let open = false;
const setOpen = (next: boolean) => {
  open = next;
  window.dispatchEvent(new Event(EVENT));
};
const subscribe = (callback: () => void) => {
  window.addEventListener(EVENT, callback);
  return () => window.removeEventListener(EVENT, callback);
};

export const openSearch = () => setOpen(true);

const MIN_LENGTH = 2;

const QUICK = [
  { href: "/marketplace", label: "Marketplace", icon: Store },
  { href: "/artists", label: "Artists", icon: Users },
  { href: "/bounties", label: "Bounties", icon: Target },
  { href: "/feed", label: "Feed", icon: Rss },
];

export function SearchDialog() {
  const isOpen = useSyncExternalStore(
    subscribe,
    () => open,
    () => false,
  );
  const router = useRouter();
  const [text, setText] = useState("");
  const term = useDeferredValue(text.trim());
  const results = api.search.all.useQuery(
    { q: term },
    {
      enabled: isOpen && term.length >= MIN_LENGTH,
      staleTime: 30_000,
      placeholderData: (previous) => previous,
    },
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const close = () => setOpen(false);
  const searching = term.length >= MIN_LENGTH;
  const found = searching ? results.data : undefined;
  const empty = found && !found.items.length && !found.artists.length && !found.bounties.length;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!searching) return;
    close();
    router.push(`/marketplace?search=${encodeURIComponent(term)}`);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="data-[state=closed]:slide-out-to-top-[2%] data-[state=open]:slide-in-from-top-[2%] top-[12%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0"
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">
          Find songs and items, artists and bounties
        </DialogDescription>
        <form onSubmit={submit} className="flex items-center gap-3 border-b px-4">
          <Search className="text-primary-text size-5 shrink-0" />
          <input
            autoFocus
            type="search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Search songs, artists, bounties"
            aria-label="Search"
            className="placeholder:text-fg-faint h-14 min-w-0 flex-1 bg-transparent text-base outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          <kbd className="text-fg-muted hidden rounded-md border px-1.5 py-0.5 text-[10px] sm:block">
            ESC
          </kbd>
        </form>

        <div className="max-h-[60dvh] overflow-y-auto p-2">
          {!found ? (
            <div className="p-2">
              <p className="text-fg-faint px-2 pb-2 text-[11px] font-semibold tracking-wider uppercase">
                {searching ? "Searching…" : "Jump to"}
              </p>
              {!searching && (
                <div className="grid grid-cols-2 gap-2">
                  {QUICK.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={close}
                      className="group hover:border-fg/40 hover:bg-surface-2 flex items-center gap-3 rounded-xl border p-3 text-sm font-semibold transition-colors"
                    >
                      <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
                        <link.icon className="size-4" />
                      </span>
                      {link.label}
                      <ArrowRight className="ml-auto size-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : empty ? (
            <p className="text-fg-muted px-4 py-10 text-center text-sm">
              Nothing found for “{term}”.
            </p>
          ) : (
            <div className="grid gap-1">
              <Group title="Songs and items" show={found.items.length > 0}>
                {found.items.map((item) => (
                  <Hit
                    key={item.id}
                    href={`/item/${item.slug}`}
                    onClick={close}
                    image={item.coverUrl}
                    title={item.title}
                    hint={item.artistName}
                  />
                ))}
              </Group>
              <Group title="Artists" show={found.artists.length > 0}>
                {found.artists.map((artist) => (
                  <Hit
                    key={artist.slug}
                    href={`/artist/${artist.slug}`}
                    onClick={close}
                    image={artist.avatarUrl}
                    title={artist.name}
                    hint={`${artist.followers} ${artist.followers === 1 ? "follower" : "followers"}`}
                    round
                  />
                ))}
              </Group>
              <Group title="Bounties" show={found.bounties.length > 0}>
                {found.bounties.map((bounty) => (
                  <Hit
                    key={bounty.id}
                    href={`/bounty/${bounty.id}`}
                    onClick={close}
                    title={bounty.title}
                    hint="Bounty"
                  />
                ))}
              </Group>
            </div>
          )}
        </div>

        {searching && (
          <button
            type="button"
            onClick={submit}
            className="text-fg-muted hover:bg-surface-2 hover:text-fg flex w-full items-center justify-between border-t px-4 py-3 text-sm transition-colors"
          >
            <span>
              See all results for <span className="text-fg font-semibold">“{term}”</span>
            </span>
            <CornerDownLeft className="size-4" />
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Group({ title, show, children }: { title: string; show: boolean; children: ReactNode }) {
  if (!show) return null;
  return (
    <div className="pb-1">
      <p className="text-fg-faint px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider uppercase">
        {title}
      </p>
      {children}
    </div>
  );
}

function Hit({
  href,
  onClick,
  image,
  title,
  hint,
  round,
}: {
  href: string;
  onClick: () => void;
  image?: string | null;
  title: string;
  hint?: string | null;
  round?: boolean;
}) {
  const picture = cn(
    "bg-surface-3 size-10 shrink-0 object-cover",
    round ? "rounded-full" : "rounded-lg",
  );
  return (
    <Link
      href={href}
      onClick={onClick}
      className="group hover:bg-surface-2 flex items-center gap-3 rounded-xl px-3 py-2 transition-colors"
    >
      {round ? (
        <Avatar
          name={title}
          url={image ?? null}
          className={cn(picture, "grid place-items-center text-xs font-bold")}
        />
      ) : image ? (
        // eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts
        <img src={image} alt="" className={picture} />
      ) : (
        <span className={cn(picture, "text-fg-muted flex items-center justify-center")}>
          <Disc3 className="size-4" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{title}</span>
        {hint && <span className="text-fg-muted block truncate text-xs">{hint}</span>}
      </span>
      <ArrowRight className="text-primary-text size-4 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}
