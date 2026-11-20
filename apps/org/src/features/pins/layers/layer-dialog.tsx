"use client";

import { Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import toast from "react-hot-toast";

import { LAYER_COLORS, LAYER_ICONS } from "@actiontokens/ar-core/layers";
import { Button } from "@actiontokens/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@actiontokens/ui/components/dialog";
import { Input } from "@actiontokens/ui/components/input";
import { Label } from "@actiontokens/ui/components/label";
import { cn } from "@actiontokens/ui/lib/cn";
import { ConfirmDialog } from "@actiontokens/ui/patterns/confirm-dialog";
import { LayerBadge, LayerIcon } from "@actiontokens/ui/patterns/layer-icon";

import { api } from "~/trpc/react";

import { describeCounts } from "./layer-view";
import type { ArtistLayer } from "./selected-layer";

/**
 * New layer, or edit one: name, icon and colour. Editing can also delete it; its pins and
 * hotspots then become regular ones. Render it with a `key` per layer so the fields start from
 * that layer.
 */
export function LayerDialog({
  layer,
  onClose,
  onSaved,
  onDeleted,
}: {
  /** The layer being edited; absent for a new one. */
  layer?: ArtistLayer;
  onClose: () => void;
  onSaved: (layer: { id: string; name: string }) => void;
  onDeleted?: (id: string) => void;
}) {
  const [name, setName] = useState(layer?.name ?? "");
  const [icon, setIcon] = useState<string>(layer?.icon ?? "MapPin");
  const [color, setColor] = useState<string>(layer?.color ?? LAYER_COLORS[0]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const utils = api.useUtils();

  const fail = (error: { message: string }) => toast.error(error.message);
  const create = api.layers.create.useMutation({ onError: fail });
  const update = api.layers.update.useMutation({ onError: fail });
  const remove = api.layers.delete.useMutation({ onError: fail });
  const busy = create.isPending || update.isPending || remove.isPending;

  const save = async () => {
    const fields = { name: name.trim(), icon, color };
    if (fields.name.length < 2) return void toast.error("Give the layer a name");
    try {
      const saved = layer
        ? await update.mutateAsync({ ...fields, id: layer.id })
        : await create.mutateAsync(fields);
      await Promise.all([
        utils.layers.invalidate(),
        utils.pins.invalidate(),
        utils.hotspots.invalidate(),
      ]);
      toast.success(layer ? "Layer saved" : `Layer "${saved.name}" made. New drops go in it.`);
      onSaved(saved);
    } catch {
      // shown by onError
    }
  };

  const del = async () => {
    if (!layer) return;
    try {
      await remove.mutateAsync({ id: layer.id });
      await Promise.all([
        utils.layers.invalidate(),
        utils.pins.invalidate(),
        utils.hotspots.invalidate(),
      ]);
      setConfirmDelete(false);
      toast.success("Layer deleted. What was in it is on the regular map again.");
      onDeleted?.(layer.id);
    } catch {
      // shown by onError
    }
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <LayerBadge icon={icon} color={color} size={32} />
              {layer ? "Edit layer" : "New layer"}
            </DialogTitle>
            <DialogDescription>
              Fans can tick it on their map to see only this layer&apos;s pins and hotspots.
            </DialogDescription>
          </DialogHeader>

          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="layer-name">Name</Label>
              <Input
                id="layer-name"
                value={name}
                maxLength={32}
                placeholder="e.g. Venues"
                autoFocus
                onChange={(event) => setName(event.target.value)}
              />
            </div>

            <fieldset className="grid gap-1.5">
              <legend className="text-sm font-medium">Icon</legend>
              <div className="grid max-h-48 grid-cols-8 gap-1 overflow-y-auto">
                {LAYER_ICONS.map((name) => (
                  <button
                    key={name}
                    type="button"
                    title={name}
                    aria-label={name}
                    aria-pressed={icon === name}
                    onClick={() => setIcon(name)}
                    className={cn(
                      "flex aspect-square items-center justify-center rounded-lg transition-colors",
                      icon === name ? "text-white" : "hover:bg-surface-2 text-fg-muted",
                    )}
                    style={icon === name ? { backgroundColor: color } : undefined}
                  >
                    <LayerIcon icon={name} size={16} />
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="grid gap-1.5">
              <legend className="text-sm font-medium">Colour</legend>
              <div className="flex flex-wrap items-center gap-1.5">
                {LAYER_COLORS.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    aria-label={`Colour ${swatch}`}
                    aria-pressed={color.toLowerCase() === swatch.toLowerCase()}
                    onClick={() => setColor(swatch)}
                    className={cn(
                      "size-7 rounded-full border-2 border-white shadow-sm",
                      color.toLowerCase() === swatch.toLowerCase() &&
                        "ring-fg ring-2 ring-offset-1",
                    )}
                    style={{ backgroundColor: swatch }}
                  />
                ))}
                <label className="relative size-7 cursor-pointer" title="Pick any colour">
                  <input
                    type="color"
                    value={color}
                    onChange={(event) => setColor(event.target.value)}
                    className="absolute inset-0 size-full cursor-pointer opacity-0"
                    aria-label="Pick any colour"
                  />
                  <span className="flex size-7 items-center justify-center rounded-full border-2 border-dashed">
                    <Plus className="size-3.5" />
                  </span>
                </label>
              </div>
            </fieldset>

            <DialogFooter className="gap-2 sm:justify-between">
              {layer ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-danger"
                  disabled={busy}
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 /> Delete
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  {(create.isPending || update.isPending) && <Loader2 className="animate-spin" />}
                  {layer ? "Save" : "Make layer"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete "${layer?.name ?? ""}"?`}
        description={
          layer && layer.pins + layer.hotspots > 0
            ? `Its ${describeCounts(layer)} stay on the map as regular ones. Fans lose the layer.`
            : "It's empty. Fans lose the layer."
        }
        busy={remove.isPending}
        onConfirm={() => void del()}
      />
    </>
  );
}
