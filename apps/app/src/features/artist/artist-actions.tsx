"use client";

import { useState } from "react";

import type { ItemCardData } from "../catalog/item-card";
import { PlayAllButton } from "../music/track-list";
import { FollowButton } from "./follow-button";

/** Play, Follow / Subscribe and the live follower and subscriber counts under an artist's name. */
export function ArtistActions({
  slug,
  following,
  subscribed,
  followers: initialFollowers,
  subscribers: initialSubscribers,
  token,
  popular,
}: {
  slug: string;
  following: boolean;
  subscribed: boolean;
  followers: number;
  subscribers: number;
  /** The artist's fan token; null when they have none (nobody can subscribe yet) */
  token: { code: string; artistId: string } | null;
  popular: ItemCardData[];
}) {
  const [counts, setCounts] = useState({
    followers: initialFollowers,
    subscribers: initialSubscribers,
  });
  return (
    <div className="flex flex-wrap items-center gap-4">
      <PlayAllButton tracks={popular} shuffle />
      <FollowButton
        onDark
        slug={slug}
        initial={following}
        initialSubscribed={subscribed}
        token={token}
        onFollowers={(followers, subscribers) => setCounts({ followers, subscribers })}
        onStanding={(standing) => {
          // A fan who just subscribed counts once more among the subscribers (the server count follows on reload).
          if (standing.subscribed && !subscribed)
            setCounts((now) => ({ ...now, subscribers: Math.max(now.subscribers, 1) }));
        }}
      />
      <span className="text-sm text-white/75">
        <b className="text-white">{counts.followers.toLocaleString()}</b>{" "}
        {counts.followers === 1 ? "follower" : "followers"}
        {token && (
          <>
            {" · "}
            <b className="text-white">{counts.subscribers.toLocaleString()}</b>{" "}
            {counts.subscribers === 1 ? "subscriber" : "subscribers"}
          </>
        )}
      </span>
    </div>
  );
}
