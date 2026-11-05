"use client";

import { Lock, Play } from "lucide-react";
import { useState } from "react";

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
export function ArtistStories({ slug }: { slug: string }) {
  const stories = useArtistStories(slug);
  const [start, setStart] = useState<number | null>(null);
  const live = stories.data?.stories ?? [];
  if (live.length === 0) return null;

  return (
    <section className="grid gap-4" aria-label="Stories">
      <SectionTitle title="Stories" note="gone in 24 hours" />
      <ul className="-mx-4 flex [scrollbar-width:none] items-start gap-4 overflow-x-auto px-4 py-1.5 sm:mx-0 sm:px-1.5">
        {live.map((story, index) => (
          <li key={story.id} className="shrink-0">
            <Tile shape="round" story={story} onOpen={() => setStart(index)} />
          </li>
        ))}
      </ul>
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
export function ArtistHighlights({ slug }: { slug: string }) {
  const archive = api.story.archive.useInfiniteQuery(
    { slug },
    { getNextPageParam: (last) => last.nextCursor ?? undefined, staleTime: 60_000 },
  );
  const [start, setStart] = useState<number | null>(null);
  const pages = archive.data?.pages ?? [];
  const artist = pages[0]?.artist;
  const stories = pages.flatMap((page) => page.stories);
  if (!artist || stories.length === 0) return null;

  return (
    <section className="grid gap-4" aria-label="Highlights">
      <SectionTitle title="Highlights" note="everything they've shared" />
      <ul className="-mx-4 flex [scrollbar-width:none] items-start gap-4 overflow-x-auto px-4 py-1.5 sm:mx-0 sm:px-1.5">
        {stories.map((story, index) => (
          <li key={story.id} className="shrink-0">
            <Tile shape="square" story={story} onOpen={() => setStart(index)} />
          </li>
        ))}
        {archive.hasNextPage && (
          <li className="shrink-0">
            <button
              type="button"
              disabled={archive.isFetchingNextPage}
              onClick={() => void archive.fetchNextPage()}
              className="bg-surface-2 text-fg-muted hover:text-fg grid size-28 place-content-center rounded-2xl border-2 border-dashed text-xs font-semibold sm:size-36"
            >
              {archive.isFetchingNextPage ? "Loading…" : "Older"}
            </button>
          </li>
        )}
      </ul>
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

/** Live stories are small rings; highlights are bigger squares so the picture reads. */
const SIZE = {
  round: { box: "size-[4.5rem] sm:size-20", width: "w-[4.5rem] sm:w-20" },
  square: { box: "size-28 sm:size-36", width: "w-28 sm:w-36" },
} as const;

/**
 * One story, small: a ringed circle for a live story (yellow while it is new,
 * grey once watched or locked), a rounded square for a highlight. A click opens
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
