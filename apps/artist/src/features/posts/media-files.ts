export type PostMediaType = "IMAGE" | "VIDEO" | "AUDIO";

/** What a picked file is, from its type or else its extension; null for anything a post can't hold. */
export function mediaTypeOf(file: { type: string; name: string }): PostMediaType | null {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|avif)$/.test(name)) return "IMAGE";
  if (file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/.test(name)) return "VIDEO";
  if (file.type.startsWith("audio/") || /\.(mp3|wav|ogg|flac|m4a|aac)$/.test(name)) return "AUDIO";
  return null;
}

/** "02 night_drive-demo.mp3" → "02 night drive-demo": a song's name from its file. */
export const songTitle = (fileName: string) =>
  fileName
    .replace(/\.[a-z0-9]{2,5}$/i, "")
    .replace(/_+/g, " ")
    .trim()
    .slice(0, 120);

/**
 * Which of the picked files go up: those a post can hold, in the order picked,
 * up to the room left. The rest are counted so the artist is told.
 */
export function planUploads<T extends { type: string; name: string }>(files: T[], room: number) {
  const usable = files.flatMap((file) => {
    const type = mediaTypeOf(file);
    return type ? [{ file, type }] : [];
  });
  return {
    take: usable.slice(0, Math.max(0, room)),
    unsupported: files.length - usable.length,
    overLimit: Math.max(0, usable.length - Math.max(0, room)),
  };
}
