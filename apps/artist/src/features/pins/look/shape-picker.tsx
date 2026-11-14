"use client";

import { Check, ChevronsUpDown, Pencil, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { BUILTIN_SHAPE_IDS, BUILTIN_SHAPES } from "@bandcoin/ar-core/pin-look";
import { Popover, PopoverContent, PopoverTrigger } from "@bandcoin/ui/components/popover";
import { cn } from "@bandcoin/ui/lib/cn";
import { PinGlyph } from "@bandcoin/ui/patterns/pin-glyph";

export type ShapeOption = { id: string; name: string; path: string; own: boolean };

const BUILTINS: ShapeOption[] = BUILTIN_SHAPE_IDS.map((id) => ({
  id,
  name: BUILTIN_SHAPES[id].name,
  path: BUILTIN_SHAPES[id].path,
  own: false,
}));

/** One shape as a tile: the shape with the pin's picture and colour in it, and its name. */
function ShapeTile({
  shape,
  selected,
  color,
  imageUrl,
  onPick,
  onEdit,
}: {
  shape: ShapeOption;
  selected: boolean;
  color: string | null;
  imageUrl: string | null;
  onPick: () => void;
  onEdit?: () => void;
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={onPick}
        className={cn(
          "flex w-full flex-col items-center gap-1.5 rounded-xl border-2 px-1 py-2 transition-colors",
          selected ? "border-primary bg-primary/10" : "hover:bg-surface-2 border-transparent",
        )}
      >
        <PinGlyph
          path={shape.path}
          size={40}
          color={color}
          defaultColor="var(--color-surface-2)"
          imageUrl={imageUrl}
          ringColor={selected ? "var(--color-primary)" : "var(--color-fg-faint)"}
          ringWidth={2}
        />
        <span className="line-clamp-2 min-h-8 w-full text-center text-[11px] leading-4 break-words">
          {shape.name}
        </span>
      </button>
      {selected && (
        <span className="bg-primary text-primary-foreground absolute top-1 right-1 flex size-4 items-center justify-center rounded-full">
          <Check className="size-3" strokeWidth={3} />
        </span>
      )}
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${shape.name} in Pin Studio`}
          title="Edit in Pin Studio"
          className="bg-surface text-fg-muted hover:text-fg absolute top-1 left-1 hidden size-5 items-center justify-center rounded-full border group-hover:flex focus-visible:flex"
        >
          <Pencil className="size-3" />
        </button>
      )}
    </div>
  );
}

/**
 * Choose a pin's shape. Shows the chosen one; opens a panel with search, the artist's own shapes
 * (to edit, or add a new one) and the built-in ones, each drawn with the pin's picture and colour.
 * Own shapes and "New shape" appear once `own`, `onNew` and `onEdit` are passed (Pin Studio).
 */
export function ShapePicker({
  value,
  own = [],
  onChange,
  onNew,
  onEdit,
  color,
  imageUrl,
}: {
  value: string;
  /** The artist's saved shapes. */
  own?: { id: string; name: string; path: string }[];
  onChange: (id: string) => void;
  onNew?: () => void;
  onEdit?: (id: string) => void;
  color: string | null;
  imageUrl: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const yours = useMemo<ShapeOption[]>(() => own.map((shape) => ({ ...shape, own: true })), [own]);
  const current = [...yours, ...BUILTINS].find((shape) => shape.id === value) ?? BUILTINS[0]!;
  const matches = (shape: ShapeOption) =>
    !query.trim() || shape.name.toLowerCase().includes(query.trim().toLowerCase());
  const mine = yours.filter(matches);
  const builtIn = BUILTINS.filter(matches);
  const close = () => {
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Pin shape: ${current.name}. Change`}
          className="hover:border-line-bright bg-surface flex h-14 w-full items-center gap-3 rounded-xl border px-3 text-left transition-colors"
        >
          <PinGlyph
            path={current.path}
            size={36}
            color={color}
            defaultColor="var(--color-surface-2)"
            imageUrl={imageUrl}
            ringColor="var(--color-primary)"
            ringWidth={2}
          />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{current.name}</span>
            <span className="text-fg-muted block text-xs">
              {current.own ? "Your shape" : "Built-in shape"}
            </span>
          </span>
          <ChevronsUpDown className="text-fg-muted size-4 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(23rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center gap-2 border-b p-2">
          <div className="relative min-w-0 flex-1">
            <Search className="text-fg-muted pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search shapes"
              aria-label="Search shapes"
              className="placeholder:text-fg-muted h-9 w-full bg-transparent pr-2 pl-8 text-sm outline-none"
            />
          </div>
          {onNew && (
            <button
              type="button"
              onClick={() => (close(), onNew())}
              className="bg-primary text-primary-foreground flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold"
            >
              <Plus className="size-3.5" /> New shape
            </button>
          )}
        </div>
        <div
          className="max-h-80 space-y-4 overflow-y-auto p-2"
          role="radiogroup"
          aria-label="Pin shape"
        >
          {mine.length > 0 && (
            <section>
              <h4 className="text-fg-muted px-1 pb-1 text-[11px] font-semibold tracking-wide uppercase">
                Your shapes
              </h4>
              <div className="grid grid-cols-4 gap-1">
                {mine.map((shape) => (
                  <ShapeTile
                    key={shape.id}
                    shape={shape}
                    selected={value === shape.id}
                    color={color}
                    imageUrl={imageUrl}
                    onPick={() => (onChange(shape.id), close())}
                    onEdit={onEdit ? () => (close(), onEdit(shape.id)) : undefined}
                  />
                ))}
              </div>
            </section>
          )}
          {builtIn.length > 0 && (
            <section>
              <h4 className="text-fg-muted px-1 pb-1 text-[11px] font-semibold tracking-wide uppercase">
                Built-in
              </h4>
              <div className="grid grid-cols-4 gap-1">
                {builtIn.map((shape) => (
                  <ShapeTile
                    key={shape.id}
                    shape={shape}
                    selected={value === shape.id}
                    color={color}
                    imageUrl={imageUrl}
                    onPick={() => (onChange(shape.id), close())}
                  />
                ))}
              </div>
            </section>
          )}
          {onNew && (
            <Link
              href="/pins/shapes"
              className="text-fg-muted hover:text-fg block px-1 pb-1 text-center text-xs underline underline-offset-2"
            >
              Manage your shapes
            </Link>
          )}
          {mine.length === 0 && builtIn.length === 0 && (
            <p className="text-fg-muted px-3 py-8 text-center text-sm">
              No shape is called “{query.trim()}”.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
