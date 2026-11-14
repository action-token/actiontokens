/**
 * Map layers (plan 42): an artist makes their own (Venue, Merch, Hospital…); with one picked on
 * the Pins map, the pins and hotspots they make go in it. Fans see regular (layer-less) drops
 * until they tick a layer. Pure data: no React.
 *
 * A layer's icon is one of these lucide icon names. `packages/ui/src/patterns/layer-icon.tsx`
 * draws them, and a test checks that every name there has a drawing.
 */
export const LAYER_ICONS = [
  "Hospital",
  "Stethoscope",
  "HeartPulse",
  "Pill",
  "School",
  "GraduationCap",
  "BookOpen",
  "Trophy",
  "Volleyball",
  "Dumbbell",
  "Bike",
  "Utensils",
  "Coffee",
  "Beer",
  "ShoppingBag",
  "Store",
  "Landmark",
  "Church",
  "Trees",
  "Tent",
  "Waves",
  "Music",
  "Ticket",
  "Palette",
  "Camera",
  "Bus",
  "TrainFront",
  "SquareParking",
  "Fuel",
  "Hotel",
  "Building2",
  "Baby",
  "Dog",
  "Siren",
  "ShieldPlus",
  "Flag",
  "Star",
  "MapPin",
  "Guitar",
  "Mic",
  "Headphones",
  "Disc3",
  "Drum",
  "Piano",
  "Radio",
  "Speaker",
] as const;
export type LayerIcon = (typeof LAYER_ICONS)[number];

/** Colours offered in the layer dialog (any #rrggbb is allowed). */
export const LAYER_COLORS = [
  "#E5484D",
  "#F76B15",
  "#FFC53D",
  "#46A758",
  "#12A594",
  "#0090FF",
  "#3E63DD",
  "#8E4EC6",
  "#D6409F",
  "#8D8D8D",
] as const;

/** The most layers one artist can have. */
export const MAX_LAYERS_PER_ARTIST = 30;

/** What a fan client gets about a pin's layer. */
export type PinLayerRef = { id: string; name: string; icon: string; color: string };

/** A layer on the fan map: its artist's name and logo, and how many live drops it has nearby. */
export type MapLayerChip = PinLayerRef & {
  artist: string;
  artistImage: string | null;
  pinCount: number;
};

/**
 * The names a fan sees in the Layers sheet: a name two chips share gets its artist added
 * ("Hospital · Acme"); otherwise it's just the name.
 */
export function layerLabels(chips: readonly MapLayerChip[]): Map<string, string> {
  const uses = new Map<string, number>();
  for (const chip of chips) {
    const key = chip.name.trim().toLowerCase();
    uses.set(key, (uses.get(key) ?? 0) + 1);
  }
  return new Map(
    chips.map((chip) => [
      chip.id,
      (uses.get(chip.name.trim().toLowerCase()) ?? 0) > 1
        ? `${chip.name} · ${chip.artist}`
        : chip.name,
    ]),
  );
}

/**
 * Whether a pin shows with these ticks: a regular pin when "Regular drops" is on, a layer pin
 * when its layer is ticked.
 */
export function inLayers(
  pin: { layer?: { id: string } | null },
  regular: boolean,
  ticked: ReadonlySet<string>,
): boolean {
  return pin.layer ? ticked.has(pin.layer.id) : regular;
}
