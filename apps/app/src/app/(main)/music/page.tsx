import type { Metadata } from "next";
import { Suspense } from "react";

import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";

import { MusicView } from "~/features/music/music-view";

export const metadata: Metadata = {
  title: "Music",
  description: "New songs and every track on Bandcoin. Own a song to hear it in full.",
};

export default function MusicPage() {
  return (
    <PageBody wide className="grid gap-6">
      <PageHeader title="Music" note="*hear 30 seconds of anything, own it to hear it all*" />
      <Suspense>
        <MusicView />
      </Suspense>
    </PageBody>
  );
}
