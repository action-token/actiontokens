"use client";

import { Users } from "lucide-react";
import { useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@bandcoin/ui/components/tabs";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { SearchInput, Toolbar } from "@bandcoin/ui/patterns/toolbar";

import { api } from "~/trpc/react";

import { ArtistCard } from "./artist-card";

type Sort = "popular" | "newest";

const GRID = "grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3";

/** Every artist: search by name, most followed or newest first, a page at a time. */
export function ArtistsView() {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<Sort>("popular");
  const list = api.artist.directory.useInfiniteQuery(
    { search: search || undefined, sort },
    { getNextPageParam: (page) => page.next },
  );
  const artists = list.data?.pages.flatMap((page) => page.artists) ?? [];

  return (
    <div className="grid gap-6">
      <Toolbar className="sm:justify-between">
        <SearchInput placeholder="Search artists" onSearch={setSearch} className="sm:w-80" />
        <Tabs value={sort} onValueChange={(next) => setSort(next as Sort)}>
          <TabsList>
            <TabsTrigger value="popular">Most followed</TabsTrigger>
            <TabsTrigger value="newest">Newest</TabsTrigger>
          </TabsList>
        </Tabs>
      </Toolbar>

      {list.isPending ? (
        <div className={GRID}>
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="min-h-[24rem] rounded-[1.4rem]" />
          ))}
        </div>
      ) : list.isError ? (
        <ErrorState message="Couldn't load the artists." onRetry={() => void list.refetch()} />
      ) : artists.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No artists found"
          description={search ? `Nobody called “${search}”.` : "Artists will show up here."}
        />
      ) : (
        <>
          <div className={GRID}>
            {artists.map((artist) => (
              <ArtistCard key={artist.slug} artist={artist} />
            ))}
          </div>
          {list.hasNextPage && (
            <Button
              variant="secondary"
              className="justify-self-center"
              disabled={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            >
              {list.isFetchingNextPage ? "Loading…" : "Load more"}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
