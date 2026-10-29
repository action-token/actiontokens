import type { LucideIcon } from "lucide-react";
import type { FormEvent, ReactNode } from "react";

import { Label } from "../components/label";
import { Switch } from "../components/switch";
import { cn } from "../lib/cn";
import { PageBody, PageHeader } from "./page-header";

/**
 * The frame of every create and edit page. Desktop: the form on the left and a
 * sticky side column (preview, summary) on the right, with the actions beside
 * the title. Phones: one column with the actions pinned above the tab bar.
 */
export function FormPage({
  title,
  eyebrow,
  description,
  back,
  aside,
  actions,
  children,
  onSubmit,
}: {
  title: ReactNode;
  eyebrow?: string;
  description?: string;
  back: { href: string; label: string };
  aside?: ReactNode;
  actions: ReactNode;
  children: ReactNode;
  onSubmit?: (event: FormEvent) => void;
}) {
  return (
    <form onSubmit={onSubmit} noValidate>
      <PageBody wide className="grid gap-6 pb-40 lg:pb-12">
        <PageHeader
          title={title}
          eyebrow={eyebrow}
          description={description}
          back={back}
          actions={<div className="hidden items-center gap-2 lg:flex">{actions}</div>}
        />
        <div className={cn("grid gap-6", aside && "lg:grid-cols-[minmax(0,1fr)_380px]")}>
          <div className="min-w-0 space-y-5">{children}</div>
          {aside && <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">{aside}</aside>}
        </div>
      </PageBody>
      <div className="bg-surface fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-30 flex items-center justify-end gap-2 border-t-2 px-4 py-3 sm:bottom-0 sm:left-[72px] sm:pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden">
        {actions}
      </div>
    </form>
  );
}

/** One titled block of a form page. */
export function FormSection({
  title,
  description,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("bg-surface border-fg/10 rounded-[1.4rem] border-2 p-5", className)}>
      <div className="mb-4">
        <h2 className="display flex items-center gap-2.5 text-2xl">
          {Icon && (
            <span className="bg-primary text-primary-foreground flex size-8 shrink-0 -rotate-6 items-center justify-center rounded-lg">
              <Icon className="size-4" strokeWidth={2.4} />
            </span>
          )}
          {title}
        </h2>
        {description && <div className="text-fg-muted mt-1 text-sm">{description}</div>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/** Label, control and message, the same everywhere. `action` sits at the end of the label row (the AI button). */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  action,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string | null;
  hint?: ReactNode;
  required?: boolean;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid content-start gap-1.5">
      <div className="flex min-h-7 items-center justify-between gap-2">
        <Label htmlFor={htmlFor}>
          {label}
          {required && <span className="text-danger ml-0.5">*</span>}
        </Label>
        {action}
      </div>
      {children}
      {error ? (
        <p role="alert" className="text-danger text-xs">
          {error}
        </p>
      ) : hint ? (
        <p className="text-fg-faint text-xs">{hint}</p>
      ) : null}
    </div>
  );
}

/** A bordered group of on/off options; each row is a SwitchRow, optionally with its own fields below. */
export function OptionList({ children }: { children: ReactNode }) {
  return <div className="divide-y rounded-lg border">{children}</div>;
}

export function SwitchRow({
  icon: Icon,
  title,
  hint,
  checked,
  onChange,
  disabled,
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Shown while the switch is on */
  children?: ReactNode;
}) {
  return (
    <div>
      <label className={cn("flex cursor-pointer items-center gap-3 p-4", disabled && "cursor-not-allowed opacity-60")}>
        <Icon className="text-primary-text size-4 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{title}</span>
          <span className="text-fg-muted block text-xs">{hint}</span>
        </span>
        <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
      </label>
      {checked && children && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}
