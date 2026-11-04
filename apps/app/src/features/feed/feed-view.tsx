"use client";

import { Newspaper } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Fragment, type ReactNode, useRef, useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@bandcoin/ui/components/tabs";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { useConnectWalletDialogStore } from "@bandcoin/wallet";

import { api } from "~/trpc/react";

import { PostCard } from "./post-card";

type Scope = "all" | "following";

/**
 * The feed: For you (every artist's posts, open to anyone) and Following
 * (needs sign-in), newest first, with "Load more". Posts the viewer can't open
 * are shown locked.
 */
export function FeedView({ afterFirst }: { afterFirst?: ReactNode }) {
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const [picked, setPicked] = useState<Scope>("all");
  const anchor = useRef<HTMLDivElement>(null);
  const scope: Scope = picked === "following" && !signedIn ? "all" : picked;
  const feed = api.post.feed.useInfiniteQuery(
    { scope },
    { getNextPageParam: (page) => page.next, enabled: status !== "loading" },
  );

  const tabs = (
    <Tabs
      value={scope}
      onValueChange={(next) => {
        if (next === "following" && !signedIn) return openSignIn(true);
        setPicked(next as Scope);
        // A new list starts from its top, never from wherever the last one was scrolled to.
        const top = anchor.current;
        if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: "start" });
      }}
    >
      <TabsList>
        <TabsTrigger value="all">For you</TabsTrigger>
        <TabsTrigger value="following">Following</TabsTrigger>
      </TabsList>
    </Tabs>
  );

  const pages = feed.data?.pages ?? [];
  const posts = pages.flatMap((page) => page.posts);
  const loading = status === "loading" || feed.isPending;

  // The tabs stay mounted and the column keeps about a screen of height in every
  // state, so switching lists never collapses the page under the scroll position.
  return (
    <div ref={anchor} className="grid min-h-[100dvh] scroll-mt-4 content-start gap-4">
      {tabs}
      {loading ? (
        [0, 1, 2, 3, 4].map((key) => (
          <div key={key} className="bg-surface grid gap-3 rounded-[1.2rem] border p-5">
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-16 w-full" />
          </div>
        ))
      ) : posts.length === 0 ? (
        <>
          {scope === "all" ? (
            <EmptyState
              icon={Newspaper}
              title="No posts yet"
              description="When artists post news, photos or music, it shows up here."
            />
          ) : (
            <FollowingEmpty following={pages[0]?.following ?? 0} />
          )}
          {afterFirst}
        </>
      ) : (
        <>
          {posts.map((post, index) => (
            <Fragment key={post.id}>
              <PostCard post={post} />
              {index === 0 && afterFirst}
            </Fragment>
          ))}
          {feed.hasNextPage && (
            <Button
              variant="secondary"
              className="justify-self-center"
              disabled={feed.isFetchingNextPage}
              onClick={() => void feed.fetchNextPage()}
            >
              {feed.isFetchingNextPage ? "Loading…" : "Load more"}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function FollowingEmpty({ following }: { following: number }) {
  return (
    <EmptyState
      icon={Newspaper}
      title={following === 0 ? "Follow artists to fill your feed" : "No posts yet"}
      description={
        following === 0
          ? "When artists you follow post news, photos or music, it shows up here."
          : "The artists you follow haven't posted yet. New posts show up here."
      }
      action={
        <Button asChild variant={following === 0 ? "default" : "secondary"}>
          <Link href="/marketplace">Find artists</Link>
        </Button>
      }
    />
  );
}
