import { ArtistDetailView } from "~/features/admin/artists/artist-detail-view";

export const metadata = { title: "Organization" };

export default async function AdminArtistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ArtistDetailView organizationId={id} />;
}
