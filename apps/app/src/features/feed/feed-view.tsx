"use client";

import { Newspaper } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useState } from "react";

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
export function FeedView() {
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const [picked, setPicked] = useState<Scope>("all");
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
      }}
    >
      <TabsList>
        <TabsTrigger value="all">For you</TabsTrigger>
        <TabsTrigger value="following">Following</TabsTrigger>
      </TabsList>
    </Tabs>
  );

  if (status === "loading" || feed.isPending)
    return (
      <div className="grid gap-4">
        {tabs}
        {[0, 1].map((key) => (
          <div key={key} className="bg-surface grid gap-3 rounded-[1.2rem] border p-5">
            <div className="flex items-center gap-3">
              <Skeleton className="size-9 rounded-full" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-16 w-full" />
          </div>
        ))}
      </div>
    );

  const pages = feed.data?.pages ?? [];
  const posts = pages.flatMap((page) => page.posts);
  if (posts.length === 0) {
    const following = pages[0]?.following ?? 0;
    return (
      <div className="grid gap-4">
        {tabs}
        {scope === "all" ? (
          <EmptyState
            icon={Newspaper}
            title="No posts yet"
            description="When artists post news, photos or music, it shows up here."
          />
        ) : (
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
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {tabs}
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
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
    </div>
  );
}
