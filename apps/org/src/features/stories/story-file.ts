/** Live stories an artist can have at once (the server enforces the same limit). */
export const MAX_LIVE = 10;

/** A story is one photo or one short video. */
export const MAX_VIDEO_SECONDS = 30;

export type StoryKind = "IMAGE" | "VIDEO";

/** What kind of story a picked file makes, or null when it is neither a photo nor a video. */
export function storyKindOf(file: { type: string }): StoryKind | null {
  if (file.type.startsWith("image/")) return "IMAGE";
  if (file.type.startsWith("video/")) return "VIDEO";
  return null;
}

/** Why a video is too long for a story, or null when it fits. */
export function videoProblem(seconds: number): string | null {
  return Number.isFinite(seconds) && seconds > MAX_VIDEO_SECONDS
    ? `Stories can be up to ${MAX_VIDEO_SECONDS} seconds. This clip is ${Math.ceil(seconds)}.`
    : null;
}

/** "5h 20m left" / "12m left": how long a story has, from now. */
export function timeLeft(expiresAt: Date | string, now = Date.now()) {
  const minutes = Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 60_000));
  if (minutes < 1) return "Ending";
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m left` : `${minutes}m left`;
}

/** How much of its 24 hours a story has left, 0 to 1 (for the bar on its card). */
export function shareLeft(expiresAt: Date | string, now = Date.now()) {
  const left = new Date(expiresAt).getTime() - now;
  return Math.min(1, Math.max(0, left / (24 * 60 * 60_000)));
}

/** The length of a clip, read from the picked file before anything is uploaded (NaN if it can't be read). */
export const clipSeconds = (url: string) =>
  new Promise<number>((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => resolve(video.duration);
    video.onerror = () => resolve(Number.NaN);
    video.src = url;
  });
