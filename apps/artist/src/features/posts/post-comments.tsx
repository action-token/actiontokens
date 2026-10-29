"use client";

import { MessageSquare, Trash2 } from "lucide-react";
import toast from "react-hot-toast";

import { Button } from "@bandcoin/ui/components/button";
import { Skeleton } from "@bandcoin/ui/components/skeleton";
import { Avatar } from "@bandcoin/ui/patterns/person";

import { timeAgo } from "~/lib/format";
import { api } from "~/trpc/react";

/** What fans said about a post. You can remove any comment on your own posts. */
export function PostComments({ postId }: { postId: string }) {
  const utils = api.useUtils();
  const comments = api.posts.comments.useQuery({ postId });
  const remove = api.posts.removeComment.useMutation({
    onSuccess: () => {
      void utils.posts.comments.invalidate({ postId });
      void utils.posts.posts.invalidate();
      toast.success("Comment removed");
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <section className="bg-surface rounded-[1.4rem] border-2 p-5">
      <h2 className="display mb-3 flex items-center gap-2 text-base">
        <MessageSquare className="text-primary-text size-4" /> Comments
      </h2>
      {comments.isPending ? (
        <Skeleton className="h-20 w-full" />
      ) : comments.isError ? (
        <p className="text-fg-muted text-sm">Couldn&apos;t load the comments.</p>
      ) : comments.data.length === 0 ? (
        <p className="text-fg-muted text-sm">No comments yet.</p>
      ) : (
        <ul className="grid gap-3">
          {comments.data.map((comment) => (
            <li key={comment.id} className="flex items-start gap-2.5">
              <Avatar
                src={comment.author.image}
                name={comment.author.name}
                className="size-7 text-xs"
              />
              <div className="min-w-0 flex-1 text-sm">
                <p className="text-fg-muted text-xs">
                  <b className="text-fg">{comment.author.name ?? "Fan"}</b> ·{" "}
                  {timeAgo(comment.createdAt)}
                  {comment.parentId ? " · reply" : ""}
                </p>
                <p className="break-words whitespace-pre-line">{comment.body}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-danger"
                aria-label="Remove comment"
                disabled={remove.isPending}
                onClick={() => remove.mutate({ commentId: comment.id })}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
