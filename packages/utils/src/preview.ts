/** Fans who don't own a song hear this many seconds of it. */
export const PREVIEW_SECONDS = 30;

/** The latest second the preview can start at, so it still has its full length. */
export const latestPreviewStart = (durationSec: number) =>
  Math.max(0, Math.floor(durationSec) - PREVIEW_SECONDS);

/** "3:05", or "1:02:09" for long recordings. */
export function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
