/**
 * Which pages get the right panel: Home, and only while a song is loaded in
 * the player (it shows what's playing and up next). Everywhere else, and Home
 * with nothing playing, uses the full width.
 */
export const hasContextPanel = (pathname: string, hasTrack: boolean) =>
  pathname === "/" && hasTrack;
