"use client";

import { SendHorizontal } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { type FormEvent, type RefObject, useState } from "react";

import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { cn } from "@bandcoin/ui/lib/cn";
import { useConnectWalletDialogStore } from "@bandcoin/wallet";

import { timeAgo } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

import { Avatar } from "../shell/context-panel";

type Comment = RouterOutputs["post"]["comments"][number];
type Author = Comment["author"];
export type CommentLike = { id: string; body: string; createdAt: Date | string; author: Author };

const SMALL_AVATAR =
  "bg-surface-3 grid size-8 shrink-0 place-items-center rounded-full object-cover text-[10px] font-bold";

/** Refreshes every place a post's comments show: its thread, its feed card and its page. */
function useRefreshPost(postId: string) {
  const utils = api.useUtils();
  return () =>
    Promise.all([
      utils.post.comments.invalidate({ postId }),
      utils.post.feed.invalidate(),
      utils.post.byId.invalidate({ postId }),
    ]);
}

/** Every comment on a post, replies one level in, then a box to add yours. */
export function PostComments({
  postId,
  canWrite,
  inputRef,
}: {
  postId: string;
  canWrite: boolean;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  const comments = api.post.comments.useQuery({ postId });
  const [replyTo, setReplyTo] = useState<Comment | null>(null);

  if (comments.isPending)
    return (
      <div className="grid gap-3">
        {[0, 1].map((key) => (
          <div key={key} className="flex gap-2">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-12 w-2/3 rounded-2xl" />
          </div>
        ))}
      </div>
    );
  const all = comments.data ?? [];
  const threads = all.filter((comment) => !comment.parentId);
  const repliesOf = (id: string) => all.filter((comment) => comment.parentId === id);
  function startReply(comment: Comment) {
    setReplyTo(comment);
    inputRef?.current?.focus();
  }

  return (
    <section aria-label="Comments" className="grid gap-3">
      {threads.length === 0 ? (
        <p className="text-fg-muted text-sm">No comments yet. Be the first.</p>
      ) : (
        <ul className="grid gap-3">
          {threads.map((comment) => (
            <li key={comment.id} className="grid gap-2">
              <CommentBubble
                postId={postId}
                comment={comment}
                onReply={canWrite ? () => startReply(comment) : null}
              />
              {repliesOf(comment.id).length > 0 && (
                <ul className="ml-10 grid gap-2">
                  {repliesOf(comment.id).map((child) => (
                    <li key={child.id}>
                      <CommentBubble
                        postId={postId}
                        comment={child}
                        onReply={canWrite ? () => startReply(child) : null}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      <CommentBox
        postId={postId}
        canWrite={canWrite}
        replyTo={replyTo}
        onDone={() => setReplyTo(null)}
        inputRef={inputRef}
      />
    </section>
  );
}

/** One comment as a rounded bubble, with time, Reply and (for your own) Remove under it. */
export function CommentBubble({
  postId,
  comment,
  onReply,
}: {
  postId: string;
  comment: CommentLike;
  onReply: (() => void) | null;
}) {
  const { data: session } = useSession();
  const refresh = useRefreshPost(postId);
  const remove = api.post.removeComment.useMutation({ onSuccess: refresh });
  const mine = session?.user.id === comment.author.id;
  const name = comment.author.href ? (
    <Link href={comment.author.href} className="font-semibold hover:underline">
      {comment.author.name}
    </Link>
  ) : (
    <b className="font-semibold">{comment.author.name}</b>
  );

  return (
    <div className="flex items-start gap-2">
      <Avatar name={comment.author.name} url={comment.author.avatarUrl} className={SMALL_AVATAR} />
      <div className="grid min-w-0 gap-0.5">
        <div className="bg-surface-2 w-fit max-w-full rounded-2xl px-3.5 py-2">
          <p className="text-[13px]">{name}</p>
          <p className="text-sm break-words whitespace-pre-line">{comment.body}</p>
        </div>
        <div className="text-fg-muted flex gap-3 px-3.5 text-xs">
          <span>{timeAgo(comment.createdAt)}</span>
          {onReply && (
            <button type="button" onClick={onReply} className="hover:text-fg font-semibold">
              Reply
            </button>
          )}
          {mine && (
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => remove.mutate({ commentId: comment.id })}
              className="hover:text-danger font-semibold"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** "Write a comment…" with your picture, as one rounded line; Enter sends, Shift+Enter adds a line. */
export function CommentBox({
  postId,
  canWrite,
  replyTo,
  onDone,
  inputRef,
}: {
  postId: string;
  canWrite: boolean;
  replyTo?: Comment | null;
  onDone?: () => void;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  const { status } = useSession();
  const signedIn = status === "authenticated";
  const openSignIn = useConnectWalletDialogStore((state) => state.setIsOpen);
  const me = api.account.me.useQuery(undefined, { enabled: signedIn, staleTime: 5 * 60_000 });
  const [text, setText] = useState("");
  const refresh = useRefreshPost(postId);
  const add = api.post.addComment.useMutation({
    onSuccess: async () => {
      setText("");
      onDone?.();
      await refresh();
    },
  });

  if (!canWrite) return null;
  if (status === "unauthenticated")
    return (
      <button
        type="button"
        onClick={() => openSignIn(true)}
        className="bg-surface-2 text-fg-muted hover:text-fg h-10 rounded-full px-4 text-left text-sm"
      >
        Sign in to comment
      </button>
    );

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!text.trim() || add.isPending) return;
    add.mutate({ postId, body: text, parentId: replyTo?.id ?? null });
  };
  const name = me.data?.artist?.name ?? me.data?.displayName ?? "You";

  return (
    <form onSubmit={submit} className="grid gap-1">
      {replyTo && (
        <p className="text-fg-muted flex items-center gap-2 pl-10 text-xs">
          Replying to <b className="text-fg">{replyTo.author.name}</b>
          <button type="button" onClick={onDone} className="hover:text-fg font-semibold underline">
            Cancel
          </button>
        </p>
      )}
      <div className="flex items-end gap-2">
        <Avatar name={name} url={me.data?.avatarUrl ?? null} className={SMALL_AVATAR} />
        <div className="bg-surface-2 focus-within:ring-primary/40 flex min-w-0 flex-1 items-end rounded-[1.25rem] pr-1 ring-1 ring-transparent">
          <textarea
            ref={inputRef}
            value={text}
            rows={1}
            maxLength={1000}
            onChange={(event) => {
              setText(event.target.value);
              event.target.style.height = "auto";
              event.target.style.height = `${Math.min(event.target.scrollHeight, 160)}px`;
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder={replyTo ? `Reply to ${replyTo.author.name}…` : "Write a comment…"}
            aria-label={replyTo ? "Reply" : "Comment"}
            className="placeholder:text-fg-faint max-h-40 min-w-0 flex-1 resize-none bg-transparent px-3.5 py-2.5 text-sm outline-none"
          />
          <button
            type="submit"
            aria-label={add.isPending ? "Sending" : "Send"}
            disabled={!text.trim() || add.isPending}
            className={cn(
              "text-primary-text mb-1 grid size-8 shrink-0 place-items-center rounded-full transition-opacity disabled:opacity-30",
              add.isPending && "animate-pulse",
            )}
          >
            <SendHorizontal className="size-4" />
          </button>
        </div>
      </div>
      {add.error && <p className="text-danger pl-10 text-xs">{add.error.message}</p>}
    </form>
  );
}
