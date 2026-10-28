import type { Metadata } from "next";

import { PageBody, PageHeader } from "@bandcoin/ui/patterns/page-header";

import { PlaylistsView } from "~/features/playlist/playlists-view";

export const metadata: Metadata = { title: "Playlists" };

export default function PlaylistsPage() {
  return (
    <PageBody wide className="grid gap-6">
      <PageHeader title="Playlists" note="*any song goes; the ones you own play in full*" />
      <PlaylistsView />
    </PageBody>
  );
}
