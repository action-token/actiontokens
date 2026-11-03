"use client";

import { Gem, Heart, Lock, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Badge } from "@bandcoin/ui/components/badge";
import { cn } from "@bandcoin/ui/lib/cn";

import { timeAgo } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

import { Avatar } from "../shell/context-panel";
import { PostComments } from "./post-comments";

export type FeedPost = RouterOutputs["post"]["feed"]["posts"][number];

/** Long posts start folded at this many characters. */
const FOLD_AT = 420;

/** One artist post: who and when, the text and media (or what opens them), then like, comment, collect. */
export function PostCard({ post }: { post: FeedPost }) {
  const [showComments, setShowComments] = useState(false);
  const artistHref = `/artist/${post.artist.slug}`;

  return (
    <article id={`post-${post.id}`} className="bg-surface grid gap-4 rounded-[1.2rem] border p-5">
      <header className="flex items-center gap-3">
        <Link href={artistHref} className="shrink-0">
          <Avatar name={post.artist.name} url={post.artist.avatarUrl} />
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={artistHref} className="block truncate text-sm font-semibold hover:underline">
            {post.artist.name}
          </Link>
          <p className="text-fg-faint text-xs">{timeAgo(post.createdAt)}</p>
        </div>
        {post.tierName && <Badge variant="secondary">{post.tierName}</Badge>}
      </header>

      <h2 className="display text-lg leading-snug">{post.title}</h2>
      {post.lock ? <LockedNote post={post} artistHref={artistHref} /> : <PostBody post={post} />}

      <footer className="flex flex-wrap items-center gap-2 border-t pt-3">
        <LikeButton post={post} />
        <ActionButton
          active={showComments}
          onClick={() => setShowComments(!showComments)}
          aria-expanded={showComments}
        >
          <MessageCircle className="size-4" />
          {post.comments > 0 ? post.comments : "Comment"}
        </ActionButton>
        <CollectButton post={post} />
      </footer>

      {showComments && <PostComments postId={post.id} canWrite={!post.lock} />}
    </article>
  );
}

function PostBody({ post }: { post: FeedPost }) {
  const body = post.body ?? "";
  const [open, setOpen] = useState(body.length <= FOLD_AT);
  return (
    <>
      {body && (
        <div className="text-fg-muted text-sm leading-relaxed whitespace-pre-line">
          {open ? body : `${body.slice(0, FOLD_AT).trimEnd()}…`}
          {!open && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="text-fg ml-1 font-semibold hover:underline"
            >
              Read more
            </button>
          )}
        </div>
      )}
      {post.media.length > 0 && <PostMedia media={post.media} />}
    </>
  );
}

function PostMedia({ media }: { media: FeedPost["media"] }) {
  const images = media.filter((file) => file.type === "IMAGE");
  const others = media.filter((file) => file.type !== "IMAGE");
  return (
    <div className="grid gap-2">
      {images.length > 0 && (
        <div className={cn("grid gap-2", images.length > 1 && "grid-cols-2")}>
          {images.map((file) => (
            // eslint-disable-next-line @next/next/no-img-element -- uploads come from the bucket
            <img
              key={file.id}
              src={file.url}
              alt={file.title ?? ""}
              loading="lazy"
              className="bg-surface-2 aspect-[4/3] w-full rounded-xl object-cover"
            />
          ))}
        </div>
      )}
      {others.map((file) =>
        file.type === "VIDEO" ? (
          <video
            key={file.id}
            src={file.url}
            poster={file.thumbnailUrl ?? undefined}
            controls
            preload="metadata"
            className="aspect-video w-full rounded-xl bg-black"
          />
        ) : (
          <div key={file.id} className="bg-surface-2 grid gap-1.5 rounded-xl p-3">
            {file.title && <b className="text-sm">{file.title}</b>}
            <audio src={file.url} controls preload="none" className="w-full" />
          </div>
        ),
      )}
    </div>
  );
}

function LockedNote({ post, artistHref }: { post: FeedPost; artistHref: string }) {
  const lock = post.lock!;
  const needed = Number(lock.needed).toLocaleString("en-US");
  return (
    <div className="bg-surface-2 grid gap-2 rounded-xl border border-dashed p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Lock className="text-fg-muted size-4 shrink-0" /> For {lock.tierName} members
      </p>
      <p className="text-fg-muted text-sm">
        {lock.code
          ? `Hold ${needed} ${lock.code} to open it. You have ${Number(lock.have).toLocaleString("en-US")}.`
          : "This artist's membership opens soon."}
      </p>
      {lock.code && (
        <Link
          href={artistHref}
          className="text-primary-text justify-self-start text-sm font-semibold hover:underline"
        >
          Get {lock.code} on {post.artist.name}&apos;s page
        </Link>
      )}
    </div>
  );
}

function ActionButton({
  active,
  className,
  ...props
}: React.ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "text-fg-muted hover:bg-surface-2 hover:text-fg flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors disabled:opacity-50",
        active && "bg-surface-2 text-fg",
        className,
      )}
      {...props}
    />
  );
}

function LikeButton({ post }: { post: FeedPost }) {
  const utils = api.useUtils();
  const like = api.post.setLike.useMutation({ onSettled: () => utils.post.feed.invalidate() });
  // Shows the new state at once; the feed catches up when it refetches.
  const wanted = like.isPending ? like.variables.on : null;
  const liked = wanted ?? post.liked;
  const count = post.likes + (wanted === null || wanted === post.liked ? 0 : wanted ? 1 : -1);
  return (
    <ActionButton
      aria-pressed={liked}
      onClick={() => like.mutate({ postId: post.id, on: !liked })}
      className={cn(liked && "text-danger hover:text-danger")}
    >
      <Heart className={cn("size-4", liked && "fill-current")} />
      {count > 0 ? count : "Like"}
    </ActionButton>
  );
}

function CollectButton({ post }: { post: FeedPost }) {
  const utils = api.useUtils();
  const collect = api.post.collect.useMutation({ onSettled: () => utils.post.feed.invalidate() });
  const { total, collected, mine } = post.copies;
  if (total === 0) return null;
  const left = total - collected;
  return (
    <ActionButton
      disabled={mine || left === 0 || Boolean(post.lock) || collect.isPending}
      onClick={() => collect.mutate({ postId: post.id })}
      className={cn("ml-auto", mine && "text-primary-text disabled:opacity-100")}
      title={collect.error?.message}
    >
      <Gem className="size-4" />
      {mine ? "Collected" : left === 0 ? "All collected" : `Collect · ${left} of ${total} left`}
    </ActionButton>
  );
}
