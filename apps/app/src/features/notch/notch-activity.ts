"use client";

import { type Mutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useToasterStore } from "react-hot-toast";

export type ActivityKind = "bounty" | "community" | "follow" | "playlist" | "profile" | "comment";

type Words = { kind: ActivityKind; busy: string; done: string };
type Label = Words | ((input: Record<string, unknown>) => Words);

/**
 * What the notch says while an action runs and once it lands, by tRPC path. Only actions a
 * person takes on purpose are listed: wallet signing flows already show their own transaction
 * toast in the notch, and background calls (play counts, marking seen) stay quiet.
 */
const LABELS: Record<string, Label> = {
  "bounty.join": { kind: "bounty", busy: "Joining bounty…", done: "You're in. Good hunting." },
  "bounty.syncProgress": {
    kind: "bounty",
    busy: "Checking your progress…",
    done: "Progress updated",
  },
  "bounty.submitReport": { kind: "bounty", busy: "Sending your proof…", done: "Proof sent" },
  "community.join": { kind: "community", busy: "Joining crew…", done: "Welcome to the crew" },
  "community.leave": { kind: "community", busy: "Leaving crew…", done: "You left the crew" },
  "community.create": { kind: "community", busy: "Creating crew…", done: "Crew created" },
  "community.update": { kind: "community", busy: "Saving crew…", done: "Crew saved" },
  "community.delete": { kind: "community", busy: "Deleting crew…", done: "Crew deleted" },
  "community.invite": { kind: "community", busy: "Sending invite…", done: "Invite sent" },
  "community.removeMember": { kind: "community", busy: "Removing member…", done: "Member removed" },
  "community.setNotifySettings": {
    kind: "community",
    busy: "Saving…",
    done: "Notifications saved",
  },
  "community.post.create": { kind: "comment", busy: "Posting…", done: "Posted to the crew" },
  "community.post.delete": { kind: "comment", busy: "Deleting post…", done: "Post deleted" },
  "community.comment.create": { kind: "comment", busy: "Commenting…", done: "Comment added" },
  "post.addComment": { kind: "comment", busy: "Commenting…", done: "Comment added" },
  "artist.setFollowing": (input) =>
    input.following
      ? { kind: "follow", busy: "Following…", done: "Following" }
      : { kind: "follow", busy: "Unfollowing…", done: "Unfollowed" },
  "playlist.create": { kind: "playlist", busy: "Creating playlist…", done: "Playlist created" },
  "playlist.update": { kind: "playlist", busy: "Saving playlist…", done: "Playlist saved" },
  "playlist.delete": { kind: "playlist", busy: "Deleting playlist…", done: "Playlist deleted" },
  "playlist.addTrack": { kind: "playlist", busy: "Adding to playlist…", done: "Added to playlist" },
  "playlist.removeTrack": { kind: "playlist", busy: "Removing…", done: "Removed from playlist" },
  "account.updateProfile": { kind: "profile", busy: "Saving profile…", done: "Profile saved" },
  "account.setUsername": { kind: "profile", busy: "Saving username…", done: "Username saved" },
  "account.setAvatar": { kind: "profile", busy: "Updating picture…", done: "Picture updated" },
  "account.setCover": { kind: "profile", busy: "Updating cover…", done: "Cover updated" },
};

/** How long "done" stays in the notch. */
const DONE_MS = 2400;

export type Activity = {
  id: number;
  phase: "busy" | "done";
  kind: ActivityKind;
  text: string;
  /** When the action started: a toast raised after this is the call site's own answer. */
  since: number;
};

/** tRPC keys mutations as `[["bounty", "join"]]`. */
function pathOf(mutation: Mutation<unknown, unknown, unknown, unknown>) {
  const head = mutation.options.mutationKey?.[0];
  return Array.isArray(head) ? head.join(".") : null;
}

/**
 * The newest listed action: busy while it runs, done for a moment after. Errors, and successes
 * the call site already answers with its own toast, are left to that toast.
 */
export function useActivity(): Activity | null {
  const client = useQueryClient();
  const { toasts } = useToasterStore();
  const [activity, setActivity] = useState<Activity | null>(null);

  useEffect(
    () =>
      client.getMutationCache().subscribe((event) => {
        if (event.type !== "updated") return;
        const { mutation } = event;
        const path = pathOf(mutation);
        const label = path ? LABELS[path] : undefined;
        if (!label) return;
        const words =
          typeof label === "function"
            ? label((mutation.state.variables ?? {}) as Record<string, unknown>)
            : label;
        const id = mutation.mutationId;
        const status = mutation.state.status;
        const since = mutation.state.submittedAt;
        if (status === "pending") {
          setActivity({ id, phase: "busy", kind: words.kind, text: words.busy, since });
        } else if (status === "success") {
          setActivity({ id, phase: "done", kind: words.kind, text: words.done, since });
        } else if (status === "error") {
          setActivity((current) => (current?.id === id ? null : current));
        }
      }),
    [client],
  );

  useEffect(() => {
    if (activity?.phase !== "done") return;
    const id = window.setTimeout(
      () => setActivity((current) => (current === activity ? null : current)),
      DONE_MS,
    );
    return () => window.clearTimeout(id);
  }, [activity]);

  // The done toast outlives DONE_MS (shown 2s, removed 1s later), so this never flickers back.
  const answered = activity?.phase === "done" && toasts.some((t) => t.createdAt >= activity.since);
  return answered ? null : activity;
}
