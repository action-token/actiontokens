const MAX_MUSIC_IMAGES = 3;

/**
 * What goes behind a bounty card: up to 3 music covers side by side when it has
 * them (as on the old Action Tokens), otherwise the creator's image.
 */
export function cardImages(bounty: {
  musicArt?: { albumArtUrl: string | null }[];
  artist: { avatarUrl: string | null };
}): string[] {
  // `?? []`: a page kept across a reload can still hold bounty rows from before the field existed
  const covers = (bounty.musicArt ?? []).flatMap((track) =>
    track.albumArtUrl ? [track.albumArtUrl] : [],
  );
  if (covers.length > 0) return covers.slice(0, MAX_MUSIC_IMAGES);
  return bounty.artist.avatarUrl ? [bounty.artist.avatarUrl] : [];
}
