"use client";

import { Newspaper } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { useConnectWalletDialogStore } from "@bandcoin/wallet";

import { api } from "~/trpc/react";

import { PostCard } from "./post-card";

/** Posts from the artists you follow, newest first, with "Load more". */
export function FeedView() {
  const { status } = useSession();
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const feed = api.post.feed.useInfiniteQuery(
    {},
    { getNextPageParam: (page) => page.next, enabled: status === "authenticated" },
  );

  if (status === "unauthenticated")
    return (
      <EmptyState
        icon={Newspaper}
        title="Sign in to see your feed"
        description="Posts, photos and news from the artists you follow, all in one place."
        action={<Button onClick={() => openSignIn(true)}>Sign in</Button>}
      />
    );
  if (status === "loading" || feed.isPending)
    return (
      <div className="grid gap-4">
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

  return (
    <div className="grid gap-4">
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
