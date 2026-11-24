"use client";
/* eslint-disable @next/next/no-img-element -- community pictures and token icons come from many hosts */

import { Heart, MessageCircle, Send, Trash2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { useState } from "react";
import toast from "react-hot-toast";

import { Button } from "@actiontokens/ui/components/button";
import { Skeleton } from "@actiontokens/ui/components/skeleton";
import { Textarea } from "@actiontokens/ui/components/textarea";
import { cn } from "@actiontokens/ui/lib/cn";

import { timeAgo } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

import { nameOf, PersonAvatar } from "./parts";

type Community = RouterOutputs["community"]["byId"];
type Post = RouterOutputs["community"]["post"]["list"]["items"][number];

/** The community's posts, newest first, with the composer on top for members who may post. */
export function CommunityPosts({ community }: { community: Community }) {
  const { data: session } = useSession();
  const me = session?.user.id;
  const posts = api.community.post.list.useInfiniteQuery(
    { communityId: community.id },
    { getNextPageParam: (page) => page.nextCursor ?? undefined },
  );
  const canPost =
    community.isMember &&
    !community.hiddenAt &&
    (community.postPermission === "ALL_MEMBERS" || community.isOwner);
  const rows = posts.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="grid gap-4">
      {canPost && <Composer communityId={community.id} />}
      {!community.isMember && <p className="cm-note">Join the crew to post, like and comment.</p>}
      {posts.isPending ? (
        <Skeleton className="h-40 rounded-3xl" />
      ) : rows.length === 0 ? (
        <p className="cm-note">No posts yet{canPost ? ". Start the conversation." : "."}</p>
      ) : (
        rows.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            communityId={community.id}
            canDelete={post.authorId === me || community.isOwner}
            canInteract={community.isMember && !community.hiddenAt}
            me={me}
            isOwner={community.isOwner}
          />
        ))
      )}
      {posts.hasNextPage && (
        <Button
          variant="outline"
          className="justify-self-center"
          disabled={posts.isFetchingNextPage}
          onClick={() => void posts.fetchNextPage()}
        >
          Older posts
        </Button>
      )}
    </div>
  );
}

function Composer({ communityId }: { communityId: string }) {
  const utils = api.useUtils();
  const [content, setContent] = useState("");
  const [comments, setComments] = useState(true);
  const create = api.community.post.create.useMutation({
    onSuccess: async () => {
      setContent("");
      await Promise.all([
        utils.community.post.list.invalidate({ communityId }),
        utils.community.byId.invalidate({ communityId }),
      ]);
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <form
      className="cm-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (content.trim()) create.mutate({ communityId, content, commentsEnabled: comments });
      }}
    >
      <Textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder="Say something to the crew…"
        maxLength={5000}
        rows={3}
      />
      <div className="flex items-center justify-between gap-3">
        <label className="text-fg-muted flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={comments}
            onChange={(event) => setComments(event.target.checked)}
          />
          Allow comments
        </label>
        <Button type="submit" size="sm" disabled={!content.trim() || create.isPending}>
          <Send /> {create.isPending ? "Posting…" : "Post"}
        </Button>
      </div>
    </form>
  );
}

function PostCard({
  post,
  communityId,
  canDelete,
  canInteract,
  me,
  isOwner,
}: {
  post: Post;
  communityId: string;
  canDelete: boolean;
  canInteract: boolean;
  me: string | undefined;
  isOwner: boolean;
}) {
  const utils = api.useUtils();
  const [open, setOpen] = useState(false);
  const [liked, setLiked] = useState(post.liked);
  const [likes, setLikes] = useState(post._count.likes);
  const like = api.community.post.like.useMutation({
    onMutate: () => {
      setLiked((value) => !value);
      setLikes((value) => value + (liked ? -1 : 1));
    },
    onSuccess: (result) => setLiked(result.liked),
    onError: (error) => {
      setLiked(post.liked);
      setLikes(post._count.likes);
      toast.error(error.message);
    },
  });
  const remove = api.community.post.delete.useMutation({
    onSuccess: () =>
      Promise.all([
        utils.community.post.list.invalidate({ communityId }),
        utils.community.byId.invalidate({ communityId }),
      ]),
    onError: (error) => toast.error(error.message),
  });
  return (
    <article className="cm-post">
      <header className="flex items-center gap-3">
        <PersonAvatar person={post.author} />
        <span className="min-w-0 flex-1">
          <b className="block truncate">{nameOf(post.author)}</b>
          <span className="text-fg-faint text-xs">{timeAgo(post.createdAt)}</span>
        </span>
        {canDelete && (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Delete post"
            disabled={remove.isPending}
            onClick={() =>
              window.confirm("Delete this post?") && remove.mutate({ postId: post.id })
            }
          >
            <Trash2 />
          </Button>
        )}
      </header>
      <p className="cm-post-text">{post.content}</p>
      {post.media.length > 0 && (
        <div className="cm-post-media">
          {post.media.map((media) =>
            media.type === "VIDEO" ? (
              <video key={media.id} src={media.url} controls preload="metadata" />
            ) : (
              <img key={media.id} src={media.url} alt="" loading="lazy" />
            ),
          )}
        </div>
      )}
      <footer className="flex items-center gap-1">
        <Button
          size="sm"
          variant="ghost"
          className={cn(liked && "text-danger")}
          disabled={!canInteract || like.isPending}
          onClick={() => like.mutate({ postId: post.id })}
        >
          <Heart className={cn(liked && "fill-current")} /> {likes}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          <MessageCircle /> {post._count.comments}
        </Button>
        {!post.commentsEnabled && <span className="text-fg-faint text-xs">comments off</span>}
      </footer>
      {open && (
        <Comments
          postId={post.id}
          communityId={communityId}
          canComment={canInteract && post.commentsEnabled}
          me={me}
          postAuthorId={post.authorId}
          isOwner={isOwner}
        />
      )}
    </article>
  );
}

function Comments({
  postId,
  communityId,
  canComment,
  me,
  postAuthorId,
  isOwner,
}: {
  postId: string;
  communityId: string;
  canComment: boolean;
  me: string | undefined;
  postAuthorId: string;
  isOwner: boolean;
}) {
  const utils = api.useUtils();
  const comments = api.community.comment.list.useInfiniteQuery(
    { postId },
    { getNextPageParam: (page) => page.nextCursor ?? undefined },
  );
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [body, setBody] = useState("");
  const refresh = () =>
    Promise.all([
      utils.community.comment.list.invalidate({ postId }),
      utils.community.post.list.invalidate({ communityId }),
    ]);
  const create = api.community.comment.create.useMutation({
    onSuccess: async () => {
      setBody("");
      setReplyTo(null);
      await refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = api.community.comment.delete.useMutation({
    onSuccess: refresh,
    onError: (error) => toast.error(error.message),
  });
  const rows = comments.data?.pages.flatMap((page) => page.items) ?? [];
  const mayDelete = (authorId: string) => authorId === me || postAuthorId === me || isOwner;

  const line = (
    comment: {
      id: string;
      body: string;
      createdAt: Date;
      authorId: string;
      author: Parameters<typeof nameOf>[0];
    },
    reply: boolean,
  ) => (
    <div className={cn("cm-comment", reply && "cm-comment--reply")}>
      <PersonAvatar person={comment.author} className="size-7" />
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <b>{nameOf(comment.author)}</b> {comment.body}
        </p>
        <p className="text-fg-faint flex gap-3 text-xs">
          {timeAgo(comment.createdAt)}
          {canComment && !reply && (
            <button
              type="button"
              className="hover:text-fg"
              onClick={() => setReplyTo({ id: comment.id, name: nameOf(comment.author) })}
            >
              Reply
            </button>
          )}
          {mayDelete(comment.authorId) && (
            <button
              type="button"
              className="hover:text-danger"
              onClick={() => remove.mutate({ commentId: comment.id })}
            >
              Delete
            </button>
          )}
        </p>
      </div>
    </div>
  );

  return (
    <div className="cm-comments">
      {comments.isPending ? (
        <Skeleton className="h-12 rounded-2xl" />
      ) : rows.length === 0 ? (
        <p className="text-fg-faint text-sm">No comments yet.</p>
      ) : (
        rows.map((comment) => (
          <div key={comment.id} className="grid gap-2">
            {line(comment, false)}
            {comment.replies.map((replyRow) => (
              <div key={replyRow.id}>{line(replyRow, true)}</div>
            ))}
          </div>
        ))
      )}
      {comments.hasNextPage && (
        <button
          type="button"
          className="text-fg-muted text-xs"
          onClick={() => void comments.fetchNextPage()}
        >
          More comments
        </button>
      )}
      {canComment && (
        <form
          className="cm-comment-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (body.trim()) create.mutate({ postId, body, parentId: replyTo?.id });
          }}
        >
          {replyTo && (
            <span className="cm-replying">
              Replying to {replyTo.name}
              <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply">
                ×
              </button>
            </span>
          )}
          <input
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder={replyTo ? "Write a reply…" : "Write a comment…"}
            maxLength={2000}
            aria-label="Comment"
          />
          <Button
            type="submit"
            size="icon-sm"
            disabled={!body.trim() || create.isPending}
            aria-label="Send"
          >
            <Send />
          </Button>
        </form>
      )}
    </div>
  );
}
