export type ContextPanelKind = "music" | "bounties";

/**
 * What the right panel shows: the bounties list has its own; every other page has what's playing
 * once a song is loaded (the rail starts closed, so a page only gives up a slim strip). With
 * nothing playing, a page uses the full width. The home page never has one: what's playing
 * lives in the notch there.
 */
export function contextPanelFor(pathname: string, hasTrack: boolean): ContextPanelKind | null {
  if (pathname === "/") return null;
  if (pathname === "/bounties") return "bounties";
  return hasTrack ? "music" : null;
}
