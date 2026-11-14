"use client";

import { FileText, Library as LibraryIcon } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { cn } from "@bandcoin/ui/lib/cn";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { TallText } from "@bandcoin/ui/patterns/tall-text";

import { timeAgo } from "~/lib/format";
import { api } from "~/trpc/react";

import type { Run } from "../create/result";
import { type RunType, TOOL_PAGES } from "../shell/nav";

const FILTERS: (RunType | null)[] = [null, "IMAGE", "VIDEO", "MUSIC", "TEXT", "SOCIAL", "SEO"];

/** Everything you've made, newest first, filtered by tool. */
export function LibraryView() {
  const { status } = useSession();
  const [type, setType] = useState<RunType | null>(null);
  const runs = api.generate.library.useInfiniteQuery(
    { type: type ?? undefined },
    { enabled: status === "authenticated", getNextPageParam: (last) => last.nextCursor },
  );
  const items = runs.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="grid w-full max-w-[var(--page-max,96rem)] gap-6 px-4 pt-5 pb-10 sm:px-8 lg:pt-8">
      <header className="grid gap-1">
        <TallText className="pb-0 text-5xl">Library</TallText>
        <p className="marker text-primary-text -rotate-1 text-base">
          *everything you&apos;ve made*
        </p>
      </header>
      <div role="tablist" aria-label="Tool" className="flex flex-wrap gap-1.5">
        {FILTERS.map((entry) => (
          <button
            key={entry ?? "all"}
            type="button"
            role="tab"
            aria-selected={type === entry}
            onClick={() => setType(entry)}
            className={cn(
              "h-9 rounded-full px-4 text-sm font-semibold transition-colors",
              type === entry ? "bg-fg text-bg" : "bg-surface-2 text-fg-muted hover:text-fg",
            )}
          >
            {entry ? TOOL_PAGES[entry].label : "All"}
          </button>
        ))}
      </div>
      {runs.isPending && status !== "unauthenticated" ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="aspect-square rounded-2xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={LibraryIcon}
          title="Nothing here yet"
          description="What you make in Studio shows up here."
          action={
            <Button asChild>
              <Link href="/">Start creating</Link>
            </Button>
          }
        />
      ) : (
        <CreationGrid runs={items} />
      )}
      {runs.hasNextPage && (
        <Button
          variant="secondary"
          className="justify-self-center"
          disabled={runs.isFetchingNextPage}
          onClick={() => void runs.fetchNextPage()}
        >
          Show more
        </Button>
      )}
    </div>
  );
}

/** Runs as cards: a picture, a video frame, a player or the first lines of text. */
export function CreationGrid({ runs }: { runs: Run[] }) {
  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
      {runs.map((run) => (
        <li key={run.id}>
          <CreationCard run={run} />
        </li>
      ))}
    </ul>
  );
}

function CreationCard({ run }: { run: Run }) {
  const page = TOOL_PAGES[run.type];
  const first = run.outputs[0];
  return (
    <Link
      href={`${page.href}#run-${run.id}`}
      className="group bg-surface hover:border-fg/40 grid overflow-hidden rounded-2xl border-2 transition-colors"
    >
      <div className="bg-surface-2 relative aspect-square overflow-hidden">
        {run.status !== "SUCCEEDED" ? (
          <span className="text-fg-muted grid h-full place-items-center p-4 text-center text-sm">
            {run.status === "FAILED" ? "Didn't work (coins returned)" : "Making it…"}
          </span>
        ) : first?.type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={first.url}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : first?.type === "video" ? (
          <video src={first.url} muted playsInline className="h-full w-full object-cover" />
        ) : first?.type === "audio" ? (
          <span className="grid h-full content-center gap-3 p-4">
            <page.icon className="text-primary-text size-8" />
            <audio
              src={first.url}
              controls
              className="w-full"
              onClick={(event) => event.preventDefault()}
            />
          </span>
        ) : first?.type === "text" ? (
          <span className="text-fg-muted line-clamp-[9] p-4 text-xs leading-relaxed">
            <FileText className="text-primary-text mb-2 size-5" />
            {first.text}
          </span>
        ) : null}
        <span className="bg-bg/85 absolute top-2 left-2 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold backdrop-blur">
          <page.icon className="size-3" /> {page.label}
        </span>
      </div>
      <span className="grid gap-0.5 p-3">
        <span className="truncate text-sm font-semibold">{run.prompt}</span>
        <span className="text-fg-faint text-xs">
          {timeAgo(run.createdAt)} · {run.cost} coins
        </span>
      </span>
    </Link>
  );
}
