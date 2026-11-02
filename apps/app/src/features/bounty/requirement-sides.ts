export type RequirementSide = "music" | "general";

/** How many songs or steps a side shows before "more". */
export const MAX_VISIBLE = 5;
/** How long a side stays up before the card flips by itself. */
export const FLIP_AFTER_MS = 5000;

/** The card's sides, music first. A listening challenge only ever has its songs. */
export function requirementSides(bounty: {
  music?: { mode: string; tracks: unknown[] } | null;
  instructions: unknown[];
}): RequirementSide[] {
  const sides: RequirementSide[] = [];
  if ((bounty.music?.tracks.length ?? 0) > 0) sides.push("music");
  if (bounty.music?.mode !== "MUSIC_ONLY" && bounty.instructions.length > 0) sides.push("general");
  return sides;
}

/** The side `step` away from `index`, going round in either direction. */
export const turnSide = (index: number, step: number, count: number) =>
  count === 0 ? 0 : (index + step + count) % count;

/** The first few entries, or all of them, and how many "more" would add. */
export function visibleEntries<T>(entries: T[], expanded: boolean) {
  return {
    shown: expanded ? entries : entries.slice(0, MAX_VISIBLE),
    extra: Math.max(0, entries.length - MAX_VISIBLE),
  };
}
