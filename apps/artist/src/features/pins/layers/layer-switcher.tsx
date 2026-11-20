"use client";

import { Check, ChevronDown, Eye, EyeOff, Layers, Pencil, Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@actiontokens/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@actiontokens/ui/components/popover";
import { cn } from "@actiontokens/ui/lib/cn";
import { LayerBadge } from "@actiontokens/ui/patterns/layer-icon";

import { LayerDialog } from "./layer-dialog";
import { describeCounts, REGULAR } from "./layer-view";
import { useArtistLayers, useSelectedLayer, type ArtistLayer } from "./selected-layer";

/**
 * The Pins map's layer switcher: No layer (the regular map) or one of your layers. The layer
 * picked is the one you work in: new pins and hotspots go in it. The eye on a row shows that
 * layer's drops too. Each layer can be edited here, and New layer makes one and picks it.
 */
export function LayerSwitcher({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  // undefined: no dialog; null: New layer; a layer: editing it.
  const [dialog, setDialog] = useState<ArtistLayer | null | undefined>(undefined);
  const selected = useSelectedLayer((state) => state.id);
  const select = useSelectedLayer((state) => state.set);
  const shown = useSelectedLayer((state) => state.shown);
  const toggleShown = useSelectedLayer((state) => state.toggleShown);
  const list = useArtistLayers();
  const rows = list.data ?? [];
  const current = rows.find((layer) => layer.id === selected) ?? null;
  // Others on with their eye (not counting the one you're in).
  const alsoShown = shown.filter((key) => key !== (selected ?? REGULAR)).length;

  /** The eye: show this layer's drops too (always on for the one you're in). */
  const eye = (key: string, name: string) => {
    const inIt = key === (selected ?? REGULAR);
    const on = inIt || shown.includes(key);
    return (
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        disabled={inIt}
        aria-pressed={on}
        aria-label={
          inIt ? `${name}: you're in this layer` : on ? `Hide ${name}` : `Show ${name} too`
        }
        title={inIt ? "You're in this layer: always shown" : on ? "Hide" : "Show on the map too"}
        className={cn(
          "shrink-0",
          on ? "text-primary-text" : "text-fg-muted",
          inIt && "opacity-100",
        )}
        onClick={() => toggleShown(key)}
      >
        {on ? <Eye /> : <EyeOff />}
      </Button>
    );
  };

  const pick = (id: string | null) => {
    select(id);
    setOpen(false);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className={cn("shadow-sm", className, current && "border-2")}
            style={current ? { borderColor: current.color } : undefined}
            aria-label={current ? `Map layer: ${current.name}` : "Map layer: none"}
          >
            {current ? (
              <LayerBadge icon={current.icon} color={current.color} size={20} />
            ) : (
              <Layers />
            )}
            <span className="hidden max-w-32 truncate sm:inline">
              {current ? current.name : "No layer"}
            </span>
            {alsoShown > 0 && (
              <span
                className="bg-primary text-primary-foreground rounded-full px-1.5 text-[10px] leading-4 font-semibold"
                aria-label={`and ${alsoShown} more shown`}
              >
                +{alsoShown}
              </span>
            )}
            <ChevronDown className="opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[min(92vw,340px)] p-1.5">
          <p className="text-fg-muted px-2 pt-1 pb-1.5 text-[11px] leading-snug">
            Pick the layer you work in: new drops go there. Turn on{" "}
            <Eye className="inline size-3" aria-hidden /> to see other layers too.
          </p>
          <div className="flex items-center gap-1">
            {eye(REGULAR, "the regular map")}
            <button
              type="button"
              className="hover:bg-surface-2 flex min-w-0 flex-1 items-center gap-3 rounded-xl p-2 text-left"
              onClick={() => pick(null)}
            >
              <span className="bg-surface-2 flex size-[26px] shrink-0 items-center justify-center rounded-full">
                <Layers className="size-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">No layer</span>
                <span className="text-fg-muted block text-xs">Your regular map</span>
              </span>
              {selected === null && <Check className="size-4" />}
            </button>
          </div>

          {list.isPending ? (
            <p className="text-fg-muted p-3 text-sm">Loading layers…</p>
          ) : list.isError ? (
            <p className="text-danger p-3 text-sm">Couldn&apos;t load your layers.</p>
          ) : rows.length === 0 ? (
            <p className="text-fg-muted p-3 text-xs">
              Layers group drops by kind (Venues, Merch, Hospitals…). Fans see a layer only when
              they tick it on their map.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {rows.map((layer) => (
                <li key={layer.id} className="flex items-center gap-1">
                  {eye(layer.id, layer.name)}
                  <button
                    type="button"
                    className="hover:bg-surface-2 flex min-w-0 flex-1 items-center gap-3 rounded-xl p-2 text-left"
                    onClick={() => pick(layer.id)}
                  >
                    <LayerBadge icon={layer.icon} color={layer.color} size={26} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{layer.name}</span>
                      <span className="text-fg-muted block text-xs">
                        {layer.pins + layer.hotspots > 0 ? describeCounts(layer) : "Empty"}
                      </span>
                    </span>
                    {selected === layer.id && <Check className="size-4" />}
                  </button>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Edit ${layer.name}`}
                    onClick={() => {
                      setOpen(false);
                      setDialog(layer);
                    }}
                  >
                    <Pencil />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            className="hover:bg-surface-2 mt-1 flex w-full items-center gap-2 rounded-xl border-t px-3 pt-2.5 pb-2 text-left text-sm font-medium"
            onClick={() => {
              setOpen(false);
              setDialog(null);
            }}
          >
            <Plus className="size-4" /> New layer
          </button>
        </PopoverContent>
      </Popover>

      {dialog !== undefined && (
        <LayerDialog
          key={dialog?.id ?? "new"}
          layer={dialog ?? undefined}
          onClose={() => setDialog(undefined)}
          onSaved={(saved) => {
            setDialog(undefined);
            // A new layer is picked straight away, so what's made next goes in it.
            if (!dialog) select(saved.id);
          }}
          onDeleted={(id) => {
            setDialog(undefined);
            if (selected === id) select(null);
            if (shown.includes(id)) toggleShown(id);
          }}
        />
      )}
    </>
  );
}
