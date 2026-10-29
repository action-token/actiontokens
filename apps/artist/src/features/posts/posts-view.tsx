"use client";

import { FileText, Heart, Lock, MessageSquare, Music, Plus, Users2, Video } from "lucide-react";
import Link from "next/link";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { EmptyState } from "@bandcoin/ui/patterns/empty-state";
import { ErrorState } from "@bandcoin/ui/patterns/error-state";
import { Markdown } from "@bandcoin/ui/patterns/markdown";
import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";
import { StatusPill } from "@bandcoin/ui/patterns/status-pill";

import { SectionTabs } from "~/components/section-tabs";
import { POSTS_TABS } from "~/features/shell/nav";
import { timeAgo } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

type Post = RouterOutputs["posts"]["posts"][number];

/** Posts: everything you've published to followers. */
export function PostsView() {
  const posts = api.posts.posts.useQuery();
  const add = (
    <Button asChild>
      <Link href="/posts/new">
        <Plus /> New post
      </Link>
    </Button>
  );

  return (
    <PageBody className="grid max-w-3xl gap-6">
      <PageHeader
        eyebrow="Content"
        title="Posts"
        description="News, media and perks for your followers, public or for a membership tier."
        actions={posts.data && posts.data.length > 0 ? add : undefined}
      />
      <SectionTabs tabs={POSTS_TABS} label="Posts" />
      {posts.isPending ? (
        <div className="grid gap-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-48 rounded-[1.4rem]" />
          ))}
        </div>
      ) : posts.isError ? (
        <ErrorState message="Couldn't load your posts." onRetry={() => void posts.refetch()} />
      ) : posts.data.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No posts yet"
          description="Your first post shows up in followers' feeds right away."
          action={add}
        />
      ) : (
        <ul className="grid gap-4">
          {posts.data.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </ul>
      )}
    </PageBody>
  );
}

function PostCard({ post }: { post: Post }) {
  const images = post.media.filter((file) => file.type === "IMAGE");
  const others = post.media.filter((file) => file.type !== "IMAGE");
  return (
    <li className="bg-surface overflow-hidden rounded-[1.4rem] border-2">
      <Link href={`/posts/${post.id}`} className="grid gap-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="display min-w-0 text-lg">{post.title}</h3>
          {post.tierName ? (
            <StatusPill tone="info" icon={Lock}>
              {post.tierName}
            </StatusPill>
          ) : (
            <StatusPill tone="neutral" icon={Users2}>
              Everyone
            </StatusPill>
          )}
        </div>
        {post.body.trim() && (
          <Markdown content={post.body} compact className="text-fg-muted line-clamp-4" />
        )}
        {images.length > 0 && (
          <div className="grid grid-cols-4 gap-2">
            {images.slice(0, 4).map((file) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={file.id}
                src={file.url}
                alt=""
                className="bg-surface-2 aspect-square w-full rounded-lg object-cover"
              />
            ))}
          </div>
        )}
        {others.length > 0 && (
          <p className="text-fg-muted flex items-center gap-3 text-xs">
            {others.map((file) => (
              <span key={file.id} className="inline-flex items-center gap-1">
                {file.type === "VIDEO" ? (
                  <Video className="size-3.5" />
                ) : (
                  <Music className="size-3.5" />
                )}{" "}
                {file.type === "VIDEO" ? "Video" : "Music"}
              </span>
            ))}
          </p>
        )}
        <p className="text-fg-faint flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span>Posted {timeAgo(post.createdAt)}</span>
          <span className="inline-flex items-center gap-1">
            <Heart className="size-3.5" /> {post.likes}
          </span>
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="size-3.5" /> {post.comments}
          </span>
          <span>{post.collected} of 100 copies collected</span>
        </p>
      </Link>
    </li>
  );
}
