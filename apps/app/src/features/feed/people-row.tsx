"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { cn } from "@actiontokens/ui/lib/cn";

import { api } from "~/trpc/react";

import { Avatar } from "../shell/context-panel";
import { StoryViewer } from "./story-viewer";

const AVATAR =
  "bg-surface-3 grid size-16 shrink-0 place-items-center rounded-full object-cover text-sm font-bold";

type Person = {
  slug: string;
  name: string;
  avatarUrl: string | null;
  /** Has a live story, and whether the viewer has watched them all */
  story: { seen: boolean } | null;
};

/**
 * The row across the top of the feed, like Facebook's stories: artists with a
 * live story first (a yellow ring while there's something new, grey once
 * watched), then the other artists. A ring opens the stories; the rest open
 * the artist's page.
 */
export function PeopleRow() {
  const ring = api.story.ring.useQuery(undefined, { staleTime: 30_000 });
  const artists = api.artist.suggested.useQuery({ limit: 16 }, { staleTime: 60_000 });
  const [open, setOpen] = useState<string | null>(null);

  const people: Person[] = [
    ...(ring.data ?? []).map((entry) => ({
      slug: entry.slug,
      name: entry.name,
      avatarUrl: entry.avatarUrl,
      story: { seen: entry.seen },
    })),
    ...(artists.data ?? [])
      .filter((artist) => !ring.data?.some((entry) => entry.slug === artist.slug))
      .map((artist) => ({
        slug: artist.slug,
        name: artist.name,
        avatarUrl: artist.avatarUrl,
        story: null,
      })),
  ];
  const withStories = people.filter((person) => person.story);

  // After the last story, move on to the next artist who has one.
  const finish = useCallback(() => {
    const at = withStories.findIndex((person) => person.slug === open);
    setOpen(withStories[at + 1]?.slug ?? null);
  }, [open, withStories]);

  if (!ring.isPending && !artists.isPending && people.length === 0) return null;
  return (
    <>
      <nav
        aria-label="Stories and organizations"
        className="flex [scrollbar-width:none] gap-4 overflow-x-auto py-1.5"
      >
        {ring.isPending && artists.isPending
          ? [0, 1, 2, 3, 4, 5, 6, 7].map((key) => (
              <div key={key} className="grid w-[4.5rem] shrink-0 justify-items-center gap-1.5">
                <Skeleton className="size-16 rounded-full" />
                <Skeleton className="h-3 w-12" />
              </div>
            ))
          : people.map((person) => {
              const face = (
                <span
                  className={cn(
                    "ring-offset-bg rounded-full ring-2 ring-offset-2",
                    !person.story
                      ? "ring-transparent"
                      : person.story.seen
                        ? "ring-border-strong"
                        : "ring-primary",
                  )}
                >
                  <Avatar name={person.name} url={person.avatarUrl} className={AVATAR} />
                </span>
              );
              const cell = "grid w-[4.5rem] shrink-0 justify-items-center gap-1.5 text-center";
              const label = (
                <span className="w-full truncate text-xs font-medium">{person.name}</span>
              );
              return person.story ? (
                <button
                  key={person.slug}
                  type="button"
                  aria-label={`Watch ${person.name}'s story`}
                  onClick={() => setOpen(person.slug)}
                  className={cell}
                >
                  {face}
                  {label}
                </button>
              ) : (
                <Link key={person.slug} href={`/artist/${person.slug}`} className={cell}>
                  {face}
                  {label}
                </Link>
              );
            })}
      </nav>
      {open && (
        <StoryViewer key={open} slug={open} onClose={() => setOpen(null)} onFinish={finish} />
      )}
    </>
  );
}
