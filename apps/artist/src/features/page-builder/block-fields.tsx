"use client";

import { Plus, Trash2 } from "lucide-react";

import type { FieldDef } from "@bandcoin/page/blocks";
import { Button } from "@bandcoin/ui/components/button";
import { Input } from "@bandcoin/ui/components/input";
import { Label } from "@bandcoin/ui/components/label";
import { Switch } from "@bandcoin/ui/components/switch";
import { Textarea } from "@bandcoin/ui/components/textarea";

import { FileField } from "../catalog/file-field";
import { Segmented } from "../embeds/embed-fields";

type Row = Record<string, unknown>;

/** What names a row in a list (a link's label, a member's name), if the artist has typed one. */
const rowTitle = (row: Row, key: string | undefined) => {
  const value = key ? row[key] : undefined;
  return typeof value === "string" ? value.trim() : "";
};

/** The most rows a list holds in the editor (the page keeps the first valid ones up to its own limit). */
const MAX_ROWS = 12;

/**
 * One setting of a block, drawn from its field description. Text, numbers,
 * toggles, choices, images and repeatable rows (links, videos, members) cover
 * every block, so a new block type needs no new editor code.
 */
export function BlockField({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const id = `field-${field.key}`;

  if (field.kind === "toggle") {
    return (
      <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
        <span>{field.label}</span>
        <Switch checked={value !== false} onCheckedChange={onChange} />
      </label>
    );
  }

  if (field.kind === "list")
    return (
      <ListField
        field={field}
        rows={Array.isArray(value) ? (value as Row[]) : []}
        onChange={onChange}
      />
    );

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {field.label}
      </Label>
      {field.kind === "text" && (
        <Input
          id={id}
          value={typeof value === "string" ? value : ""}
          maxLength={field.max}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {field.kind === "textarea" && (
        <Textarea
          id={id}
          rows={6}
          value={typeof value === "string" ? value : ""}
          maxLength={field.max}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {field.kind === "number" && (
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          className="num max-w-28"
          min={field.min}
          max={field.max}
          value={typeof value === "number" ? value : ""}
          onChange={(event) =>
            onChange(event.target.value === "" ? undefined : Number(event.target.value))
          }
        />
      )}
      {field.kind === "select" && (
        <Segmented
          value={typeof value === "string" ? value : (field.options?.[0]?.value ?? "")}
          onChange={onChange}
          options={(field.options ?? []).map((option) => ({
            id: option.value,
            label: option.label,
          }))}
        />
      )}
      {field.kind === "image" && (
        <FileField
          id={id}
          accept="image/*"
          preview
          value={
            typeof value === "string" && value
              ? { url: value, name: "Photo", mime: "image/*" }
              : null
          }
          onChange={(file) => onChange(file?.url ?? undefined)}
        />
      )}
      {field.help && <p className="text-fg-muted text-xs">{field.help}</p>}
      {field.kind === "text" &&
        field.max &&
        typeof value === "string" &&
        value.length > field.max - 10 && (
          <p className="text-fg-muted num text-right text-[11px]">
            {value.length}/{field.max}
          </p>
        )}
    </div>
  );
}

function ListField({
  field,
  rows,
  onChange,
}: {
  field: FieldDef;
  rows: Row[];
  onChange: (rows: Row[]) => void;
}) {
  const subfields = field.fields ?? [];
  const update = (index: number, key: string, value: unknown) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, [key]: value } : row)));

  return (
    <div className="grid gap-2">
      <Label className="text-xs">{field.label}</Label>
      {rows.map((row, index) => (
        <div key={index} className="bg-surface-2 grid gap-3 rounded-xl border p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs font-semibold">
              {rowTitle(row, field.titleKey) || `${field.label.replace(/s$/, "")} ${index + 1}`}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-danger"
              aria-label="Remove"
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            >
              <Trash2 />
            </Button>
          </div>
          {subfields.map((sub) => (
            <BlockField
              key={sub.key}
              field={{ ...sub, key: `${field.key}-${index}-${sub.key}` }}
              value={row[sub.key]}
              onChange={(value) => update(index, sub.key, value)}
            />
          ))}
        </div>
      ))}
      {rows.length < MAX_ROWS && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="justify-self-start"
          onClick={() => onChange([...rows, {}])}
        >
          <Plus /> {field.addLabel ?? "Add"}
        </Button>
      )}
    </div>
  );
}
