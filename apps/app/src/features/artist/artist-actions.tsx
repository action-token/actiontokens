"use client";

import type { ItemCardData } from "../catalog/item-card";
import { PlayAllButton } from "../music/track-list";
import { useArtistStanding } from "./artist-standing";
import { FollowButton } from "./follow-button";

/**
 * Play, Follow / Subscribe and the live follower and subscriber counts under an artist's
 * name. Inside `ArtistStandingProvider`, so the sticky bar's Follow changes these too.
 */
export function ArtistActions({
  slug,
  token,
  popular,
}: {
  slug: string;
  /** The artist's fan token; null when they have none (nobody can subscribe yet) */
  token: { code: string; organizationId: string } | null;
  popular: ItemCardData[];
}) {
  const standing = useArtistStanding(slug)?.standing;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <PlayAllButton tracks={popular} shuffle />
      <FollowButton
        onDark
        slug={slug}
        initial={standing?.following ?? false}
        initialSubscribed={standing?.subscribed ?? false}
        token={token}
      />
      {standing && (
        <span className="text-sm text-white/75">
          <b className="text-white">{standing.followers.toLocaleString()}</b>{" "}
          {standing.followers === 1 ? "follower" : "followers"}
          {token && (
            <>
              {" · "}
              <b className="text-white">{standing.subscribers.toLocaleString()}</b>{" "}
              {standing.subscribers === 1 ? "subscriber" : "subscribers"}
            </>
          )}
        </span>
      )}
    </div>
  );
}
