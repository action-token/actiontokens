import type { Metadata } from "next";

import { PageBody } from "@bandcoin/ui/patterns/page-header";

import { Composer } from "~/features/feed/composer";
import { FeedView } from "~/features/feed/feed-view";

export const metadata: Metadata = { title: "Feed" };

/** No page title: the "What's on your mind" box and the posts are the page. */
export default function FeedPage() {
  return (
    <PageBody className="mx-auto grid w-full max-w-2xl gap-4">
      <h1 className="sr-only">Feed</h1>
      <Composer />
      <FeedView />
    </PageBody>
  );
}
