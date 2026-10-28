import type { Metadata } from "next";

import { PlaylistView } from "~/features/playlist/playlist-view";

export const metadata: Metadata = { title: "Playlist" };

export default async function PlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  return <PlaylistView playlistId={(await params).id} />;
}
