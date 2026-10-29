"use client";

import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Crown,
  Disc3,
  Eye,
  EyeOff,
  FileText,
  Link2,
  Music2,
  Package,
  Plus,
  Trash2,
  User,
  UsersRound,
  Video,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import {
  BLOCK_DEFS,
  BLOCK_LIST,
  type Block,
  type BlockCategory,
  type BlockType,
  type BlockWidth,
} from "@bandcoin/page/blocks";
import { DENSITIES, FONT_PAIRS, RADII, type PageTheme } from "@bandcoin/page/theme";
import { Button } from "@bandcoin/ui/components/button";
import { Label } from "@bandcoin/ui/components/label";
import { Switch } from "@bandcoin/ui/components/switch";
import { cn } from "@bandcoin/ui/lib/cn";

import { Segmented } from "../embeds/embed-fields";

import { BlockField } from "./block-fields";

const ICON: Record<BlockType, LucideIcon> = {
  cover: User,
  about: FileText,
  music: Music2,
  releases: Disc3,
  "nft-gallery": Package,
  membership: Crown,
  tour: CalendarDays,
  links: Link2,
  videos: Video,
  "band-members": UsersRound,
};

const CATEGORY: Record<BlockCategory, string> = {
  essentials: "Essentials",
  music: "Music",
  sell: "Sell",
  connect: "Connect",
};
const WIDTHS: { value: BlockWidth; label: string }[] = [
  { value: 1, label: "¼" },
  { value: 2, label: "½" },
  { value: 3, label: "¾" },
  { value: 4, label: "Full" },
];
const ACCENTS = ["#dbdc2c", "#39ff88", "#ff5d73", "#1d4ed8", "#ea580c", "#7c3aed", "#0f172a"];

/** The blocks on the page, in order, with ways to reorder, hide and add them. */
export function BlockListPanel({
  blocks,
  selectedUid,
  onSelect,
  onMove,
  onToggleHidden,
  onAdd,
}: {
  blocks: Block[];
  selectedUid: string | null;
  onSelect: (uid: string) => void;
  onMove: (uid: string, direction: -1 | 1) => void;
  onToggleHidden: (uid: string) => void;
  onAdd: (type: BlockType) => void;
}) {
  const [adding, setAdding] = useState(false);
  const addable = BLOCK_LIST.filter((def) => !def.locked);

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 p-4">
      <div>
        <h2 className="text-fg-muted mb-2 text-xs font-semibold tracking-wider uppercase">
          Your page
        </h2>
        <ol className="grid gap-1">
          {blocks.map((block, index) => {
            const def = BLOCK_DEFS[block.type];
            const Icon = ICON[block.type];
            const selected = block.uid === selectedUid;
            return (
              <li
                key={block.uid}
                className={cn(
                  "flex items-center gap-1 rounded-lg border pr-1 transition-colors",
                  selected
                    ? "border-primary bg-primary/10"
                    : "hover:bg-surface-2 border-transparent",
                )}
              >
                <button
                  type="button"
                  onClick={() => onSelect(block.uid)}
                  aria-current={selected}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm",
                    block.hidden && "opacity-50",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate">{def.label}</span>
                </button>
                {!def.locked && (
                  <>
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
      </div>

      <div className="grid gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setAdding((value) => !value)}
          aria-expanded={adding}
        >
          <Plus /> Add a block
        </Button>
        {adding && (
          <div className="grid gap-3 rounded-xl border p-2">
            {(Object.keys(CATEGORY) as BlockCategory[]).map((category) => {
              const defs = addable.filter((def) => def.category === category);
              if (defs.length === 0) return null;
              return (
                <div key={category} className="grid gap-1">
                  <span className="text-fg-faint px-1 text-[11px] font-semibold tracking-wider uppercase">
                    {CATEGORY[category]}
                  </span>
                  {defs.map((def) => {
                    const Icon = ICON[def.type];
                    return (
                      <button
                        key={def.type}
                        type="button"
                        className="hover:bg-surface-2 flex items-start gap-2 rounded-lg px-2 py-1.5 text-left"
                        onClick={() => {
                          onAdd(def.type);
                          setAdding(false);
                        }}
                      >
                        <Icon className="mt-0.5 size-4 shrink-0" />
                        <span className="grid text-sm">
                          <b className="font-medium">{def.label}</b>
                          <span className="text-fg-muted text-xs">{def.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** The selected block's settings, or the page theme when nothing is selected. */
export function SettingsPanel({
  block,
  theme,
  onTheme,
  onPatch,
  onSetting,
  onRemove,
}: {
  block: Block | null;
  theme: PageTheme;
  onTheme: (theme: PageTheme) => void;
  onPatch: (uid: string, patch: Partial<Pick<Block, "width" | "hidden" | "hideWhenEmpty">>) => void;
  onSetting: (uid: string, key: string, value: unknown) => void;
  onRemove: (uid: string) => void;
}) {
  if (!block) return <ThemePanel theme={theme} onTheme={onTheme} />;
  const def = BLOCK_DEFS[block.type];

  return (
    <div className="grid gap-5 p-4">
      <div>
        <h2 className="display text-base">{def.label}</h2>
        <p className="text-fg-muted text-xs">{def.description}</p>
      </div>

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
        <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
          <span>Visible on my page</span>
          <Switch
            checked={!block.hidden}
            onCheckedChange={(visible) => onPatch(block.uid, { hidden: !visible })}
          />
        </label>
      )}

      {def.source === "data" && !def.locked && (
        <label className="flex cursor-pointer items-start justify-between gap-3 text-sm">
          <span>
            Hide when empty
            <span className="text-fg-muted block text-xs">
              Skip this block until it has something to show. Otherwise visitors see a quiet
              &ldquo;nothing yet&rdquo; line.
            </span>
          </span>
          <Switch
            checked={block.hideWhenEmpty}
            onCheckedChange={(hide) => onPatch(block.uid, { hideWhenEmpty: hide })}
          />
        </label>
      )}

      {def.fields.map((field) => (
        <BlockField
          key={`${block.uid}-${field.key}`}
          field={field}
          value={block.settings[field.key]}
          onChange={(value) => onSetting(block.uid, field.key, value)}
        />
      ))}

      {def.source === "data" && (
        <p className="bg-surface-2 text-fg-muted rounded-lg p-3 text-xs">
          This block shows what you already have on Bandcoin, so there is nothing else to fill in.
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

function ThemePanel({ theme, onTheme }: { theme: PageTheme; onTheme: (theme: PageTheme) => void }) {
  const set = <K extends keyof PageTheme>(key: K, value: PageTheme[K]) =>
    onTheme({ ...theme, [key]: value });
  return (
    <div className="grid gap-5 p-4">
      <div>
        <h2 className="display text-base">Page style</h2>
        <p className="text-fg-muted text-xs">
          Select a block to edit it, or change how the whole page looks.
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Accent colour</Label>
        <div className="flex flex-wrap items-center gap-2">
          {ACCENTS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Accent ${color}`}
              onClick={() => set("accent", color)}
              className={cn(
                "size-7 rounded-full border-2",
                theme.accent.toLowerCase() === color ? "border-foreground" : "border-transparent",
              )}
              style={{ background: color }}
            />
          ))}
          <input
            type="color"
            aria-label="Pick any colour"
            value={theme.accent}
            onChange={(event) => set("accent", event.target.value)}
            className="h-8 w-10 cursor-pointer rounded border bg-transparent"
          />
        </div>
        <p className="text-fg-muted text-xs">Buttons, highlights and popular tiers.</p>
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Font</Label>
        <Segmented
          value={theme.fontPair}
          onChange={(value) => set("fontPair", value)}
          options={FONT_PAIRS.map((entry) => ({ id: entry.value, label: entry.label }))}
        />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Corners</Label>
        <Segmented
          value={theme.radius}
          onChange={(value) => set("radius", value)}
          options={RADII.map((entry) => ({ id: entry.value, label: entry.label }))}
        />
      </div>
      <div className="grid gap-1.5">
        <Label className="text-xs">Spacing</Label>
        <Segmented
          value={theme.density}
          onChange={(value) => set("density", value)}
          options={DENSITIES.map((entry) => ({ id: entry.value, label: entry.label }))}
        />
      </div>
    </div>
  );
}
