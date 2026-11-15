"use client";

import { ChevronLeft, ChevronRight, Lock, Play } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { cn } from "@bandcoin/ui/lib/cn";
import { SectionTitle } from "@bandcoin/ui/patterns/media-carousel";

import { timeAgo } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

import { StoryViewer } from "../feed/story-viewer";
import { Avatar } from "../shell/context-panel";

type Story = RouterOutputs["story"]["byArtist"]["stories"][number];
type PastStory = RouterOutputs["story"]["archive"]["stories"][number];

const shortDate = (date: Date | string) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(
    new Date(date),
  );

/** An artist's live stories (open to anyone; locked ones come back as a lock). */
function useArtistStories(slug: string) {
  return api.story.byArtist.useQuery({ slug }, { staleTime: 30_000 });
}

/**
 * The artist's photo on their banner. With a live story it gets a ring (yellow
 * while there is something new, white once watched) and opens the stories.
 */
export function StoryAvatar({
  slug,
  name,
  url,
  className,
}: {
  slug: string;
  name: string;
  url: string | null;
  className: string;
}) {
  const stories = useArtistStories(slug);
  const [open, setOpen] = useState(false);
  const live = stories.data?.stories ?? [];
  if (live.length === 0) return <Avatar name={name} url={url} className={className} />;

  const allSeen = live.every((story) => story.seen || story.lock);
  return (
    <>
      <button
        type="button"
        aria-label={`Watch ${name}'s stories`}
        title="Watch their stories"
        onClick={() => setOpen(true)}
        className={cn(
          "hidden shrink-0 rounded-full ring-4 ring-offset-4 ring-offset-black/50 transition-transform hover:scale-[1.03] sm:block",
          allSeen ? "ring-white/60" : "ring-primary",
        )}
      >
        <Avatar name={name} url={url} className={className} />
      </button>
      {open && (
        <StoryViewer slug={slug} onClose={() => setOpen(false)} onFinish={() => setOpen(false)} />
      )}
    </>
  );
}

/** Every live story of the artist as a strip of tiles; a tile opens the viewer at that story. */
export function ArtistStories({
  slug,
  title = "Stories",
  whenEmpty = null,
}: {
  slug: string;
  title?: string;
  /** Drawn instead of nothing when there are none (the page editor explains the block) */
  whenEmpty?: ReactNode;
}) {
  const stories = useArtistStories(slug);
  const [start, setStart] = useState<number | null>(null);
  const live = stories.data?.stories ?? [];
  if (stories.isPending)
    return <RowSkeleton title={title} note="gone in 24 hours" shape="round" label={title} />;
  if (live.length === 0) return whenEmpty;

  return (
    <section className="grid grid-cols-[minmax(0,1fr)] gap-4" aria-label={title}>
      <SectionTitle title={title} note="gone in 24 hours" />
      <ScrollRow>
        {live.map((story, index) => (
          <li key={story.id} className="shrink-0">
            <Tile shape="round" story={story} onOpen={() => setStart(index)} />
          </li>
        ))}
      </ScrollRow>
      {start !== null && (
        <StoryViewer
          slug={slug}
          startAt={start}
          onClose={() => setStart(null)}
          onFinish={() => setStart(null)}
        />
      )}
    </section>
  );
}

/**
 * Everything the artist ever shared, newest first, as a row under their stories.
 * Each story keeps the audience it had: a locked one shows what unlocks it.
 * Tapping one plays the highlights from there. Hidden when there are none.
 */
export function ArtistHighlights({
  slug,
  title = "Highlights",
  whenEmpty = null,
}: {
  slug: string;
  title?: string;
  whenEmpty?: ReactNode;
}) {
  const archive = api.story.archive.useInfiniteQuery(
    { slug },
    { getNextPageParam: (last) => last.nextCursor ?? undefined, staleTime: 60_000 },
  );
  const [start, setStart] = useState<number | null>(null);
  const pages = archive.data?.pages ?? [];
  const artist = pages[0]?.artist;
  const stories = pages.flatMap((page) => page.stories);
  if (archive.isPending)
    return (
      <RowSkeleton title={title} note="everything they've shared" shape="square" label={title} />
    );
  if (!artist || stories.length === 0) return whenEmpty;

  return (
    <section className="grid grid-cols-[minmax(0,1fr)] gap-4" aria-label={title}>
      <SectionTitle title={title} note="everything they've shared" />
      <ScrollRow
        onEnd={() => {
          if (archive.hasNextPage && !archive.isFetchingNextPage) void archive.fetchNextPage();
        }}
      >
        {stories.map((story, index) => (
          <li key={story.id} className="shrink-0">
            <Tile shape="square" story={story} onOpen={() => setStart(index)} />
          </li>
        ))}
      </ScrollRow>
      {start !== null && (
        <StoryViewer
          slug={slug}
          archive={{ artist, stories }}
          startAt={start}
          onClose={() => setStart(null)}
          onFinish={() => setStart(null)}
        />
      )}
    </section>
  );
}

/**
 * A row that scrolls sideways. Arrow buttons (wide screens) and a fade at an
 * edge show there is more to see; the arrows hide at the ends. `onEnd` runs
 * when the last item is near, to load the next page.
 */
function ScrollRow({ children, onEnd }: { children: ReactNode; onEnd?: () => void }) {
  const row = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  const measure = useCallback(() => {
    const el = row.current;
    if (!el) return;
    const rest = el.scrollWidth - el.clientWidth - el.scrollLeft;
    setEdge({ left: el.scrollLeft > 4, right: rest > 4 });
    if (rest < 240) onEnd?.();
  }, [onEnd]);
  useEffect(() => {
    measure();
    const el = row.current;
    if (!el) return;
    const watcher = new ResizeObserver(measure);
    watcher.observe(el);
    return () => watcher.disconnect();
  }, [measure, children]);
  const move = (direction: 1 | -1) =>
    row.current?.scrollBy({ left: direction * row.current.clientWidth * 0.8, behavior: "smooth" });

  return (
    <div className="relative min-w-0">
      <ul
        ref={row}
        onScroll={measure}
        className="-mx-4 flex [scrollbar-width:none] items-start gap-4 overflow-x-auto px-4 py-1.5 sm:mx-0 sm:px-1.5"
      >
        {children}
      </ul>
      {(["left", "right"] as const).map((side) =>
        edge[side] ? (
          <span
            key={side}
            aria-hidden
            className={cn(
              "from-bg pointer-events-none absolute inset-y-0 hidden w-12 to-transparent sm:block",
              side === "left" ? "left-0 bg-gradient-to-r" : "right-0 bg-gradient-to-l",
            )}
          />
        ) : null,
      )}
      {edge.left && (
        <button
          type="button"
          aria-label="Scroll left"
          onClick={() => move(-1)}
          className="bg-fg text-bg absolute top-1/2 left-1 hidden size-9 -translate-y-1/2 place-items-center rounded-full shadow-md transition-transform hover:scale-110 sm:grid"
        >
          <ChevronLeft className="size-5" />
        </button>
      )}
      {edge.right && (
        <button
          type="button"
          aria-label="Scroll right"
          onClick={() => move(1)}
          className="bg-fg text-bg absolute top-1/2 right-1 hidden size-9 -translate-y-1/2 place-items-center rounded-full shadow-md transition-transform hover:scale-110 sm:grid"
        >
          <ChevronRight className="size-5" />
        </button>
      )}
    </div>
  );
}

/** The row's place held while its stories load: the same title and tile sizes, so nothing jumps. */
function RowSkeleton({
  title,
  note,
  shape,
  label,
}: {
  title: string;
  note: string;
  shape: "round" | "square";
  label: string;
}) {
  return (
    <section className="grid grid-cols-[minmax(0,1fr)] gap-4" aria-label={label} aria-busy="true">
      <SectionTitle title={title} note={note} />
      <ul className="flex items-start gap-4 overflow-hidden px-1.5 py-1.5" aria-hidden>
        {Array.from({ length: shape === "round" ? 5 : 7 }, (_, key) => (
          <li
            key={key}
            className={cn("grid shrink-0 justify-items-center gap-1.5", SIZE[shape].width)}
          >
            <Skeleton
              className={cn(SIZE[shape].box, shape === "round" ? "rounded-full" : "rounded-2xl")}
            />
            <Skeleton className="h-2.5 w-3/5" />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Live stories are small rings; highlights are tall portrait rectangles so the picture reads. */
const SIZE = {
  round: { box: "size-[4.5rem] sm:size-20", width: "w-[4.5rem] sm:w-20" },
  square: { box: "w-28 aspect-[3/5] sm:w-32", width: "w-28 sm:w-32" },
} as const;

/**
 * One story, small: a ringed circle for a live story (yellow while it is new,
 * grey once watched or locked), a tall rounded rectangle for a highlight. A click opens
 * the story in the viewer.
 */
function Tile({
  story,
  onOpen,
  shape,
}: {
  story: Story | PastStory;
  onOpen: () => void;
  shape: "round" | "square";
}) {
  const picture = story.thumbnailUrl ?? (story.type === "IMAGE" ? story.url : null);
  const round = shape === "round";
  const fresh = round && !story.lock && !("seen" in story && story.seen);
  const lockLabel = story.lock
    ? story.lock.kind === "FOLLOW"
      ? "Followers"
      : story.lock.kind === "SUBSCRIBE"
        ? "Subscribers"
        : story.lock.tierName
    : null;
  const label = lockLabel ?? (round ? timeAgo(story.createdAt) : shortDate(story.createdAt));
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={
        story.lock ? `A locked story: ${lockLabel}` : (story.caption ?? "Watch this story")
      }
      title={story.lock ? "Locked" : (story.caption ?? undefined)}
      className={cn("group grid justify-items-center gap-1.5 text-center", SIZE[shape].width)}
    >
      <span
        className={cn(
          "relative block overflow-hidden transition-transform group-hover:scale-105",
          SIZE[shape].box,
          round
            ? cn(
                "rounded-full ring-2 ring-offset-2",
                fresh ? "ring-primary" : "ring-border",
                "ring-offset-bg",
              )
            : "border-border rounded-2xl border-2",
          "bg-surface-3",
        )}
      >
        {story.lock ? (
          <span className="text-fg-muted absolute inset-0 grid place-items-center">
            <Lock className={round ? "size-5" : "size-7"} />
          </span>
        ) : picture ? (
          // eslint-disable-next-line @next/next/no-img-element -- media comes from storage hosts
          <img src={picture} alt="" className="absolute inset-0 size-full object-cover" />
        ) : story.url ? (
          <video
            src={`${story.url}#t=0.1`}
            preload="metadata"
            muted
            playsInline
            className="absolute inset-0 size-full object-cover"
          />
        ) : null}
        {story.type === "VIDEO" && !story.lock && (
          <span className="absolute right-1 bottom-1 grid size-5 place-items-center rounded-full bg-black/60 text-white">
            <Play className="size-2.5 fill-current" />
          </span>
        )}
      </span>
      <span className="text-fg-muted w-full truncate text-[11px] leading-none font-medium">
        {label}
      </span>
    </button>
  );
}
