"use client";

import { ArrowLeft, Newspaper } from "lucide-react";
import Link from "next/link";

import { Button } from "@actiontokens/ui/components/button";
import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { EmptyState } from "@actiontokens/ui/patterns/empty-state";
import { ErrorState } from "@actiontokens/ui/patterns/error-state";

import { api } from "~/trpc/react";

import { PostCard } from "./post-card";

/** One post on its own page, with every comment; the link Share copies. */
export function PostPage({ postId }: { postId: string }) {
  const post = api.post.byId.useQuery({ postId }, { retry: false });

  return (
    <>
      <Link
        href="/feed"
        className="text-fg-muted hover:text-fg flex w-fit items-center gap-1.5 text-sm font-semibold"
      >
        <ArrowLeft className="size-4" /> Feed
      </Link>
      {post.isPending ? (
        <div className="bg-surface grid gap-3 rounded-[1.2rem] border p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="aspect-[4/3] w-full rounded-xl" />
        </div>
      ) : post.error?.data?.code === "NOT_FOUND" ? (
        <EmptyState
          icon={Newspaper}
          title="This post isn't here anymore"
          description="The organization may have removed it."
          action={
            <Button asChild variant="secondary">
              <Link href="/feed">Back to the feed</Link>
            </Button>
          }
        />
      ) : post.isError ? (
        <ErrorState message="Couldn't load this post." onRetry={() => void post.refetch()} />
      ) : (
        <PostCard post={post.data} full />
      )}
    </>
  );
}
