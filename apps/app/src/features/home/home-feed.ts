import { useEffect } from "react";

import type { RouterOutputs } from "~/trpc/react";

import { type NotchNote, setNotchFeed } from "../notch/notch-feed";

type Home = RouterOutputs["catalog"]["home"];

/** What the notch shows, newest first: real drops and running bounties from the home data. */
function notesFrom(home: Home): NotchNote[] {
  const drops = home.drops.slice(0, 4).map((drop): NotchNote => ({
    key: `d-${drop.id}`,
    href: `/item/${drop.slug}`,
    icon: "drop",
    title: `New drop · ${drop.artistName}`,
    text: drop.title,
  }));
  const bounties = home.bounties.slice(0, 3).map((bounty): NotchNote => ({
    key: `b-${bounty.id}`,
    href: `/bounty/${bounty.id}`,
    icon: "bounty",
    title: `Bounty live · ${bounty.prize.amount} ${bounty.prize.code}`,
    text: bounty.title,
  }));
  // alternate, so the feed doesn't show four drops in a row
  const out: NotchNote[] = [];
  for (let i = 0; i < Math.max(drops.length, bounties.length); i++) {
    if (drops[i]) out.push(drops[i]!);
    if (bounties[i]) out.push(bounties[i]!);
  }
  return out;
}

/** While the home page is open, the notch cycles through its new drops and running bounties. */
export function useHomeFeed(home: Home) {
  useEffect(() => {
    setNotchFeed(notesFrom(home));
    return () => setNotchFeed([]);
  }, [home]);
}
