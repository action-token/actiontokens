"use client";

import { ChevronDown, LayoutTemplate, MapPin, Settings2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { PinTemplateFormType } from "@bandcoin/ar-core/pin-template";
import { Button } from "@bandcoin/ui/components/button";
import { Popover, PopoverContent, PopoverTrigger } from "@bandcoin/ui/components/popover";
import { cn } from "@bandcoin/ui/lib/cn";

import { api, type RouterOutputs } from "~/trpc/react";

export type TemplateRow = RouterOutputs["templates"]["list"][number];
export type PinTemplateRow = Extract<TemplateRow, { formType: "PIN" }>;
export type HotspotTemplateRow = Extract<TemplateRow, { formType: "HOTSPOT" }>;

/** A template's picture: its pin picture, or a plain tile. */
export function TemplateThumb({
  template,
  className,
}: {
  template: TemplateRow;
  className?: string;
}) {
  const image = template.data.imageUrl;
  return (
    <span
      className={cn(
        "bg-surface-2 text-fg-muted relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border",
        className,
      )}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="size-full object-cover" />
      ) : (
        <LayoutTemplate className="size-4" />
      )}
      {template.hasLocation && (
        <span
          className="bg-primary text-primary-foreground absolute right-0.5 bottom-0.5 flex size-4 items-center justify-center rounded-full"
          title={template.formType === "PIN" ? "Includes a location" : "Includes an area"}
        >
          <MapPin className="size-2.5" />
        </span>
      )}
    </span>
  );
}

/** "Start from template ▾": your templates of this kind; picking one calls `onPick`. */
export function TemplatePicker({
  formType,
  onPick,
  className,
  label = "Start from template",
}: {
  formType: PinTemplateFormType;
  onPick: (template: TemplateRow) => void;
  className?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const list = api.templates.list.useQuery({ formType }, { enabled: open, staleTime: 30_000 });
  const rows = list.data ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className={className}>
          <LayoutTemplate /> <span className="hidden sm:inline">{label}</span>
          <ChevronDown className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,340px)] p-1.5">
        {list.isPending ? (
          <p className="text-fg-muted p-3 text-sm">Loading templates…</p>
        ) : list.isError ? (
          <p className="text-danger p-3 text-sm">Couldn&apos;t load templates.</p>
        ) : rows.length === 0 ? (
          <div className="p-3 text-sm">
            <p className="font-medium">No templates yet</p>
            <p className="text-fg-muted mt-1 text-xs">
              Fill in this form and choose <strong>Save as template</strong> to reuse it later.
            </p>
          </div>
        ) : (
          <ul className="max-h-80 overflow-y-auto">
            {rows.map((template) => (
              <li key={template.id}>
                <button
                  type="button"
                  className="hover:bg-surface-2 flex w-full items-center gap-3 rounded-xl p-2 text-left"
                  onClick={() => {
                    setOpen(false);
                    onPick(template);
                  }}
                >
                  <TemplateThumb template={template} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{template.name}</span>
                    <span className="text-fg-muted block truncate text-xs">
                      {template.data.title ?? "Untitled"}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/pins/templates"
          className="text-fg-muted hover:text-fg mt-1 flex items-center gap-2 border-t px-3 pt-2.5 pb-1.5 text-xs"
          onClick={() => setOpen(false)}
        >
          <Settings2 className="size-3.5" /> Manage templates
        </Link>
      </PopoverContent>
    </Popover>
  );
}
