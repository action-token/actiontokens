import type { ReactNode } from "react";

import { Switch } from "@actiontokens/ui/components/switch";
import { cn } from "@actiontokens/ui/lib/cn";

/** Small building blocks of the website-map editor. */

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3">
      <h2 className="text-fg-muted text-xs font-semibold tracking-wider uppercase">{title}</h2>
      {children}
    </section>
  );
}

export function Toggle({
  title,
  hint,
  checked,
  onChange,
}: {
  title: string;
  hint: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border p-3">
      <span className="flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="text-fg-muted block text-xs">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <div className="bg-surface-2 flex gap-1 rounded-xl border p-1">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={cn(
            "flex-1 rounded-lg px-2 py-1.5 text-xs",
            value === option.id ? "bg-surface font-medium shadow-sm" : "text-fg-muted",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
