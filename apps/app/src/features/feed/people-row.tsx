"use client";

import Link from "next/link";

import { Skeleton } from "@bandcoin/ui/components/skeleton";

import { api } from "~/trpc/react";

import { Avatar } from "../shell/context-panel";

const AVATAR =
  "bg-surface-3 grid size-16 shrink-0 place-items-center rounded-full object-cover text-sm font-bold";

/** A row of artists across the top of the feed, like Facebook's stories: tap one to open their page. */
export function PeopleRow() {
  const artists = api.artist.suggested.useQuery({ limit: 16 }, { staleTime: 60_000 });
  if (artists.data?.length === 0) return null;
  return (
    <nav aria-label="Artists" className="flex [scrollbar-width:none] gap-4 overflow-x-auto py-1">
      {artists.isPending
        ? [0, 1, 2, 3, 4, 5, 6, 7].map((key) => (
            <div key={key} className="grid w-[4.5rem] shrink-0 justify-items-center gap-1.5">
              <Skeleton className="size-16 rounded-full" />
              <Skeleton className="h-3 w-12" />
            </div>
          ))
        : artists.data?.map((artist) => (
            <Link
              key={artist.slug}
              href={`/artist/${artist.slug}`}
              className="grid w-[4.5rem] shrink-0 justify-items-center gap-1.5 text-center"
            >
              <span className="ring-primary ring-offset-bg rounded-full ring-2 ring-offset-2">
                <Avatar name={artist.name} url={artist.avatarUrl} className={AVATAR} />
              </span>
              <span className="w-full truncate text-xs font-medium">{artist.name}</span>
            </Link>
          ))}
    </nav>
  );
}
