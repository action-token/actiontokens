"use client";

import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { ErrorState } from "@actiontokens/ui/patterns/error-state";
import { PageBody, PageHeader } from "@actiontokens/ui/patterns/page-header";

import { api } from "~/trpc/react";

import { PostForm } from "./post-form";

export const NewPostView = () => <PostForm />;

export function EditPostView({ postId }: { postId: string }) {
  const post = api.posts.post.useQuery({ postId });
  if (post.data) return <PostForm existing={post.data} />;
  return (
    <PageBody className="grid gap-6">
      <PageHeader back={{ href: "/posts", label: "Posts" }} eyebrow="Content" title="Edit post" />
      {post.isPending ? (
        <Skeleton className="h-96 w-full max-w-2xl rounded-xl" />
      ) : post.error.data?.code === "NOT_FOUND" ? (
        <ErrorState message="This post doesn't exist." />
      ) : (
        <ErrorState message="Couldn't load this post." onRetry={() => void post.refetch()} />
      )}
    </PageBody>
  );
}
