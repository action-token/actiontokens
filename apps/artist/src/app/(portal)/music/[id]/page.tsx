import { EditSongView } from "~/features/music/music-pages";

export const metadata = { title: "Edit song" };

export default async function EditSongPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditSongView itemId={id} />;
}
