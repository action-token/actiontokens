"use client";

import { Lock, X } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { cn } from "@actiontokens/ui/lib/cn";

import { timeAgo } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

import { FollowButton } from "../artist/follow-button";

type LiveStory = RouterOutputs["story"]["byArtist"]["stories"][number];
/** What the viewer needs of a story; a past story has no "seen" and no end time. */
type Story = Omit<LiveStory, "seen" | "expiresAt"> & { seen?: boolean };
export type StorySource = {
  organization: { name: string; slug: string; avatarUrl: string | null };
  stories: Story[];
};

/** How long a photo stays before the next story. */
const PHOTO_MS = 5000;
const TICK_MS = 50;

/**
 * One artist's stories, full screen: tap the right side for the next, the left
 * for the previous, hold to pause, Esc to close. A photo plays for five
 * seconds, a clip to its end. A story the viewer can't open shows what unlocks
 * it instead. `onFinish` runs after the last story (the row moves on to the
 * next artist). With `archive` it plays those past stories instead of the live
 * ones: nothing is recorded as watched.
 */
export function StoryViewer({
  slug,
  startAt,
  archive,
  onClose,
  onFinish,
}: {
  slug: string;
  /** Past stories to play (the artist's highlights) instead of the live ones */
  archive?: StorySource;
  /** Open on this story (its place in the artist's list) instead of the first one not watched yet. */
  startAt?: number;
  onClose: () => void;
  onFinish: () => void;
}) {
  const { status } = useSession();
  const utils = api.useUtils();
  const live = api.story.byArtist.useQuery({ slug }, { staleTime: 0, enabled: !archive });
  const data: { data: StorySource | undefined; isPending: boolean; isError: boolean } = archive
    ? { data: archive, isPending: false, isError: false }
    : live;
  const markViewed = api.story.markViewed.useMutation();
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [held, setHeld] = useState(false);
  const started = useRef(false);
  const stories = data.data?.stories ?? [];
  const story: Story | undefined = stories[index];
  const artist = data.data?.organization;

  // Open on the first story not seen yet.
  useEffect(() => {
    if (!data.data || started.current) return;
    started.current = true;
    const firstNew = archive
      ? -1
      : data.data.stories.findIndex((entry) => !entry.seen && !entry.lock);
    setIndex(startAt ?? (firstNew === -1 ? 0 : firstNew));
  }, [data.data, startAt, archive]);

  // The page behind doesn't scroll while a story is open.
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
      void utils.story.ring.invalidate();
      void utils.story.byArtist.invalidate({ slug });
    };
  }, [utils, slug]);

  const next = useCallback(() => {
    setProgress(0);
    if (index + 1 < stories.length) setIndex(index + 1);
    else onFinish();
  }, [index, stories.length, onFinish]);
  const previous = useCallback(() => {
    setProgress(0);
    setIndex((current) => Math.max(0, current - 1));
  }, []);

  // Count it as watched once it is on screen (open stories only).
  const storyId = story?.id;
  const open = story ? story.lock === null : false;
  const { mutate } = markViewed;
  useEffect(() => {
    if (storyId && open && !archive && status === "authenticated") mutate({ storyId });
  }, [storyId, open, archive, status, mutate]);

  // A photo runs on a timer; a clip reports its own progress.
  useEffect(() => {
    if (!story || story.lock || story.type !== "IMAGE" || held) return;
    const timer = setInterval(() => {
      setProgress((current) => {
        const value = current + TICK_MS / PHOTO_MS;
        if (value >= 1) {
          clearInterval(timer);
          queueMicrotask(next);
          return 1;
        }
        return value;
      });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [story, held, next]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowRight") next();
      else if (event.key === "ArrowLeft") previous();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, next, previous]);

  const pressedAt = useRef(0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Stories from ${data.data?.organization.name ?? "an organization"}`}
      className="fixed inset-0 z-[70] grid place-items-center bg-black/90 backdrop-blur-sm"
    >
      <button
        type="button"
        aria-label="Close stories"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />
      <div className="relative h-dvh w-full max-w-[460px] overflow-hidden bg-neutral-900 text-white sm:h-[min(92dvh,860px)] sm:rounded-3xl">
        {data.isPending ? (
          <Skeleton className="size-full rounded-none" />
        ) : data.isError || !story || !artist ? (
          <div className="grid size-full place-items-center p-8 text-center text-sm">
            {data.isError ? "Couldn't load these stories." : "No stories right now."}
          </div>
        ) : (
          <>
            <Media story={story} held={held} onProgress={setProgress} onEnded={next} />
            <div
              aria-hidden
              className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/60 to-transparent"
            />
            <div
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent"
            />

            {/* Tap the sides to move, hold to pause. */}
            <div
              className="absolute inset-0 z-10 flex"
              onPointerDown={() => {
                pressedAt.current = Date.now();
                setHeld(true);
              }}
              onPointerUp={() => setHeld(false)}
              onPointerLeave={() => setHeld(false)}
            >
              <button
                type="button"
                aria-label="Previous story"
                className="h-full w-1/3"
                onClick={() => Date.now() - pressedAt.current < 250 && previous()}
              />
              <button
                type="button"
                aria-label="Next story"
                className="h-full flex-1"
                onClick={() => Date.now() - pressedAt.current < 250 && next()}
              />
            </div>

            <div className="pointer-events-none absolute inset-x-3 top-3 z-20 grid gap-2.5">
              <div className="flex gap-1" aria-hidden>
                {stories.map((entry, position) => (
                  <span
                    key={entry.id}
                    className="h-0.5 flex-1 overflow-hidden rounded-full bg-white/35"
                  >
                    <span
                      className="block h-full bg-white"
                      style={{
                        width: `${position < index ? 100 : position === index ? Math.round(progress * 100) : 0}%`,
                      }}
                    />
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2.5 text-sm">
                {artist.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- avatars come from many hosts
                  <img src={artist.avatarUrl} alt="" className="size-8 rounded-full object-cover" />
                ) : (
                  <span className="grid size-8 place-items-center rounded-full bg-white/25 text-xs font-bold">
                    {artist.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <Link
                  href={`/artist/${artist.slug}`}
                  className="pointer-events-auto font-semibold hover:underline"
                >
                  {artist.name}
                </Link>
                <span className="text-white/70">{timeAgo(story.createdAt)}</span>
                <button
                  type="button"
                  aria-label="Close"
                  onClick={onClose}
                  className="pointer-events-auto z-30 ml-auto grid size-8 place-items-center rounded-full hover:bg-white/15"
                >
                  <X className="size-5" />
                </button>
              </div>
            </div>

            {story.caption && !story.lock && (
              <p className="pointer-events-none absolute inset-x-5 bottom-8 z-20 text-center text-base leading-snug font-medium">
                {story.caption}
              </p>
            )}
            {story.lock && <LockScreen lock={story.lock} name={artist.name} slug={artist.slug} />}
          </>
        )}
      </div>
    </div>
  );
}

/** The picture or clip, or a dark card when the story is locked. */
function Media({
  story,
  held,
  onProgress,
  onEnded,
}: {
  story: Story;
  held: boolean;
  onProgress: (value: number) => void;
  onEnded: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (held) element.pause();
    else void element.play().catch(() => undefined);
  }, [held, story.id]);

  if (!story.url) return <div className="absolute inset-0 bg-neutral-900" />;
  return story.type === "VIDEO" ? (
    <video
      key={story.id}
      ref={video}
      src={story.url}
      autoPlay
      playsInline
      onTimeUpdate={(event) => {
        const { currentTime, duration } = event.currentTarget;
        if (duration > 0) onProgress(currentTime / duration);
      }}
      onEnded={onEnded}
      className="absolute inset-0 size-full object-cover"
    />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element -- uploaded to our own storage
    <img
      key={story.id}
      src={story.url}
      alt=""
      className="absolute inset-0 size-full object-cover"
    />
  );
}

function LockScreen({
  lock,
  name,
  slug,
}: {
  lock: NonNullable<Story["lock"]>;
  name: string;
  slug: string;
}) {
  return (
    <div className="absolute inset-0 z-20 grid place-content-center justify-items-center gap-3 bg-neutral-900/95 p-8 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-white/10">
        <Lock className="size-6" />
      </span>
      {lock.kind === "FOLLOW" ? (
        <>
          <p className="display text-2xl">Followers only</p>
          <p className="text-sm text-white/70">Follow {name} to watch this story.</p>
          <div className="relative z-30">
            <FollowButton slug={slug} initial={false} />
          </div>
        </>
      ) : lock.kind === "SUBSCRIBE" ? (
        <>
          <p className="display text-2xl">Subscribers only</p>
          <p className="text-sm text-white/70">
            {lock.code
              ? `Subscribe to ${name} (trust ${lock.code}) to watch this story.`
              : `${name}'s subscriptions open soon.`}
          </p>
          {lock.code && (
            <Link
              href={`/artist/${slug}`}
              className="relative z-30 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black"
            >
              Subscribe on {name}&apos;s page
            </Link>
          )}
        </>
      ) : (
        <>
          <p className="display text-2xl">{lock.tierName} members</p>
          <p className={cn("text-sm text-white/70")}>
            Hold {lock.needed} {lock.code ?? "fan tokens"} to watch.
            {lock.code ? ` You hold ${lock.have}.` : ""}
          </p>
          <Link
            href={`/artist/${slug}`}
            className="relative z-30 rounded-full bg-white px-5 py-2 text-sm font-semibold text-black"
          >
            See {name}&apos;s page
          </Link>
        </>
      )}
    </div>
  );
}
