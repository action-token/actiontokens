"use client";

import { Globe2, Heart, Loader2, Lock, MessageCircle, Share2, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRef, useState } from "react";
import toast from "react-hot-toast";

import { Badge } from "@actiontokens/ui/components/badge";
import { cn } from "@actiontokens/ui/lib/cn";
import { useConnectWalletDialogStore } from "@actiontokens/wallet";

import { timeAgo } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

import { Avatar } from "../shell/context-panel";
import { CollectQr } from "./collect-qr";
import { CommentBox, CommentBubble, PostComments } from "./post-comments";
import { PostMedia } from "./post-media";

export type FeedPost = RouterOutputs["post"]["feed"]["posts"][number];

/** Long posts start folded at this many characters in the feed. */
const FOLD_AT = 420;

/**
 * One artist post, laid out like a social feed: who and when, the words, the
 * media edge to edge, the counts, then Like · Comment · Share and the newest
 * comment. Fans collect a post by scanning its QR with the AR app. `full` is the post's own page: every comment, nothing folded.
 */
export function PostCard({ post, full = false }: { post: FeedPost; full?: boolean }) {
  const input = useRef<HTMLTextAreaElement>(null);
  const href = `/feed/${post.id}`;
  const commentsOff = !post.comment.open && post.comment.reason === "OFF";
  const artistHref = `/artist/${post.artist.slug}`;

  return (
    <article
      id={`post-${post.id}`}
      className="bg-surface grid gap-3 rounded-[1.2rem] border px-5 pt-4 pb-3"
    >
      <header className="flex items-center gap-3">
        <Link href={artistHref} className="shrink-0">
          <Avatar name={post.artist.name} url={post.artist.avatarUrl} />
        </Link>
        <div className="min-w-0 flex-1">
          <Link
            href={artistHref}
            className="block truncate text-[15px] font-semibold hover:underline"
          >
            {post.artist.name}
          </Link>
          <p className="text-fg-muted flex items-center gap-1 text-xs">
            <Link href={href} className="hover:underline">
              {timeAgo(post.createdAt)}
            </Link>
            <span aria-hidden>·</span>
            {post.audience === "MEMBERS" ? (
              <Lock className="size-3" aria-label="Members only" />
            ) : post.audience === "FOLLOWERS" ? (
              <Users className="size-3" aria-label="Followers only" />
            ) : (
              <Globe2 className="size-3" aria-label="Public" />
            )}
          </p>
        </div>
        {post.tierName && <Badge variant="secondary">{post.tierName}</Badge>}
        <CollectQr post={post} />
      </header>

      <div className="grid gap-1">
        <h2 className="text-[15px] leading-snug font-semibold">
          {full ? post.title : <Link href={href}>{post.title}</Link>}
        </h2>
        {!post.lock && <PostText body={post.body ?? ""} full={full} />}
      </div>
      {post.lock ? (
        <LockedNote post={post} artistHref={artistHref} />
      ) : (
        post.media.length > 0 && <PostMedia post={post} />
      )}

      <Counts post={post} href={href} />
      <div className="-mx-2 grid auto-cols-fr grid-flow-col border-y py-1">
        <LikeButton post={post} />
        {!commentsOff && (
          <ActionButton disabled={!post.comment.open} onClick={() => input.current?.focus()}>
            <MessageCircle className="size-[18px]" /> Comment
          </ActionButton>
        )}
        <ShareButton post={post} href={href} />
      </div>

      {post.lock ? null : full ? (
        <PostComments
          postId={post.id}
          canWrite={post.comment.open}
          closedNote={post.comment.message}
          inputRef={input}
        />
      ) : (
        <LatestComment post={post} href={href} inputRef={input} />
      )}
    </article>
  );
}

function PostText({ body, full }: { body: string; full: boolean }) {
  const [open, setOpen] = useState(full || body.length <= FOLD_AT);
  if (!body) return null;
  return (
    <p className="text-[15px] leading-relaxed whitespace-pre-line">
      {open ? body : `${body.slice(0, FOLD_AT).trimEnd()}…`}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-fg-muted ml-1 font-semibold hover:underline"
        >
          See more
        </button>
      )}
    </p>
  );
}

/** ♥ 12 on the left; "3 comments · 4 of 100 collected" on the right. */
function Counts({ post, href }: { post: FeedPost; href: string }) {
  const { total, collected } = post.copies;
  if (post.likes === 0 && post.comments === 0 && collected === 0) return null;
  return (
    <div className="text-fg-muted flex items-center gap-3 text-sm">
      {post.likes > 0 && (
        <span className="flex items-center gap-1.5">
          <span className="bg-danger grid size-[18px] place-items-center rounded-full text-white">
            <Heart className="size-2.5 fill-current" />
          </span>
          {post.likes}
        </span>
      )}
      <span className="ml-auto flex gap-3">
        {post.comments > 0 && (
          <Link href={href} className="hover:underline">
            {post.comments} comment{post.comments === 1 ? "" : "s"}
          </Link>
        )}
        {total > 0 && collected > 0 && (
          <span>
            {collected} of {total} collected
          </span>
        )}
      </span>
    </div>
  );
}

/** The newest comment under the post, a link to the rest, and a box to add yours. */
function LatestComment({
  post,
  href,
  inputRef,
}: {
  post: FeedPost;
  href: string;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  return (
    <div className="grid gap-2.5">
      {post.comments > 1 && (
        <Link href={href} className="text-fg-muted text-sm font-semibold hover:underline">
          View all {post.comments} comments
        </Link>
      )}
      {post.latestComment && (
        <CommentBubble postId={post.id} comment={post.latestComment} onReply={null} />
      )}
      <CommentBox
        postId={post.id}
        canWrite={post.comment.open}
        closedNote={post.comment.message}
        inputRef={inputRef}
      />
    </div>
  );
}

function LockedNote({ post, artistHref }: { post: FeedPost; artistHref: string }) {
  const lock = post.lock!;
  if (lock.kind === "FOLLOW")
    return (
      <div className="bg-surface-2 grid gap-2 rounded-xl border border-dashed p-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Users className="text-fg-muted size-4 shrink-0" /> For followers
        </p>
        <p className="text-fg-muted text-sm">Follow {post.artist.name} to open it.</p>
        <Link
          href={artistHref}
          className="text-primary-text flex items-center gap-1.5 justify-self-start text-sm font-semibold hover:underline"
        >
          <UserPlus className="size-4" /> Follow on {post.artist.name}&apos;s page
        </Link>
      </div>
    );
  if (lock.kind === "SUBSCRIBE")
    return (
      <div className="bg-surface-2 grid gap-2 rounded-xl border border-dashed p-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Lock className="text-fg-muted size-4 shrink-0" /> For subscribers
        </p>
        <p className="text-fg-muted text-sm">
          {lock.code
            ? `Subscribe to ${post.artist.name} (trust ${lock.code}) to open it.`
            : "This artist's subscriptions open soon."}
        </p>
        {lock.code && (
          <Link
            href={artistHref}
            className="text-primary-text justify-self-start text-sm font-semibold hover:underline"
          >
            Subscribe on {post.artist.name}&apos;s page
          </Link>
        )}
      </div>
    );
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

function ActionButton({ className, ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "text-fg-muted hover:bg-surface-2 flex h-9 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-semibold transition-colors disabled:opacity-40 disabled:hover:bg-transparent",
        className,
      )}
      {...props}
    />
  );
}

/** Signed out, an action opens sign-in instead. */
function useSignedInAction() {
  const { status } = useSession();
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  return (action: () => void) => () => (status === "authenticated" ? action() : openSignIn(true));
}

function useRefreshCard(postId: string) {
  const utils = api.useUtils();
  return () => Promise.all([utils.post.feed.invalidate(), utils.post.byId.invalidate({ postId })]);
}

function LikeButton({ post }: { post: FeedPost }) {
  const signedIn = useSignedInAction();
  const like = api.post.setLike.useMutation({ onSettled: useRefreshCard(post.id) });
  // Shows the new state at once; the card catches up when it refetches.
  const liked = (like.isPending ? like.variables.on : null) ?? post.liked;
  return (
    <ActionButton
      aria-pressed={liked}
      aria-busy={like.isPending}
      disabled={like.isPending}
      onClick={signedIn(() => like.mutate({ postId: post.id, on: !liked }))}
      className={cn(liked && "text-danger hover:text-danger disabled:opacity-100")}
    >
      {like.isPending ? (
        <Loader2 className="size-[18px] animate-spin" />
      ) : (
        <Heart className={cn("size-[18px]", liked && "fill-current")} />
      )}{" "}
      Like
    </ActionButton>
  );
}

function ShareButton({ post, href }: { post: FeedPost; href: string }) {
  async function share() {
    const url = `${window.location.origin}${href}`;
    try {
      if (typeof navigator.share === "function")
        return await navigator.share({ title: post.title, url });
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      // Closing the share sheet isn't an error.
    }
  }
  return (
    <ActionButton onClick={() => void share()}>
      <Share2 className="size-[18px]" /> Share
    </ActionButton>
  );
}
