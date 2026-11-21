import type { Metadata } from "next";
import { Suspense } from "react";

import { PageBody, PageHeader } from "@actiontokens/ui/patterns/page-header";

import { SongsHero } from "~/features/songs/songs-hero";
import { SongsView } from "~/features/songs/songs-view";

export const metadata: Metadata = {
  title: "Songs",
  description:
    "Every song on Action Tokens: what's trending this week, search, filter by price, play.",
};

export default function SongsPage() {
  return (
    <>
      <SongsHero />
      <PageBody wide className="grid gap-6">
        <PageHeader title="Songs" note="*everything on Action Tokens, trending first*" />
        <Suspense>
          <SongsView />
        </Suspense>
      </PageBody>
    </>
  );
}
