"use client";

import { ChevronDown, MousePointerClick, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";

import { BLOCK_DEFS, type Block } from "@actiontokens/page/blocks";
import { DENSITIES, FONT_PAIRS, RADII, type PageTheme } from "@actiontokens/page/theme";
import { Button } from "@actiontokens/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@actiontokens/ui/components/dropdown-menu";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@actiontokens/ui/components/popover";
import { cn } from "@actiontokens/ui/lib/cn";

import { BLOCK_ICON } from "./block-picker";

const ACCENTS = ["#4dff2a", "#39ff88", "#ff5d73", "#1d4ed8", "#ea580c", "#7c3aed", "#0f172a"];

const chip =
  "hover:bg-surface-2 data-[state=open]:bg-surface-2 inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors";

/**
 * The bar over the preview: the whole page's look (accent, font, corners, spacing) as
 * small menus, and on the right the selected block, whose settings drop down under the
 * bar (`settings`). It closes with Esc or a click outside; clicking in the preview
 * leaves it open, so picking another block there just swaps what it shows.
 */
export function StyleBar({
  theme,
  onTheme,
  block,
  open,
  onOpenChange,
  settings,
}: {
  theme: PageTheme;
  onTheme: (theme: PageTheme) => void;
  block: Block | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The selected block's settings */
  settings: ReactNode;
}) {
  const set = <K extends keyof PageTheme>(key: K, value: PageTheme[K]) =>
    onTheme({ ...theme, [key]: value });
  const Icon = block ? BLOCK_ICON[block.type] : null;

  return (
    <Popover open={open && block !== null} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <div className="bg-background/90 sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b px-3 py-2 backdrop-blur">
          <span className="text-fg-faint mr-1 hidden text-[11px] font-semibold tracking-wider uppercase xl:inline">
            Page style
          </span>

          <Popover>
            <PopoverTrigger className={chip} aria-label="Accent colour">
              <span
                className="size-4 rounded-full border border-black/10"
                style={{ background: theme.accent }}
              />
              Accent
              <ChevronDown className="text-fg-muted size-3.5" />
            </PopoverTrigger>
            <PopoverContent align="start" className="grid w-auto gap-2 p-3">
              <div className="flex flex-wrap items-center gap-2">
                {ACCENTS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Accent ${color}`}
                    aria-pressed={theme.accent.toLowerCase() === color}
                    onClick={() => set("accent", color)}
                    className={cn(
                      "size-7 rounded-full border-2",
                      theme.accent.toLowerCase() === color
                        ? "border-foreground"
                        : "border-transparent",
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
            </PopoverContent>
          </Popover>

          <Choice
            label="Font"
            value={theme.fontPair}
            options={FONT_PAIRS}
            onChange={(value) => set("fontPair", value)}
          />
          <Choice
            label="Corners"
            value={theme.radius}
            options={RADII}
            onChange={(value) => set("radius", value)}
          />
          <Choice
            label="Spacing"
            value={theme.density}
            options={DENSITIES}
            onChange={(value) => set("density", value)}
          />

          <div className="ml-auto">
            {block && Icon ? (
              <PopoverTrigger asChild>
                <Button variant={open ? "default" : "outline"} className="h-9 rounded-full">
                  <Icon /> {BLOCK_DEFS[block.type].label}
                  <SlidersHorizontal />
                </Button>
              </PopoverTrigger>
            ) : (
              <span className="text-fg-muted hidden items-center gap-1.5 text-xs sm:flex">
                <MousePointerClick className="size-3.5" /> Click a block in the preview to edit it
              </span>
            )}
          </div>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="end"
        sideOffset={6}
        collisionPadding={12}
        // Keep focus on the page, and stay open when the preview (an iframe) takes focus.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onFocusOutside={(event) => event.preventDefault()}
        className="max-h-[min(72dvh,var(--radix-popover-content-available-height))] w-[min(26rem,calc(100vw-1.5rem))] overflow-y-auto rounded-2xl p-0 shadow-xl"
      >
        {settings}
      </PopoverContent>
    </Popover>
  );
}

/** One page-style setting as a small menu: "Font: Action Tokens ▾". */
function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={chip}>
        <span className="text-fg-muted">{label}</span>
        <b className="font-semibold">{options.find((option) => option.value === value)?.label}</b>
        <ChevronDown className="text-fg-muted size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-40">
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(next as T)}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
