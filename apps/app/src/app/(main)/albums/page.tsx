import type { Metadata } from "next";

import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";

import { AlbumsGrid } from "~/features/music/music-view";

export const metadata: Metadata = { title: "Albums" };

export default function AlbumsPage() {
  return (
    <PageBody wide className="grid gap-6">
      <PageHeader title="Albums" note="*full releases, newest first*" />
      <AlbumsGrid />
    </PageBody>
  );
}
