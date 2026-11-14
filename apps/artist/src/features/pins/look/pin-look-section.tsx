"use client";

import { Image as ImageIcon, Pencil, RotateCcw, Shapes } from "lucide-react";
import { useRef, useState } from "react";

import { BUILTIN_SHAPES, isBuiltinShape } from "@bandcoin/ar-core/pin-look";
import { Label } from "@bandcoin/ui/components/label";
import { Switch } from "@bandcoin/ui/components/switch";
import { cn } from "@bandcoin/ui/lib/cn";
import { FormSection } from "@bandcoin/ui/patterns/form-page";
import { PinGlyph } from "@bandcoin/ui/patterns/pin-glyph";
import { RangeField } from "@bandcoin/ui/patterns/range-field";
import { Segmented } from "@bandcoin/ui/patterns/segmented";

import { api } from "~/trpc/react";

import { ShapeStudio } from "../studio/shape-studio";
import type { PinLookValue } from "./look-value";
import { ShapePicker } from "./shape-picker";

const SWATCHES = [
  "#22c55e",
  "#0ea5e9",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#111827",
];

const PRIMARY = "var(--color-primary)";
const MUTED = "var(--color-surface-2)";

const STATES = [
  { label: "Live", ring: PRIMARY, className: "" },
  { label: "All collected", ring: "var(--color-info)", className: "opacity-80" },
  { label: "Ended", ring: "var(--color-fg-faint)", className: "opacity-40 grayscale" },
] as const;

/** The artist's own shapes (Pin Studio). */
export function useOwnShapes() {
  return api.shapes.list.useQuery(undefined, { staleTime: 60_000 });
}

/**
 * How a look draws right now: its outline, where it touches the map, and what fills it. The
 * preview and the form's location map both use this, so they always show the same pin.
 */
export function usePinLookGlyph(
  value: PinLookValue,
  {
    autoCollect,
    pinImage,
    artistImage,
  }: {
    autoCollect: boolean;
    pinImage?: string | null;
    artistImage: string | null;
  },
) {
  const shapes = useOwnShapes();
  const custom = shapes.data?.find((shape) => shape.id === value.shape);
  const builtin = isBuiltinShape(value.shape) ? BUILTIN_SHAPES[value.shape] : null;
  const path = builtin?.path ?? custom?.path ?? BUILTIN_SHAPES.circle.path;
  const anchor: "center" | "bottom" =
    (builtin?.anchor ?? custom?.anchor) === "bottom" ? "bottom" : "center";
  const imageUrl =
    value.fill === "NONE"
      ? null
      : value.fill === "PIN"
        ? pinImage?.length
          ? pinImage
          : artistImage
        : artistImage;
  return {
    shapes,
    custom,
    missingCustom: !builtin && !custom && shapes.isSuccess,
    path,
    anchor,
    imageUrl,
    color: value.color ?? null,
    badge: autoCollect && value.autoBadge,
  };
}

/** The pin as it will sit on the map, and where it touches it, for a form's location picker. */
export function usePinLookMarker(value: PinLookValue, opts: Parameters<typeof usePinLookGlyph>[1]) {
  const glyph = usePinLookGlyph(value, opts);
  const marker = (
    <PinGlyph
      path={glyph.path}
      size={44}
      color={glyph.color}
      defaultColor={MUTED}
      imageUrl={glyph.imageUrl}
      imageFit={value.imageFit}
      ringColor={PRIMARY}
      ringWidth={2.5}
      badge={glyph.badge}
    />
  );
  return { marker, anchor: glyph.anchor, glyph };
}

export type PinLookProps = {
  value: PinLookValue;
  onChange: (next: PinLookValue) => void;
  autoCollect: boolean;
  /** The pin's own image, if it has one yet. */
  pinImage?: string | null;
  /** The artist's picture. */
  artistImage: string | null;
};

/** "Pin look" as a form section. */
export function PinLookSection({ tab, ...props }: PinLookProps & { tab?: string }) {
  return (
    <FormSection
      tab={tab}
      title="Pin look"
      icon={Shapes}
      description="How the pin shows on the map. Fans see exactly this."
    >
      <PinLookEditor {...props} />
    </FormSection>
  );
}

/**
 * The shape, what fills it, the colour, how the picture sits, and the ⚡ badge, with a live
 * preview of the marker as fans will see it.
 */
export function PinLookEditor({
  value,
  onChange,
  autoCollect,
  pinImage,
  artistImage,
}: PinLookProps) {
  const { shapes, custom, missingCustom, path, imageUrl, color, badge } = usePinLookGlyph(value, {
    autoCollect,
    pinImage,
    artistImage,
  });
  // Pin Studio opens over the form, so nothing filled in here is lost.
  const [studio, setStudio] = useState<{ open: boolean; editId: string | null }>({
    open: false,
    editId: null,
  });
  const set = (patch: Partial<PinLookValue>) => onChange({ ...value, ...patch });
  const fit = value.imageFit ?? { zoom: 1, x: 0, y: 0 };

  // Drag the big preview to move the picture inside the shape (once zoomed in).
  const drag = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null);
  const PREVIEW = 120;
  const onPointerDown = (event: React.PointerEvent) => {
    if (!imageUrl || fit.zoom <= 1) return;
    (event.target as HTMLElement).setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, fx: fit.x, fy: fit.y };
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const start = drag.current;
    if (!start) return;
    const room = (fit.zoom - 1) * 50; // box units the picture can move each way
    const perPx = 100 / PREVIEW / room;
    const clamp = (n: number) => Math.max(-1, Math.min(1, n));
    set({
      imageFit: {
        zoom: fit.zoom,
        x: clamp(start.fx + (event.clientX - start.x) * perPx),
        y: clamp(start.fy + (event.clientY - start.y) * perPx),
      },
    });
  };
  const endDrag = () => (drag.current = null);

  const fillOptions = [
    { id: "ARTIST", label: "Your picture" },
    {
      id: "PIN",
      label: "Pin picture",
      disabled: !pinImage,
      title: pinImage ? undefined : "Add a cover image to this pin to use it here",
    },
    { id: "NONE", label: "None" },
  ] as const;
  const fillHint = {
    ARTIST: "Your profile picture",
    PIN: "This pin's cover image",
    NONE: "Just the shape",
  };

  return (
    <div className="grid gap-5 @2xl:grid-cols-[13rem_minmax(0,1fr)]">
      {/* Preview: stays in view beside the controls, so every change shows at once */}
      <div className="bg-surface-2 flex items-center gap-5 self-start rounded-2xl border p-4 @2xl:sticky @2xl:top-4 @2xl:flex-col @2xl:gap-4">
        <div
          className={cn(
            "relative shrink-0 touch-none select-none",
            imageUrl && fit.zoom > 1 && "cursor-grab active:cursor-grabbing",
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          title={imageUrl && fit.zoom > 1 ? "Drag to move the picture" : undefined}
        >
          <PinGlyph
            path={path}
            size={PREVIEW}
            color={color}
            defaultColor={MUTED}
            imageUrl={imageUrl}
            imageFit={value.imageFit}
            ringColor={PRIMARY}
            ringWidth={3}
            badge={badge}
          />
        </div>
        <div className="min-w-0 space-y-2">
          <div className="flex items-end gap-3">
            {STATES.map((state) => (
              <div key={state.label} className="flex flex-col items-center gap-1">
                <PinGlyph
                  path={path}
                  size={36}
                  color={color}
                  defaultColor={MUTED}
                  imageUrl={imageUrl}
                  imageFit={value.imageFit}
                  ringColor={state.ring}
                  badge={badge && state.label === "Live"}
                  className={state.className}
                />
                <span className="text-fg-muted text-[10px]">{state.label}</span>
              </div>
            ))}
          </div>
          <p className="text-fg-muted text-xs">What fans see on the map.</p>
        </div>
      </div>

      {/* Controls */}
      <div className="min-w-0 space-y-5">
        {missingCustom && (
          <p className="text-warning text-xs">
            This pin&apos;s shape isn&apos;t available any more, so it shows as a circle. Choose
            another.
          </p>
        )}

        <ControlGroup title="Shape">
          <ShapePicker
            value={value.shape}
            own={shapes.data ?? []}
            onChange={(shape) => set({ shape })}
            onNew={() => setStudio({ open: true, editId: null })}
            onEdit={(id) => setStudio({ open: true, editId: id })}
            color={color}
            imageUrl={imageUrl}
          />
          {custom && (
            <button
              type="button"
              onClick={() => setStudio({ open: true, editId: custom.id })}
              className="text-fg-muted hover:text-fg flex items-center gap-1.5 text-xs"
            >
              <Pencil className="size-3" /> Edit “{custom.name}” in Pin Studio
            </button>
          )}
        </ControlGroup>

        <ControlGroup title="Picture inside" hint={fillHint[value.fill]}>
          <Segmented
            label="Picture inside the shape"
            value={value.fill}
            options={fillOptions}
            onChange={(fill) => set({ fill })}
          />
          {imageUrl && (
            <RangeField
              label={
                <span className="flex items-center gap-1.5 text-xs">
                  <ImageIcon className="size-3.5" /> Zoom the picture
                </span>
              }
              action={
                value.imageFit && (
                  <button
                    type="button"
                    className="text-fg-muted hover:text-fg flex items-center gap-1 text-xs"
                    onClick={() => set({ imageFit: null })}
                  >
                    <RotateCcw className="size-3" /> Reset
                  </button>
                )
              }
              min={1}
              max={3}
              step={0.05}
              value={fit.zoom}
              onChange={(zoom) =>
                set({ imageFit: zoom <= 1 ? null : { zoom, x: fit.x, y: fit.y } })
              }
              left="Fit"
              right="Zoomed in: drag the preview to move it"
            />
          )}
        </ControlGroup>

        <ControlGroup title="Colour" hint={imageUrl ? "Colours the outline" : "Colours the shape"}>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => set({ color: null })}
              className={cn(
                "h-6 rounded-full border px-2.5 text-xs",
                value.color === null ? "border-primary bg-primary/10" : "hover:border-line-bright",
              )}
            >
              Default
            </button>
            {SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={`Colour ${swatch}`}
                aria-pressed={value.color === swatch}
                onClick={() => set({ color: swatch })}
                className={cn(
                  "size-6 rounded-full border-2 transition-transform hover:scale-110",
                  value.color === swatch ? "border-fg ring-primary/40 ring-2" : "border-white/70",
                )}
                style={{ background: swatch }}
              />
            ))}
            <label
              title="Custom colour"
              className={cn(
                "relative block size-6 cursor-pointer overflow-hidden rounded-full border-2 transition-transform hover:scale-110",
                value.color && !SWATCHES.includes(value.color)
                  ? "border-fg ring-primary/40 ring-2"
                  : "border-white/70",
              )}
              style={{
                background:
                  value.color && !SWATCHES.includes(value.color)
                    ? value.color
                    : "conic-gradient(#ef4444, #eab308, #22c55e, #0ea5e9, #a855f7, #ef4444)",
              }}
            >
              <span className="sr-only">Custom colour</span>
              <input
                type="color"
                className="absolute inset-0 size-full cursor-pointer opacity-0"
                value={value.color ?? "#22c55e"}
                onChange={(event) => set({ color: event.target.value.toLowerCase() })}
              />
            </label>
          </div>
        </ControlGroup>

        <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
          <div>
            <Label htmlFor="look-badge" className="text-sm font-semibold">
              ⚡ Auto-collect badge
            </Label>
            <p className="text-fg-muted text-xs">
              {autoCollect
                ? "Lets fans tell auto-collect pins apart."
                : "Only shown on auto-collect pins."}
            </p>
          </div>
          <Switch
            id="look-badge"
            checked={autoCollect && value.autoBadge}
            disabled={!autoCollect}
            onCheckedChange={(checked) => set({ autoBadge: checked })}
          />
        </div>
      </div>

      <ShapeStudio
        open={studio.open}
        onOpenChange={(open) => setStudio((state) => ({ ...state, open }))}
        editing={
          studio.editId ? (shapes.data?.find((shape) => shape.id === studio.editId) ?? null) : null
        }
        artistImage={artistImage}
        onSaved={(shape) => set({ shape: shape.id })}
      />
    </div>
  );
}

/** A labelled group of controls in the pin look editor. */
function ControlGroup({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-sm font-semibold">{title}</h4>
        {hint && <span className="text-fg-muted text-xs">{hint}</span>}
      </div>
      {children}
    </section>
  );
}
