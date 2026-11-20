import { NewSongView } from "~/features/music/music-pages";

export const metadata = { title: "New song" };

export default async function NewSongPage({
  searchParams,
}: {
  searchParams: Promise<{ album?: string }>;
}) {
  const { album } = await searchParams;
  return <NewSongView albumId={album} />;
}
