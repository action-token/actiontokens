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
      <ul className="-mx-4 flex [scrollbar-width:none] gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {live.map((story, index) => (
          <li key={story.id} className="shrink-0">
            <Tile story={story} onOpen={() => setStart(index)} />
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
      <ul className="-mx-4 flex [scrollbar-width:none] gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {stories.map((story, index) => (
          <li key={story.id} className="shrink-0">
            <Tile past story={story} onOpen={() => setStart(index)} />
          </li>
        ))}
        {archive.hasNextPage && (
          <li className="shrink-0">
            <button
              type="button"
              disabled={archive.isFetchingNextPage}
              onClick={() => void archive.fetchNextPage()}
              className="bg-surface-2 text-fg-muted hover:text-fg grid aspect-[9/16] w-28 place-content-center rounded-2xl border-2 border-dashed text-xs font-semibold sm:w-32"
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

function Tile({
  story,
  onOpen,
  past = false,
}: {
  story: Story | PastStory;
  onOpen: () => void;
  /** A highlight: not "new", so no yellow border, and the date instead of the age */
  past?: boolean;
}) {
  const picture = story.thumbnailUrl ?? (story.type === "IMAGE" ? story.url : null);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={story.lock ? "A locked story" : (story.caption ?? "Watch this story")}
      className={cn(
        "bg-surface-3 relative block aspect-[9/16] w-32 overflow-hidden rounded-2xl border-2 text-left text-white transition-transform hover:-translate-y-0.5 sm:w-36",
        past || ("seen" in story && story.seen) || story.lock ? "border-border" : "border-primary",
      )}
    >
      {story.lock ? (
        <span className="text-fg-muted absolute inset-0 grid place-content-center justify-items-center gap-2 px-3 text-center text-xs font-semibold">
          <Lock className="size-6" />
          {story.lock.kind === "FOLLOW"
            ? "Followers only"
            : story.lock.kind === "SUBSCRIBE"
              ? "Subscribers only"
              : `${story.lock.tierName} members`}
        </span>
      ) : (
        <>
          {picture ? (
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
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/75 to-transparent"
          />
          {story.type === "VIDEO" && (
            <span className="absolute top-2 right-2 grid size-6 place-items-center rounded-full bg-black/55">
              <Play className="size-3 fill-current" />
            </span>
          )}
          <span className="absolute inset-x-2 bottom-2 grid gap-0.5 text-xs">
            {story.caption && <span className="line-clamp-2 font-semibold">{story.caption}</span>}
            <span className="text-white/70">
              {past ? shortDate(story.createdAt) : timeAgo(story.createdAt)}
            </span>
          </span>
        </>
      )}
    </button>
  );
}
