import type { QueueTrack } from "../player/player-store";

/**
 * Whether the Now playing panel offers Buy: only while the listener hears the 30 s preview
 * (they don't have the full song) and the song has a price. While the playback info is still
 * loading it stays hidden, so the button doesn't flash up and vanish for someone who owns it.
 */
export function showSidebarBuy(
  track: Pick<QueueTrack, "price">,
  playback: { full: boolean } | undefined,
): boolean {
  return Boolean(playback && !playback.full && track.price);
}
