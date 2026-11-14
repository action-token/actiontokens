/** The key for the regular map (no layer) in the switcher's eyes. */
export const REGULAR = "none";

/**
 * True when a pin or hotspot with this `layerId` belongs on the map: it's in the layer the artist
 * is in (`selected`), or in one switched on with its eye (`shown`).
 */
export function onSelectedLayer(
  layerId: string | null | undefined,
  selected: string | null,
  shown: readonly string[] = [],
) {
  const id = layerId ?? null;
  return id === selected || shown.includes(id ?? REGULAR);
}

/** "3 pins and 1 hotspot". */
export function describeCounts(layer: { pins: number; hotspots: number }) {
  const parts = (
    [
      [layer.pins, "pin"],
      [layer.hotspots, "hotspot"],
    ] as const
  )
    .filter(([count]) => count > 0)
    .map(([count, word]) => `${count} ${word}${count === 1 ? "" : "s"}`);
  if (parts.length <= 1) return parts[0] ?? "nothing";
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}
