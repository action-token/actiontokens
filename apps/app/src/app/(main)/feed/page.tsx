import type { Metadata } from "next";

import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";

import { FeedView } from "~/features/feed/feed-view";

export const metadata: Metadata = { title: "Feed" };

export default function FeedPage() {
  return (
    <PageBody className="mx-auto grid w-full max-w-2xl gap-6">
      <PageHeader title="Feed" note="*news from the artists you follow*" />
      <FeedView />
    </PageBody>
  );
}
