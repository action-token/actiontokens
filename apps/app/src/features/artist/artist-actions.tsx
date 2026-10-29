"use client";

import { useState } from "react";

import type { ItemCardData } from "../catalog/item-card";
import { PlayAllButton } from "../music/track-list";
import { FollowButton } from "./follow-button";

/** Play, Follow and the live follower count under an artist's name. */
export function ArtistActions({
  slug,
  following,
  followers: initialFollowers,
  popular,
}: {
  slug: string;
  following: boolean;
  followers: number;
  popular: ItemCardData[];
}) {
  const [followers, setFollowers] = useState(initialFollowers);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <PlayAllButton tracks={popular} shuffle />
      <FollowButton slug={slug} initial={following} onFollowers={setFollowers} />
      <span className="text-sm text-white/75">
        <b className="text-white">{followers.toLocaleString()}</b>{" "}
        {followers === 1 ? "follower" : "followers"}
      </span>
    </div>
  );
}
