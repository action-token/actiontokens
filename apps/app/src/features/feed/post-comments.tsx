"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { type FormEvent, useState } from "react";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { Textarea } from "@bandcoin/ui/components/textarea";

import { timeAgo } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

import { Avatar } from "../shell/context-panel";

type Comment = RouterOutputs["post"]["comments"][number];

/** A post's comments, replies one level in, and a box to add yours. */
export function PostComments({ postId, canWrite }: { postId: string; canWrite: boolean }) {
  const comments = api.post.comments.useQuery({ postId });
  const [replyTo, setReplyTo] = useState<Comment | null>(null);

  if (comments.isPending)
    return (
      <div className="grid gap-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-2/3" />
      </div>
    );
  const all = comments.data ?? [];
  const threads = all.filter((comment) => !comment.parentId);
  const repliesOf = (id: string) => all.filter((comment) => comment.parentId === id);

  return (
    <section aria-label="Comments" className="grid gap-4">
      {threads.length === 0 ? (
        <p className="text-fg-muted text-sm">No comments yet.</p>
      ) : (
        <ul className="grid gap-4">
          {threads.map((comment) => (
            <li key={comment.id} className="grid gap-3">
              <CommentRow
                postId={postId}
                comment={comment}
                onReply={canWrite ? setReplyTo : null}
              />
              {repliesOf(comment.id).length > 0 && (
                <ul className="ml-11 grid gap-3 border-l pl-4">
                  {repliesOf(comment.id).map((reply) => (
                    <li key={reply.id}>
                      <CommentRow
                        postId={postId}
                        comment={reply}
                        onReply={canWrite ? setReplyTo : null}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      {canWrite && <CommentBox postId={postId} replyTo={replyTo} onDone={() => setReplyTo(null)} />}
    </section>
  );
}

function CommentRow({
  postId,
  comment,
  onReply,
}: {
  postId: string;
  comment: Comment;
  onReply: ((comment: Comment) => void) | null;
}) {
  const { data: session } = useSession();
  const utils = api.useUtils();
  const remove = api.post.removeComment.useMutation({
    onSuccess: () =>
      Promise.all([utils.post.comments.invalidate({ postId }), utils.post.feed.invalidate()]),
  });
  const mine = session?.user.id === comment.author.id;
  const name = comment.author.href ? (
    <Link href={comment.author.href} className="font-semibold hover:underline">
      {comment.author.name}
    </Link>
  ) : (
    <b className="font-semibold">{comment.author.name}</b>
  );

  return (
    <div className="flex items-start gap-3">
      <Avatar
        name={comment.author.name}
        url={comment.author.avatarUrl}
        className="bg-surface-3 grid size-8 shrink-0 place-items-center rounded-full object-cover text-[10px] font-bold"
      />
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="text-sm">
          {name} <span className="text-fg-faint text-xs">{timeAgo(comment.createdAt)}</span>
        </p>
        <p className="text-fg-muted text-sm whitespace-pre-line">{comment.body}</p>
        <div className="flex gap-3 text-xs font-semibold">
          {onReply && (
            <button
              type="button"
              onClick={() => onReply(comment)}
              className="text-fg-muted hover:text-fg"
            >
              Reply
            </button>
          )}
          {mine && (
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => remove.mutate({ commentId: comment.id })}
              className="text-fg-muted hover:text-danger"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CommentBox({
  postId,
  replyTo,
  onDone,
}: {
  postId: string;
  replyTo: Comment | null;
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const utils = api.useUtils();
  const add = api.post.addComment.useMutation({
    onSuccess: async () => {
      setText("");
      onDone();
      await Promise.all([utils.post.comments.invalidate({ postId }), utils.post.feed.invalidate()]);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    add.mutate({ postId, body: text, parentId: replyTo?.id ?? null });
  };

  return (
    <form onSubmit={submit} className="grid gap-2">
      {replyTo && (
        <p className="text-fg-muted flex items-center gap-2 text-xs">
          Replying to <b className="text-fg">{replyTo.author.name}</b>
          <button type="button" onClick={onDone} className="hover:text-fg font-semibold underline">
            Cancel
          </button>
        </p>
      )}
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={replyTo ? "Write a reply" : "Write a comment"}
        aria-label={replyTo ? "Reply" : "Comment"}
        rows={2}
        maxLength={1000}
      />
      {add.error && <p className="text-danger text-xs">{add.error.message}</p>}
      <Button
        type="submit"
        size="sm"
        disabled={!text.trim() || add.isPending}
        className="justify-self-end"
      >
        {add.isPending ? "Sending…" : replyTo ? "Reply" : "Comment"}
      </Button>
    </form>
  );
}
