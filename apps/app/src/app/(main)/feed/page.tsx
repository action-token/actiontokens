import type { Metadata } from "next";

import { PageBody } from "@bandcoin/ui/patterns/page-header";

import { Composer } from "~/features/feed/composer";
import {
  ArtistsToFollow,
  DiscoverBand,
  NewMusic,
  TopBounties,
  UpcomingEvents,
} from "~/features/feed/feed-sections";
import { FeedView } from "~/features/feed/feed-view";
import { PeopleRow } from "~/features/feed/people-row";

export const metadata: Metadata = { title: "Feed" };

/**
 * No page title. The artists row across the top, then three columns on a wide
 * screen: events and artists to follow on the left, the posts in the middle,
 * new music and top bounties on the right. Narrower screens put the same
 * cards above the posts instead.
 */
export default function FeedPage() {
  return (
    <PageBody wide className="grid gap-5">
      <h1 className="sr-only">Feed</h1>
      <PeopleRow />
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,38rem)_minmax(0,1fr)] xl:gap-6">
        <aside className="sticky top-6 hidden gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)]">
          <UpcomingEvents />
          <ArtistsToFollow />
        </aside>
        <div className="mx-auto grid w-full max-w-3xl gap-4 xl:max-w-none">
          <DiscoverBand />
          <Composer />
          <FeedView />
        </div>
        <aside className="sticky top-6 hidden gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)]">
          <NewMusic />
          <TopBounties />
        </aside>
      </div>
    </PageBody>
  );
}
