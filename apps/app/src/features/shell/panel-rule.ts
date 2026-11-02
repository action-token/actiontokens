export type ContextPanelKind = "music" | "bounties";

/**
 * What the right panel shows: the bounties list has its own, Home has what's
 * playing while a song is loaded. Everywhere else, and Home with nothing
 * playing, uses the full width.
 */
export function contextPanelFor(pathname: string, hasTrack: boolean): ContextPanelKind | null {
  if (pathname === "/bounties") return "bounties";
  return pathname === "/" && hasTrack ? "music" : null;
}
