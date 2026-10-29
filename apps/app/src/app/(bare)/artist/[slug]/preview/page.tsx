import type { Metadata } from "next";

import { PreviewFrame } from "~/features/artist-page/preview-frame";

export const metadata: Metadata = {
  title: "Page preview",
  robots: { index: false, follow: false },
};

/** The artist page builder's live preview, framed by the artist portal (see PreviewFrame). */
export default async function ArtistPreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  return <PreviewFrame slug={(await params).slug} />;
}
