import Link from "next/link";

/** An album in a carousel or grid: square cover, title, year and song count. */
export function AlbumCard({
  album,
}: {
  album: {
    slug: string;
    title: string;
    coverUrl: string;
    year: number;
    trackCount: number;
    artistName?: string;
  };
}) {
  return (
    <Link
      href={`/album/${album.slug}`}
      className="group hover:bg-surface-2 grid min-w-0 gap-2 rounded-xl p-2 transition-colors"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- covers come from many hosts */}
      <img
        src={album.coverUrl}
        alt=""
        loading="lazy"
        className="aspect-square w-full rounded-lg object-cover shadow-md transition-transform duration-250 group-hover:-translate-y-0.5"
      />
      <span className="display truncate text-lg">{album.title}</span>
      <span className="text-fg-muted -mt-1.5 truncate text-xs">
        {album.year} · {album.artistName ? `${album.artistName} · ` : ""}
        {album.trackCount} {album.trackCount === 1 ? "song" : "songs"}
      </span>
    </Link>
  );
}
