"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@bandcoin/ui/components/select";
import { Field } from "@bandcoin/ui/patterns/form-page";
import { LayerBadge } from "@bandcoin/ui/patterns/layer-icon";

import { useArtistLayers, type ArtistLayer } from "./selected-layer";

const NONE = "__none__";

/** No layer, or one of the artist's layers. Null = No layer. */
export function LayerSelect({
  layers,
  value,
  onChange,
  id,
}: {
  layers: ArtistLayer[];
  value: string | null | undefined;
  onChange: (id: string | null) => void;
  id?: string;
}) {
  return (
    <Select value={value ?? NONE} onValueChange={(next) => onChange(next === NONE ? null : next)}>
      <SelectTrigger id={id} className="w-full sm:max-w-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>No layer (regular map)</SelectItem>
        {layers.map((layer) => (
          <SelectItem key={layer.id} value={layer.id}>
            <span className="flex items-center gap-2">
              <LayerBadge icon={layer.icon} color={layer.color} size={18} />
              {layer.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * "Map layer" on the edit pin and edit hotspot forms: moves it to another layer. Hidden while
 * the artist has no layers (its value then stays as it was).
 */
export function LayerField({
  value,
  onChange,
  hint = "Fans see it only when they tick this layer on their map.",
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  hint?: string;
}) {
  const layers = useArtistLayers();
  const rows = layers.data ?? [];
  if (rows.length === 0) return null;
  return (
    <Field label="Map layer" htmlFor="map-layer" hint={hint}>
      <LayerSelect id="map-layer" layers={rows} value={value} onChange={onChange} />
    </Field>
  );
}

/**
 * Which layer a new pin or hotspot goes in: the one picked in the map's layer switcher
 * (it arrives as `?layer=`). Read-only; shown only when a layer is picked.
 */
export function LayerNote({
  layerId,
  what = "pin",
}: {
  layerId: string | null | undefined;
  what?: string;
}) {
  const layers = useArtistLayers();
  const layer = layerId ? layers.data?.find((entry) => entry.id === layerId) : undefined;
  if (!layer) return null;
  return (
    <div className="bg-surface-2 flex items-center gap-2 rounded-xl border px-3 py-2 text-xs">
      <LayerBadge icon={layer.icon} color={layer.color} size={18} />
      <span className="text-fg-muted">This {what} goes in layer</span>
      <span className="min-w-0 truncate font-semibold">{layer.name}</span>
    </div>
  );
}
