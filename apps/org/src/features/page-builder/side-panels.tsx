"use client";

import { ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";

import { BLOCK_DEFS, type Block, type BlockWidth } from "@actiontokens/page/blocks";
import { Button } from "@actiontokens/ui/components/button";
import { Label } from "@actiontokens/ui/components/label";
import { Switch } from "@actiontokens/ui/components/switch";
import { cn } from "@actiontokens/ui/lib/cn";

import { Segmented } from "../embeds/embed-fields";

import { BlockField } from "./block-fields";
import { BLOCK_ICON } from "./block-picker";

const WIDTHS: { value: BlockWidth; label: string }[] = [
  { value: 1, label: "¼" },
  { value: 2, label: "½" },
  { value: 3, label: "¾" },
  { value: 4, label: "Full" },
];

/**
 * The blocks on the page, in order: drag one by its handle to move it (or use the arrows),
 * hide it with the eye, add one with the button. The cover always stays first.
 */
export function BlockListPanel({
  blocks,
  selectedUid,
  onSelect,
  onMove,
  onDrop,
  onToggleHidden,
  onAdd,
}: {
  blocks: Block[];
  selectedUid: string | null;
  onSelect: (uid: string) => void;
  onMove: (uid: string, direction: -1 | 1) => void;
  /** A dragged block dropped at this place in the list */
  onDrop: (uid: string, to: number) => void;
  onToggleHidden: (uid: string) => void;
  onAdd: () => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const end = () => {
    setDragging(null);
    setOver(null);
  };

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 p-4">
      <div>
        <h2 className="text-fg-muted mb-2 text-xs font-semibold tracking-wider uppercase">
          Your page
        </h2>
        <ol
          className="grid gap-1"
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null);
          }}
        >
          {blocks.map((block, index) => {
            const def = BLOCK_DEFS[block.type];
            const Icon = BLOCK_ICON[block.type];
            const selected = block.uid === selectedUid;
            const movable = !def.locked;
            return (
              <li
                key={block.uid}
                draggable={movable}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", block.uid);
                  setDragging(block.uid);
                }}
                onDragOver={(event) => {
                  if (!dragging || index === 0) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setOver(index);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (dragging && over !== null) {
                    // The line sits above the row it's over, so land just before that row
                    // (one less when coming from above, as the dragged row leaves the list first).
                    const from = blocks.findIndex((entry) => entry.uid === dragging);
                    onDrop(dragging, from < over ? over - 1 : over);
                  }
                  end();
                }}
                onDragEnd={end}
                className={cn(
                  "group relative flex items-center gap-0.5 rounded-lg border pr-1 transition-colors",
                  selected
                    ? "border-primary bg-primary/10"
                    : "hover:bg-surface-2 border-transparent",
                  dragging === block.uid && "opacity-40",
                  // The line where the dragged block will land.
                  over === index &&
                    dragging !== block.uid &&
                    "before:bg-primary before:absolute before:inset-x-1 before:-top-1 before:h-0.5 before:rounded-full",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "text-fg-faint grid w-5 shrink-0 place-items-center pl-1",
                    movable ? "cursor-grab active:cursor-grabbing" : "invisible",
                  )}
                >
                  <GripVertical className="size-4" />
                </span>
                <button
                  type="button"
                  onClick={() => onSelect(block.uid)}
                  aria-current={selected}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 py-2 pr-1 text-left text-sm",
                    block.hidden && "opacity-50",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate">{def.label}</span>
                </button>
                {movable && (
                  <>
                    {/* The arrows show on hover, on focus and for the selected block, so the eye always fits. */}
                    <span
                      className={cn(
                        "hidden items-center group-focus-within:flex group-hover:flex",
                        selected && "flex",
                      )}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Move ${def.label} up`}
                        disabled={index <= 1}
                        onClick={() => onMove(block.uid, -1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Move ${def.label} down`}
                        disabled={index >= blocks.length - 1}
                        onClick={() => onMove(block.uid, 1)}
                      >
                        <ArrowDown />
                      </Button>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={block.hidden ? `Show ${def.label}` : `Hide ${def.label}`}
                      onClick={() => onToggleHidden(block.uid)}
                    >
                      {block.hidden ? <EyeOff /> : <Eye />}
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ol>
        <p className="text-fg-faint mt-2 px-1 text-[11px]">
          Drag to reorder. Click a block for its settings, or + in the preview to add one after it.
        </p>
      </div>

      <Button type="button" variant="outline" onClick={onAdd}>
        <Plus /> Add a block
      </Button>
    </div>
  );
}

/** The selected block's settings (in the drop-down under the style bar). */
export function SettingsPanel({
  block,
  onPatch,
  onSetting,
  onRemove,
  onClose,
}: {
  block: Block;
  onPatch: (uid: string, patch: Partial<Pick<Block, "width" | "hidden">>) => void;
  onSetting: (uid: string, key: string, value: unknown) => void;
  onRemove: (uid: string) => void;
  onClose: () => void;
}) {
  const def = BLOCK_DEFS[block.type];
  const Icon = BLOCK_ICON[block.type];

  return (
    <div className="grid gap-5 p-4">
      <div className="flex items-start gap-3">
        <span className="bg-surface-2 grid size-9 shrink-0 place-items-center rounded-lg">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="display text-xl leading-tight">{def.label}</h2>
          <p className="text-fg-muted text-xs">{def.description}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Close block settings"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>

      {def.fields
        .filter((field) => field.key === "style")
        .map((field) => (
          <BlockField
            key={`${block.uid}-${field.key}`}
            field={field}
            value={block.settings[field.key]}
            onChange={(value) => onSetting(block.uid, field.key, value)}
          />
        ))}

      {!def.locked && (
        <div className="grid gap-1.5">
          <Label className="text-xs">Width</Label>
          <Segmented
            value={String(block.width)}
            onChange={(value) => onPatch(block.uid, { width: Number(value) as BlockWidth })}
            options={WIDTHS.map((width) => ({ id: String(width.value), label: width.label }))}
          />
          <p className="text-fg-muted text-xs">On a phone every block is full width.</p>
        </div>
      )}

      {!def.locked && (
        <div className="grid gap-1">
          <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
            <span>Visible on my page</span>
            <Switch
              checked={!block.hidden}
              onCheckedChange={(visible) => onPatch(block.uid, { hidden: !visible })}
            />
          </label>
          <p className="text-fg-muted text-xs">
            Fans only see this block once it has something to show.
          </p>
        </div>
      )}

      {def.fields
        .filter((field) => field.key !== "style")
        .map((field) => (
          <BlockField
            key={`${block.uid}-${field.key}`}
            field={field}
            value={block.settings[field.key]}
            onChange={(value) => onSetting(block.uid, field.key, value)}
          />
        ))}

      {def.source === "data" && (
        <p className="bg-surface-2 text-fg-muted rounded-lg p-3 text-xs">
          This block shows what you already have on Action Tokens, so there is nothing else to fill
          in.
        </p>
      )}

      {!def.locked && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-danger justify-self-start"
          onClick={() => onRemove(block.uid)}
        >
          <Trash2 /> Remove block
        </Button>
      )}
    </div>
  );
}
