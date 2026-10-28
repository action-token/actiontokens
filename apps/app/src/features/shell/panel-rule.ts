/**
 * Which pages get the right panel. Home always does (bounties, artists).
 * Music only while something is in the player, so the panel has a song to
 * show; everywhere else uses the full width.
 */
export const hasContextPanel = (pathname: string, hasTrack: boolean) =>
  pathname === "/" || (pathname.startsWith("/music") && hasTrack);
