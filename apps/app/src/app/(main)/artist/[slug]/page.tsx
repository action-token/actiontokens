import type { Metadata } from "next";

import { ArtistView, artistMetadata } from "~/features/artist-page/artist-view";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return artistMetadata((await params).slug);
}

export default async function ArtistPage({ params }: Props) {
  return <ArtistView slug={(await params).slug} />;
}
